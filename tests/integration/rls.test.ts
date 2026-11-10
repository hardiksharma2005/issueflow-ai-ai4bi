// Integration tests against a REAL Supabase project: verifies that Row Level Security,
// triggers and database functions enforce authorization regardless of the UI.
// Skipped automatically when Supabase credentials are not configured.
//
// Run: npm run test:integration   (requires migrations applied; creates and deletes its own data)

import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const enabled = Boolean(url && anon && service);

const run = `${Date.now().toString(36)}`;
const PASSWORD = `Test-${run}-pw!`;

describe.skipIf(!enabled)("Row Level Security & database guardrails", () => {
  let admin: SupabaseClient;
  const users: Record<"mgr" | "mem" | "outsider", { id: string; client: SupabaseClient }> = {} as never;
  let projectA = "";
  let projectB = "";
  let issueAssigned = "";
  let issueOther = "";

  async function signIn(email: string) {
    const c = createClient(url!, anon!, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    return c;
  }

  beforeAll(async () => {
    admin = createClient(url!, service!, { auth: { persistSession: false } });
    for (const [key, role] of [["mgr", "manager"], ["mem", "member"], ["outsider", "member"]] as const) {
      const email = `rls-${key}-${run}@issueflow.example`;
      const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: `RLS ${key}` } });
      if (error) throw error;
      await admin.from("profiles").update({ role }).eq("id", data.user.id);
      users[key] = { id: data.user.id, client: await signIn(email) };
    }
    const a = await admin.from("projects").insert({ key: `RA${run.slice(-6).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`.slice(0, 10), name: "RLS A", is_demo: true }).select("id").single();
    const b = await admin.from("projects").insert({ key: `RB${run.slice(-6).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`.slice(0, 10), name: "RLS B", is_demo: true }).select("id").single();
    if (a.error || b.error) throw a.error ?? b.error;
    projectA = a.data.id;
    projectB = b.data.id;
    await admin.from("project_members").insert([
      { project_id: projectA, user_id: users.mgr.id },
      { project_id: projectA, user_id: users.mem.id },
      { project_id: projectB, user_id: users.outsider.id },
    ]);
    const i1 = await admin.from("issues").insert({ project_id: projectA, title: "Assigned to member", assignee_id: users.mem.id }).select("id").single();
    const i2 = await admin.from("issues").insert({ project_id: projectA, title: "Not assigned" }).select("id").single();
    issueAssigned = i1.data!.id;
    issueOther = i2.data!.id;
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("projects").delete().in("id", [projectA, projectB].filter(Boolean));
    for (const u of Object.values(users)) if (u?.id) await admin.auth.admin.deleteUser(u.id);
  });

  it("anonymous users can read nothing", async () => {
    const anonClient = createClient(url!, anon!, { auth: { persistSession: false } });
    const { data } = await anonClient.from("issues").select("id").limit(1);
    expect(data ?? []).toHaveLength(0);
    const { error } = await anonClient.rpc("search_all", { p_query: "test" });
    expect(error).not.toBeNull();
  });

  it("members only see projects they belong to", async () => {
    const { data } = await users.mem.client.from("projects").select("id");
    const ids = (data ?? []).map((p) => p.id);
    expect(ids).toContain(projectA);
    expect(ids).not.toContain(projectB);
    const { data: other } = await users.outsider.client.from("issues").select("id").eq("project_id", projectA);
    expect(other).toHaveLength(0);
  });

  it("members cannot escalate their own role", async () => {
    const { error } = await users.mem.client.from("profiles").update({ role: "admin" }).eq("id", users.mem.id);
    expect(error?.message).toMatch(/Only admins can change roles/);
  });

  it("members cannot create issues or projects", async () => {
    const issue = await users.mem.client.from("issues").insert({ project_id: projectA, title: "nope" });
    expect(issue.error).not.toBeNull();
    const project = await users.mem.client.from("projects").insert({ key: "NOPE", name: "nope", created_by: users.mem.id });
    expect(project.error).not.toBeNull();
  });

  it("members can change status of assigned issues only — and nothing else", async () => {
    const ok = await users.mem.client.from("issues").update({ status: "in_progress" }).eq("id", issueAssigned).select("id");
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);

    const notAssigned = await users.mem.client.from("issues").update({ status: "closed" }).eq("id", issueOther).select("id");
    expect(notAssigned.data ?? []).toHaveLength(0);

    const otherField = await users.mem.client.from("issues").update({ priority: "critical" }).eq("id", issueAssigned);
    expect(otherField.error?.message).toMatch(/Members can only change the status/);
  });

  it("managers can create and assign issues in their projects, but not elsewhere", async () => {
    const created = await users.mgr.client.from("issues").insert({ project_id: projectA, title: "Manager issue", assignee_id: users.mem.id }).select("id, number").single();
    expect(created.error).toBeNull();
    expect(created.data!.number).toBeGreaterThan(0);
    const elsewhere = await users.mgr.client.from("issues").insert({ project_id: projectB, title: "x" });
    expect(elsewhere.error).not.toBeNull();
    const badAssignee = await users.mgr.client.from("issues").insert({ project_id: projectA, title: "x", assignee_id: users.outsider.id });
    expect(badAssignee.error?.message).toMatch(/Assignee must be a member/);
  });

  it("records activity history and audit logs", async () => {
    const { data: activity } = await users.mem.client.from("issue_activity").select("action").eq("issue_id", issueAssigned);
    expect((activity ?? []).map((a) => a.action)).toContain("status_changed");
    const { data: audit } = await admin.from("audit_logs").select("action").eq("entity_id", issueAssigned);
    expect((audit ?? []).map((a) => a.action)).toContain("issues.update");
    const memberAudit = await users.mem.client.from("audit_logs").select("id").limit(1);
    expect(memberAudit.data ?? []).toHaveLength(0);
  });

  it("only allows whitelisted audit events from clients", async () => {
    const { error } = await users.mem.client.rpc("log_audit_event", { p_action: "issues.delete", p_details: {} });
    expect(error).not.toBeNull();
  });

  it("draft approval enforces review permissions and is single-use", async () => {
    const imp = await admin.from("imports").insert({ project_id: projectA, status: "review" }).select("id").single();
    const draft = await admin
      .from("issue_drafts")
      .insert({ import_id: imp.data!.id, project_id: projectA, title: "Draft", ai_provider: "mock", ai_model: "m", is_simulated: true })
      .select("id")
      .single();
    const args = { p_draft_id: draft.data!.id, p_title: "Approved draft", p_description: "", p_category: "bug", p_priority: "high" };

    const byMember = await users.mem.client.rpc("approve_issue_draft", args);
    expect(byMember.error).not.toBeNull();
    const memberSees = await users.mem.client.from("issue_drafts").select("id").eq("id", draft.data!.id);
    expect(memberSees.data ?? []).toHaveLength(0);

    const byManager = await users.mgr.client.rpc("approve_issue_draft", args);
    expect(byManager.error).toBeNull();
    const again = await users.mgr.client.rpc("approve_issue_draft", args);
    expect(again.error?.message).toMatch(/already been reviewed/);
    const { data: impAfter } = await admin.from("imports").select("status").eq("id", imp.data!.id).single();
    expect(impAfter!.status).toBe("completed");
  });

  it("prevents importing the same conversation twice", async () => {
    const first = await admin.from("imports").insert({ project_id: projectA, status: "parsed", content_hash: `hash-${run}` });
    expect(first.error).toBeNull();
    const second = await admin.from("imports").insert({ project_id: projectA, status: "parsed", content_hash: `hash-${run}` });
    expect(second.error?.code).toBe("23505");
  });

  it("search only returns rows the caller may see", async () => {
    const { data } = await users.outsider.client.rpc("search_all", { p_query: "Assigned to member" });
    expect(data ?? []).toHaveLength(0);
    const { data: own } = await users.mem.client.rpc("search_all", { p_query: "Assigned to member" });
    expect((own ?? []).length).toBeGreaterThan(0);
  });

  it("storage paths are scoped to project membership", async () => {
    const path = `${projectB}/issues/x/test.txt`;
    const { error } = await users.mem.client.storage.from("evidence").upload(path, new Blob(["hello"], { type: "text/plain" }));
    expect(error).not.toBeNull();
    const okPath = `${projectA}/issues/${issueAssigned}/rls-${run}.txt`;
    const ok = await users.mem.client.storage.from("evidence").upload(okPath, new Blob(["hello"], { type: "text/plain" }));
    expect(ok.error).toBeNull();
    const outsiderRead = await users.outsider.client.storage.from("evidence").download(okPath);
    expect(outsiderRead.error).not.toBeNull();
    await admin.storage.from("evidence").remove([okPath]);
  });
});
