// End-to-end smoke test in a real browser against a running app with seeded demo data.
//
//   npm run build && npm start          (or npm run dev)
//   npm run test:e2e
//
// Uses playwright-core with an installed browser (no download): E2E_BROWSER=msedge (default) or chrome.
// E2E_BASE_URL defaults to http://localhost:3000. It imports the sample chat into BLOOM and changes
// demo data; run `npm run db:reset-demo` afterwards for a clean demo. The test user it registers is deleted.

import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.DEMO_PASSWORD;
if (!PASSWORD) throw new Error("DEMO_PASSWORD must be set in .env.local (run npm run db:seed first)");
const service = createClient(
  new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
);

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER ?? "msedge", headless: true });

async function session(role, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => r.status() >= 500 && errors.push(`HTTP ${r.status()} ${r.url()}`));
  if (role) {
    await page.goto(`${BASE}/login`);
    await page.fill("#email", `${role}@issueflow.example`);
    await page.fill("#password", PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForURL("**/dashboard", { timeout: 30000 });
  }
  return { page, ctx, errors };
}
const mainText = (page) => page.locator("main").innerText();
const toast = (page) => page.locator("[data-sonner-toast]").last().innerText({ timeout: 10000 }).catch(() => "");
const horizontalOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

const PAGES = ["/dashboard", "/projects", "/issues", "/issues?view=board", "/my-tasks", "/imports", "/imports/new", "/reports", "/automations", "/team", "/settings", "/search?q=payment"];

try {
  console.log("Signed-out access");
  {
    const { page, ctx } = await session(null);
    await page.goto(`${BASE}/dashboard`);
    check("protected page redirects to login", page.url().includes("/login?next=%2Fdashboard"));
    const cron = await page.request.get(`${BASE}/api/cron/daily-overdue-check`);
    check("cron without secret is rejected", cron.status() === 401, String(cron.status()));
    const csv = await page.request.get(`${BASE}/api/reports/open-issues`);
    check("report export requires sign-in", csv.status() === 401, String(csv.status()));
    await ctx.close();
  }

  for (const role of ["admin", "manager", "member"]) {
    console.log(`Pages as ${role} (desktop and 390px)`);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const { page, ctx, errors } = await session(role, viewport);
      const bad = [];
      for (const p of PAGES) {
        const res = await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
        if (res?.status() !== 200) bad.push(`${p}: HTTP ${res?.status()}`);
        if (/something went wrong/i.test(await mainText(page))) bad.push(`${p}: error boundary`);
        if (await horizontalOverflow(page)) bad.push(`${p}: horizontal scroll`);
      }
      check(`${role} @${viewport.width}px: all pages render without errors`, bad.length === 0 && errors.length === 0, [...bad, ...errors].join("; "));
      await ctx.close();
    }
  }

  console.log("Member permissions");
  {
    const { page, ctx } = await session("member");
    await page.goto(`${BASE}/imports/new`, { waitUntil: "networkidle" });
    check("member cannot start an import", /can.t import into any project/i.test(await mainText(page)));
    await page.goto(`${BASE}/my-tasks`, { waitUntil: "networkidle" });
    await page.goto(`${BASE}${await page.locator('a[href^="/issues/"]').first().getAttribute("href")}`, { waitUntil: "networkidle" });
    check("member can change status", !(await page.getByLabel("Status", { exact: true }).isDisabled()));
    check("member cannot change priority/assignee", (await page.getByLabel("Priority", { exact: true }).isDisabled()) && (await page.getByLabel("Assignee", { exact: true }).isDisabled()));
    await page.getByLabel("Status", { exact: true }).click();
    await page.getByRole("option", { name: "In Review" }).click();
    check("status change saved", /updated/i.test(await toast(page)));
    const note = `E2E comment ${Date.now()}`;
    await page.getByLabel("New comment").fill(note);
    await page.getByRole("button", { name: /^Comment$/ }).click();
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "networkidle" });
    check("comment persisted", (await mainText(page)).includes(note));
    const { data: imp } = await service.from("imports").select("id").limit(1).single();
    const call = (m, u) => page.evaluate(async ([m, u]) => (await fetch(u, { method: m, headers: { "Content-Type": "application/json" }, body: m === "POST" ? "{}" : undefined })).status, [m, u]);
    check("member cannot run AI processing via API", (await call("POST", `/api/imports/${imp.id}/process`)) === 403);
    check("member cannot re-parse an import via API", (await call("POST", `/api/imports/${imp.id}/parse`)) === 403);
    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
    check("member does not see the audit log", !/audit log/i.test(await mainText(page)));
    await ctx.close();
  }

  console.log("Manager: WhatsApp import with the sample data");
  {
    const { page, ctx, errors } = await session("manager");
    const runWizard = async () => {
      await page.goto(`${BASE}/imports/new`);
      await page.click("#project");
      await page.getByRole("option", { name: /BLOOM/ }).click();
      await page.getByRole("button", { name: /Use sample WhatsApp data/ }).click();
      await page.waitForSelector('li:has-text(".zip")');
      await page.getByRole("button", { name: /Upload & extract messages/ }).click();
      await page.waitForURL(/\/imports\/[0-9a-f-]{36}$/, { timeout: 120000 });
      await page.waitForLoadState("networkidle");
    };
    await runWizard();
    const importUrl = page.url();
    check("chat parsed (37 messages)", /Messages\s*37/.test(await mainText(page)));
    await page.getByRole("button", { name: /Process with AI/ }).click();
    await page.getByRole("button", { name: /^Approve$/ }).first().waitFor({ timeout: 180000 });
    await page.waitForLoadState("networkidle");
    const drafts = await page.getByRole("button", { name: /^Approve$/ }).count();
    check("AI drafts generated", drafts === 7, `${drafts} drafts`);
    const text = await mainText(page);
    check("drafts labelled Simulated", /Simulated AI/.test(text));
    check("duplicate of BLOOM-7 flagged", /may already be tracked[\s\S]*BLOOM-7/.test(text));
    check("prompt injection not turned into an issue", !/ignore (all )?previous instructions/i.test(await page.locator("input[aria-label='Issue title']").evaluateAll((els) => els.map((e) => e.value).join("\n"))));
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); } });
    await page.waitForTimeout(1000);
    const broken = await page.$$eval("main img", (els) => els.filter((e) => !(e.complete && e.naturalWidth > 0)).map((e) => e.alt));
    check("evidence images load", broken.length === 0, broken.join(", "));
    const title = await page.getByLabel("Issue title").first().inputValue();
    await page.getByRole("button", { name: /^Approve$/ }).first().click();
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: /^Reject$/ }).last().click();
    await page.waitForTimeout(2500);
    await page.reload({ waitUntil: "networkidle" });
    check("approve + reject reduce pending drafts", (await page.getByRole("button", { name: /^Approve$/ }).count()) === drafts - 2);
    const { data: issue } = await service.from("issues").select("id, source").eq("title", title).maybeSingle();
    check("approved draft became a WhatsApp issue", issue?.source === "whatsapp_import", title);
    if (issue) {
      const { count } = await service.from("issue_source_messages").select("*", { count: "exact", head: true }).eq("issue_id", issue.id);
      check("issue linked to its source messages", (count ?? 0) > 0, `${count} messages`);
    }
    await runWizard();
    check("re-importing the same chat is blocked", /Duplicate import blocked/.test(await mainText(page)));

    await page.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
    const download = page.waitForEvent("download", { timeout: 15000 });
    await page.getByRole("link", { name: /Export CSV/ }).click();
    const csv = await (await download).createReadStream().then(async (s) => { let t = ""; for await (const c of s) t += c; return t; });
    check("CSV export downloads", csv.startsWith("Key,Title,Project"), `${csv.trim().split("\n").length - 1} rows`);

    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder(/Search projects/).fill("payment");
    await page.waitForTimeout(1500);
    check("command search finds the imported conversation", (await page.locator("[cmdk-item]").count()) > 1);
    check("no page errors during import flow", errors.length === 0, errors.join("; "));
    console.log(`  (import: ${importUrl})`);
    await ctx.close();
  }

  console.log("Accounts and automations");
  {
    const email = `e2e-${Date.now()}@issueflow.example`;
    const { page, ctx } = await session(null);
    try {
      await page.goto(`${BASE}/register`);
      await page.fill("#fullName", "E2E Tester");
      await page.fill("#email", email);
      await page.fill("#password", "short");
      await page.click("button[type=submit]");
      await page.waitForTimeout(1500);
      check("weak password rejected, input kept", (await page.locator("#password-error").count()) === 1 && (await page.inputValue("#email")) === email);
      await page.fill("#password", "Correct-Horse-91!");
      await page.click("button[type=submit]");
      await page.waitForURL("**/dashboard", { timeout: 20000 }).catch(() => {});
      const { data: prof } = await service.from("profiles").select("role").eq("email", email).maybeSingle();
      check("registration creates a member", prof?.role === "member", `role=${prof?.role} (needs "Confirm email" off)`);
      await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
      check("new member sees no projects", (await page.locator('a[href^="/projects/"]').count()) === 0);
      await page.getByLabel("Account menu").click();
      await page.getByRole("menuitem", { name: /Sign out/ }).click();
      await page.waitForURL("**/login**");
      await page.goto(`${BASE}/dashboard`);
      check("signed out", page.url().includes("/login"));
      await page.fill("#email", email);
      await page.fill("#password", "Wrong-password-1");
      await page.click("button[type=submit]");
      const alert = page.getByRole("alert").filter({ hasText: /\S/ }).first();
      await alert.waitFor({ timeout: 10000 }).catch(() => {});
      check("wrong password: generic message", /Invalid email or password/.test(await alert.innerText().catch(() => "")));
      await page.goto(`${BASE}/forgot-password`);
      await page.fill("#email", `nobody-${Date.now()}@issueflow.example`); // no account → no email is sent
      await page.click("button[type=submit]");
      await page.waitForTimeout(2500);
      check("forgot password does not reveal accounts", /If an account exists/.test(await page.locator("form").innerText()));
    } finally {
      const { data } = await service.from("profiles").select("id").eq("email", email).maybeSingle();
      if (data) await service.auth.admin.deleteUser(data.id);
      await ctx.close();
    }
    const admin = await session("admin");
    await admin.page.goto(`${BASE}/automations`, { waitUntil: "networkidle" });
    await admin.page.getByRole("button", { name: /Run now/ }).first().click();
    check("admin can run an automation", /overdue|issue|import/i.test(await toast(admin.page)));
    await admin.ctx.close();
  }
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed. Run `npm run db:reset-demo` to restore the demo data.");
process.exit(failures ? 1 : 0);
