// Demo data seed — run with: npm run db:seed
//
// Creates demo users, three demo projects (is_demo = true, so they are kept apart from
// real data and can be removed with --reset), realistic issues spread over the last
// ~45 days, comments, one completed past WhatsApp import, and real automation runs.
//
// Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_PASSWORD.
// Passwords are never hard-coded or committed.

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { parseWhatsAppChat } from "../../lib/whatsapp/parser";
import { normalizeSupabaseUrl } from "../../lib/env";
import { resilientFetch } from "../../lib/supabase/fetch";

config({ path: ".env.local" });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const password = process.env.DEMO_PASSWORD;
if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
if (!password || password.length < 8) throw new Error("Set DEMO_PASSWORD (min 8 characters) in .env.local");

const db = createClient(normalizeSupabaseUrl(url), serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: resilientFetch } });
const reset = process.argv.includes("--reset");

const DAY = 86_400_000;
const NOW = Date.now();
const ago = (days: number, hours = 10) => new Date(NOW - days * DAY + (hours - 12) * 3_600_000).toISOString();
const dateIn = (days: number) => new Date(NOW + days * DAY).toISOString().slice(0, 10);

function must<R extends { data: unknown; error: { message: string } | null }>(res: R, what: string): NonNullable<R["data"]> {
  if (res.error || res.data == null) throw new Error(`${what}: ${res.error?.message ?? "no data returned"}`);
  return res.data as NonNullable<R["data"]>;
}

/** For writes that return no rows: fail loudly on error only. */
function check(res: { error: { message: string } | null }, what: string) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
}

// ---------------------------------------------------------------------------
const USERS = [
  { key: "admin", email: "admin@issueflow.example", name: "Asha Verma", role: "admin" },
  { key: "manager", email: "manager@issueflow.example", name: "AI4BI Admin", role: "manager" },
  { key: "member", email: "member@issueflow.example", name: "Neha Singh", role: "member" },
  { key: "daniel", email: "daniel@issueflow.example", name: "Daniel Okafor", role: "member" },
  { key: "sara", email: "sara@issueflow.example", name: "Sara Lim", role: "member" },
] as const;
type UserKey = (typeof USERS)[number]["key"];

async function ensureUsers() {
  const ids = {} as Record<UserKey, string>;
  const existing = must(await db.auth.admin.listUsers({ perPage: 1000 }), "list users").users;
  for (const u of USERS) {
    let user = existing.find((e) => e.email === u.email);
    if (!user) {
      user = must(
        await db.auth.admin.createUser({ email: u.email, password, email_confirm: true, user_metadata: { full_name: u.name } }),
        `create ${u.email}`,
      ).user!;
    } else {
      must(await db.auth.admin.updateUserById(user.id, { password }), `reset password ${u.email}`);
    }
    ids[u.key] = user.id;
    // Service role has no auth.uid(), so the role-protection trigger allows this.
    must(await db.from("profiles").update({ full_name: u.name, role: u.role }).eq("id", user.id).select("id").single(), `profile ${u.email}`);
  }
  return ids;
}

interface SeedIssue {
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  assignee?: UserKey;
  reporter?: string;
  createdDaysAgo: number;
  resolvedDaysAgo?: number;
  updatedDaysAgo?: number;
  due?: number; // days from today (negative = overdue)
  comments?: [UserKey, string][];
}

const PROJECTS: {
  key: string;
  name: string;
  client: string;
  description: string;
  members: UserKey[];
  issues: SeedIssue[];
}[] = [
  {
    key: "BLOOM",
    name: "Bloom Retail — Online Store",
    client: "Bloom Retail Pvt Ltd",
    description: "Shopify-style e-commerce site and admin panel for a fashion retailer. Issues are mostly reported by the client team on WhatsApp.",
    members: ["admin", "manager", "daniel", "sara"],
    issues: [
      { title: "Search results show out-of-stock products first", description: "Products marked out of stock appear above in-stock items in site search results.", category: "bug", priority: "medium", status: "open", assignee: "daniel", reporter: "Sara Lim", createdDaysAgo: 12, updatedDaysAgo: 11, due: 3 },
      { title: "Homepage hero banner is blurry on retina screens", description: "The hero image is served at 1x resolution.", category: "ui_ux", priority: "low", status: "resolved", assignee: "sara", reporter: "Priya Shah", createdDaysAgo: 40, resolvedDaysAgo: 36 },
      { title: "Coupon code FESTIVE10 not applying at checkout", description: "Customers report the coupon is rejected as invalid although it is active in the admin panel.", category: "bug", priority: "high", status: "closed", assignee: "daniel", reporter: "Priya Shah", createdDaysAgo: 33, resolvedDaysAgo: 31, comments: [["daniel", "Coupon was restricted to a single collection by mistake. Fixed the rule."], ["manager", "Confirmed with the client, closing."]] },
      { title: "Order confirmation SMS sent twice", description: "Customers receive duplicate SMS for every order.", category: "bug", priority: "medium", status: "resolved", assignee: "daniel", reporter: "Arjun Mehta", createdDaysAgo: 26, resolvedDaysAgo: 21 },
      { title: "Add size guide to product pages", description: "Client requested a size guide modal on all apparel product pages.", category: "feature_request", priority: "medium", status: "in_progress", assignee: "sara", reporter: "Arjun Mehta", createdDaysAgo: 18, updatedDaysAgo: 2, due: 6, comments: [["sara", "Design approved, building the modal now."]] },
      { title: "Admin order list takes 12 seconds to load", description: "The orders page in the admin panel is very slow when filtering by date.", category: "performance", priority: "high", status: "blocked", assignee: "daniel", reporter: "Arjun Mehta", createdDaysAgo: 15, updatedDaysAgo: 9, due: -2, comments: [["daniel", "Blocked: waiting for the hosting provider to enable the read replica."]] },
      { title: "Footer links broken on mobile", description: "Privacy policy and returns links 404 on the mobile layout.", category: "bug", priority: "low", status: "in_review", assignee: "sara", reporter: "Priya Shah", createdDaysAgo: 7, updatedDaysAgo: 1, due: 2 },
      { title: "Customer charged twice for order #47110", description: "Refund requested; customer complained on Instagram.", category: "customer_complaint", priority: "critical", status: "resolved", assignee: "manager", reporter: "Meera Iyer", createdDaysAgo: 20, resolvedDaysAgo: 19, comments: [["manager", "Refund issued and customer contacted."]] },
      { title: "Wishlist icon misaligned in header", description: "Icon sits 4px lower than the cart icon.", category: "ui_ux", priority: "low", status: "open", reporter: "Sara Lim", createdDaysAgo: 4, due: 14 },
      { title: "Product reviews not showing on product page", description: "Reviews widget fails to load since the theme update.", category: "bug", priority: "high", status: "open", assignee: "daniel", reporter: "Priya Shah", createdDaysAgo: 2, due: 1 },
    ],
  },
  {
    key: "RVSD",
    name: "Riverside Office Fit-out",
    client: "Riverside Holdings",
    description: "Snag list and maintenance tracking for a 3-floor office fit-out. Site supervisors report problems with photos on WhatsApp.",
    members: ["admin", "manager", "member"],
    issues: [
      { title: "Water leaking from AC unit in meeting room 2B", description: "Ceiling stain growing below the cassette unit.", category: "maintenance", priority: "high", status: "resolved", assignee: "member", reporter: "Vikram Rao", createdDaysAgo: 30, resolvedDaysAgo: 27 },
      { title: "Lift stops between floors 2 and 3", description: "Lift halted twice this week; technician visit needed.", category: "maintenance", priority: "critical", status: "in_progress", assignee: "manager", reporter: "Vikram Rao", createdDaysAgo: 6, updatedDaysAgo: 1, due: 1, comments: [["manager", "Technician booked for tomorrow 9am."]] },
      { title: "Flickering lights in open-plan area", description: "Three LED panels flicker near the windows.", category: "maintenance", priority: "medium", status: "open", assignee: "member", reporter: "Kavita Nair", createdDaysAgo: 14, updatedDaysAgo: 13, due: -4 },
      { title: "Glass partition door does not close fully", description: "Door to the boardroom stays 2cm open.", category: "maintenance", priority: "low", status: "closed", assignee: "member", reporter: "Kavita Nair", createdDaysAgo: 38, resolvedDaysAgo: 30 },
      { title: "Furniture delivery delayed by supplier", description: "Workstations for floor 3 delayed by one week.", category: "operations", priority: "high", status: "blocked", assignee: "manager", reporter: "Vikram Rao", createdDaysAgo: 10, updatedDaysAgo: 8, due: -1 },
      { title: "Paint touch-ups needed in reception", description: "Scuff marks after furniture installation.", category: "maintenance", priority: "low", status: "in_review", assignee: "member", reporter: "Kavita Nair", createdDaysAgo: 5, updatedDaysAgo: 1 },
      { title: "Fire exit signage missing on floor 1", description: "Two exit signs not installed — needed before the inspection.", category: "operations", priority: "critical", status: "resolved", assignee: "manager", reporter: "Safety Officer", createdDaysAgo: 9, resolvedDaysAgo: 8 },
      { title: "Request: add bike racks in basement", description: "Client asked for 10 bike racks.", category: "feature_request", priority: "low", status: "open", reporter: "Riverside Holdings", createdDaysAgo: 3 },
    ],
  },
  {
    key: "CARE",
    name: "Customer Support Desk",
    client: "Bloom Retail Pvt Ltd",
    description: "Escalations from the customer support WhatsApp line: complaints, refunds and delivery problems.",
    members: ["admin", "sara", "member"],
    issues: [
      { title: "Refund not received after 10 days", description: "Customer returned order #45002; refund still pending.", category: "customer_complaint", priority: "high", status: "in_progress", assignee: "sara", reporter: "Customer via support line", createdDaysAgo: 8, updatedDaysAgo: 2, due: -1 },
      { title: "Courier marked order delivered but customer did not receive it", description: "Order #46831, courier proof of delivery requested.", category: "operations", priority: "high", status: "open", assignee: "member", reporter: "Customer via support line", createdDaysAgo: 5, updatedDaysAgo: 5, due: 2 },
      { title: "Wrong size delivered for order #46710", description: "Customer ordered M, received L.", category: "customer_complaint", priority: "medium", status: "resolved", assignee: "sara", reporter: "Customer via support line", createdDaysAgo: 16, resolvedDaysAgo: 12 },
      { title: "Support phone line unreachable on Sunday", description: "Calls going to voicemail during working hours.", category: "operations", priority: "medium", status: "closed", assignee: "member", reporter: "Meera Iyer", createdDaysAgo: 28, resolvedDaysAgo: 25 },
      { title: "Damaged packaging on deliveries to Pune", description: "Several customers sent photos of crushed boxes.", category: "operations", priority: "medium", status: "open", assignee: "member", reporter: "Meera Iyer", createdDaysAgo: 11, updatedDaysAgo: 10 },
      { title: "Customer asks for invoice with GST number", description: "B2B customer needs a corrected invoice.", category: "other", priority: "low", status: "resolved", assignee: "sara", reporter: "Customer via support line", createdDaysAgo: 22, resolvedDaysAgo: 21 },
    ],
  },
];

// A small past import (already processed and reviewed) for the Riverside project.
const PAST_CHAT = `27/10/2026, 08:40 - Vikram Rao: Morning. Water is leaking from the AC unit in meeting room 2B again, there's a stain on the ceiling
27/10/2026, 08:41 - Vikram Rao: IMG-20261027-WA0001.jpg (file attached)
27/10/2026, 08:55 - AI4BI Admin: Thanks Vikram, Neha can you check with the HVAC contractor?
27/10/2026, 09:02 - Neha Singh: Calling them now
27/10/2026, 15:20 - Kavita Nair: Also the lights near the windows in the open-plan area keep flickering
27/10/2026, 15:22 - AI4BI Admin: Noted, will add to the snag list`;

/** Every object path under a storage prefix (list() is one level deep; folders have no id). */
async function listFiles(prefix: string): Promise<string[]> {
  const entries = must(await db.storage.from("evidence").list(prefix, { limit: 1000 }), `list ${prefix}`);
  const nested = await Promise.all(entries.map((e) => (e.id ? [`${prefix}/${e.name}`] : listFiles(`${prefix}/${e.name}`))));
  return nested.flat();
}

async function main() {
  if (reset) {
    must(await db.from("projects").delete().eq("is_demo", true).select("id"), "remove demo projects");
    // Storage is not cascaded: remove files of projects that no longer exist (the demo
    // projects just deleted, plus any left behind earlier). Nothing can reference them.
    const live = new Set(must(await db.from("projects").select("id"), "list projects").map((p) => p.id));
    const folders = must(await db.storage.from("evidence").list("", { limit: 1000 }), "list storage");
    let removed = 0;
    for (const folder of folders.filter((f) => !live.has(f.name))) {
      const paths = await listFiles(folder.name);
      for (let i = 0; i < paths.length; i += 500) check(await db.storage.from("evidence").remove(paths.slice(i, i + 500)), "remove files");
      removed += paths.length;
    }
    console.log(`Removed existing demo projects (and ${removed} stored file(s)).`);
  }
  const { count } = await db.from("projects").select("id", { count: "exact", head: true }).eq("is_demo", true);
  if ((count ?? 0) > 0) {
    console.log("Demo projects already exist. Re-run with --reset to recreate them (users are kept).");
  }

  const users = await ensureUsers();
  console.log(`Users ready: ${USERS.map((u) => `${u.email} (${u.role})`).join(", ")}`);
  if ((count ?? 0) > 0) return runAutomations();

  for (const p of PROJECTS) {
    const project = must(
      await db
        .from("projects")
        .insert({ key: p.key, name: p.name, client_name: p.client, description: p.description, is_demo: true, created_by: users.admin, created_at: ago(45) })
        .select("id")
        .single(),
      `project ${p.key}`,
    );
    check(
      await db.from("project_members").upsert(p.members.map((m) => ({ project_id: project.id, user_id: users[m], added_by: users.admin }))),
      `members ${p.key}`,
    );

    for (const i of [...p.issues].sort((a, b) => b.createdDaysAgo - a.createdDaysAgo)) {
      const created = ago(i.createdDaysAgo, 9 + (i.title.length % 8));
      const issue = must(
        await db
          .from("issues")
          .insert({
            project_id: project.id,
            title: i.title,
            description: i.description,
            category: i.category,
            priority: i.priority,
            status: i.status,
            assignee_id: i.assignee ? users[i.assignee] : null,
            reporter_name: i.reporter ?? null,
            due_date: i.due !== undefined ? dateIn(i.due) : null,
            created_by: users.manager,
            created_at: created,
            updated_at: ago(i.resolvedDaysAgo ?? i.updatedDaysAgo ?? i.createdDaysAgo, 16),
            resolved_at: i.resolvedDaysAgo !== undefined ? ago(i.resolvedDaysAgo, 15) : null,
          })
          .select("id")
          .single(),
        `issue ${i.title}`,
      );
      // Align the generated "created" activity with the backdated issue.
      check(await db.from("issue_activity").update({ created_at: created, actor_id: users.manager }).eq("issue_id", issue.id), "backdate activity");
      for (const [n, [who, body]] of (i.comments ?? []).entries()) {
        check(
          await db.from("comments").insert({ issue_id: issue.id, author_id: users[who], body, created_at: ago(Math.max(0, i.createdDaysAgo - 1 - n), 14) }),
          "comment",
        );
      }
    }
    console.log(`Project ${p.key}: ${p.issues.length} issues`);
  }

  await seedPastImport(users);
  await runAutomations();
}

async function seedPastImport(users: Record<UserKey, string>) {
  const { data: project } = await db.from("projects").select("id, key").eq("key", "RVSD").single();
  if (!project) return;
  const parsed = parseWhatsAppChat(PAST_CHAT);
  const imp = must(
    await db
      .from("imports")
      .insert({
        project_id: project.id,
        created_by: users.manager,
        status: "completed",
        file_names: ["WhatsApp Chat with Riverside Site Team.txt"],
        content_hash: "demo-riverside-2026-10-27",
        message_count: parsed.messages.length,
        media_count: 0,
        draft_count: 2,
        parse_warnings: ["1 referenced attachment(s) were not included in the upload."],
        ai_provider: "mock",
        ai_model: "mock-heuristic-v1",
        ai_simulated: true,
        created_at: ago(14, 9),
        completed_at: ago(14, 10),
      })
      .select("id")
      .single(),
    "past import",
  );
  const msgs = must(
    await db
      .from("source_messages")
      .insert(
        parsed.messages.map((m) => ({
          import_id: imp.id,
          project_id: project.id,
          seq: m.seq,
          sender: m.sender,
          sent_at: m.sentAt,
          raw_timestamp: m.rawTimestamp,
          body: m.body,
          is_system: m.isSystem,
          attachment_name: m.attachmentName,
          attachment_missing: Boolean(m.attachmentName),
        })),
      )
      .select("id, seq"),
    "past messages",
  );
  const bySeq = new Map(msgs.map((m) => [m.seq, m.id]));
  const link = async (title: string, seqs: number[]) => {
    const { data: issue } = await db.from("issues").select("id").eq("project_id", project.id).eq("title", title).single();
    if (!issue) return;
    check(await db.from("issues").update({ source: "whatsapp_import", import_id: imp.id }).eq("id", issue.id), "link issue");
    check(await db.from("issue_source_messages").insert(seqs.map((s) => ({ issue_id: issue.id, source_message_id: bySeq.get(s)! }))), "link messages");
    check(await db.from("issue_drafts").insert({
      import_id: imp.id,
      project_id: project.id,
      title,
      description: "Seeded demo draft (approved).",
      category: "maintenance",
      priority: "medium",
      reported_by: parsed.messages.find((m) => m.seq === seqs[0])?.sender ?? null,
      reported_at: parsed.messages.find((m) => m.seq === seqs[0])?.sentAt ?? null,
      confidence: 0.82,
      source_message_ids: seqs.map((s) => bySeq.get(s)!),
      status: "approved",
      approved_issue_id: issue.id,
      ai_provider: "mock",
      ai_model: "mock-heuristic-v1",
      is_simulated: true,
      reviewed_by: users.manager,
      reviewed_at: ago(14, 10),
    }), "approved draft");
  };
  await link("Water leaking from AC unit in meeting room 2B", [1, 2, 3, 4]);
  await link("Flickering lights in open-plan area", [5, 6]);
  console.log("Past import seeded for RVSD.");
}

async function runAutomations() {
  // Real executions of the same job code used by Vercel Cron (recorded as manual runs).
  const { runJob, JOB_IDS } = await import("../../lib/automation/jobs");
  for (const id of JOB_IDS) {
    const r = await runJob(id, "manual", null);
    console.log(`Automation ${id}: ${r.status} — ${r.summary}`);
  }
}

main()
  .then(() => console.log("\nDemo data ready. Sign in as admin@issueflow.example / manager@issueflow.example / member@issueflow.example with DEMO_PASSWORD."))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
