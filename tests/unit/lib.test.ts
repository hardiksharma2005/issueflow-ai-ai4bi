import { describe, expect, it } from "vitest";
import { computeDashboard, isOverdue, type AnalyticsIssue } from "@/lib/analytics";
import { describeCron, nextRun } from "@/lib/automation/cron";
import { buildReport, toCsv, type ReportIssue } from "@/lib/reports";
import { checkFile, sanitizeFileName, sniffMatches, typeFromName } from "@/lib/validation/files";
import { matchMedia, timestampFromFileName } from "@/lib/whatsapp/media";
import { safeRedirectPath } from "@/lib/redirect";
import { APP_TIMEZONE, calendarDate, formatDate, formatDateTime } from "@/lib/format";
import { issueFiltersSchema, issueUpdateSchema, projectSchema, signUpSchema } from "@/lib/validation/schemas";

const NOW = new Date("2026-11-10T12:00:00Z");

function issue(partial: Partial<ReportIssue & AnalyticsIssue>): ReportIssue & AnalyticsIssue {
  return {
    id: Math.random().toString(36).slice(2),
    number: 1,
    title: "Issue",
    status: "open",
    priority: "medium",
    category: "bug",
    due_date: null,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    resolved_at: null,
    project_id: "p1",
    assignee_id: null,
    project: { id: "p1", key: "WEB", name: "Website" },
    assignee: null,
    ...partial,
  };
}

describe("cron", () => {
  it("computes the next daily run", () => {
    expect(nextRun("0 7 * * *", NOW)?.toISOString()).toBe("2026-11-11T07:00:00.000Z");
    expect(nextRun("0 7 * * *", new Date("2026-11-10T06:59:30Z"))?.toISOString()).toBe("2026-11-10T07:00:00.000Z");
  });
  it("computes the next weekly run (Monday)", () => {
    expect(nextRun("0 8 * * 1", NOW)?.toISOString()).toBe("2026-11-16T08:00:00.000Z");
  });
  it("supports steps and ranges", () => {
    expect(nextRun("*/15 9-17 * * *", NOW)?.toISOString()).toBe("2026-11-10T12:15:00.000Z");
  });
  it("describes common schedules", () => {
    expect(describeCron("30 7 * * *")).toBe("Every day at 07:30 UTC");
    expect(describeCron("0 8 * * 1")).toBe("Every Monday at 08:00 UTC");
  });
  it("rejects invalid expressions", () => {
    expect(() => nextRun("61 * * * *")).toThrow();
  });
});

describe("analytics", () => {
  const issues = [
    issue({ status: "open", priority: "critical", due_date: "2026-11-05" }),
    issue({ status: "in_progress", due_date: "2026-12-01" }),
    issue({ status: "resolved", resolved_at: "2026-11-09T10:00:00Z", category: "ui_ux" }),
    issue({ status: "blocked", created_at: "2026-11-10T08:00:00Z" }),
  ];
  const d = computeDashboard(issues, NOW);

  it("counts real states", () => {
    expect(d.counts).toEqual({ total: 4, open: 1, inProgress: 1, resolved: 1, overdue: 1, critical: 1, blocked: 1 });
    expect(d.byCategory.ui_ux).toBe(1);
  });
  it("builds a 30-day timeline", () => {
    expect(d.timeline).toHaveLength(30);
    expect(d.timeline.at(-1)).toEqual({ date: "2026-11-10", created: 1, resolved: 0 });
    expect(d.timeline.find((t) => t.date === "2026-11-09")?.resolved).toBe(1);
  });
  it("tracks weekly resolution time", () => {
    const week = d.resolutionTrend.find((w) => w.resolved > 0)!;
    expect(week.avgDays).toBe(8);
  });
  it("does not count resolved issues as overdue", () => {
    expect(isOverdue({ status: "resolved", due_date: "2020-01-01" }, NOW)).toBe(false);
  });
});

describe("reports", () => {
  const issues = [
    issue({ number: 1, priority: "low", assignee: { id: "u1", full_name: "Asha", email: "a@x" } }),
    issue({ number: 2, priority: "critical", due_date: "2026-11-01", assignee: { id: "u1", full_name: "Asha", email: "a@x" } }),
    issue({ number: 3, status: "closed", created_at: "2026-11-01T00:00:00Z", resolved_at: "2026-11-03T12:00:00Z" }),
  ];

  it("sorts open issues by priority", () => {
    const r = buildReport("open-issues", issues, NOW);
    expect(r.rows.map((x) => x[0])).toEqual(["WEB-2", "WEB-1"]);
  });
  it("computes overdue days", () => {
    expect(buildReport("overdue", issues, NOW).rows[0]).toContain(9);
  });
  it("summarises workload and progress", () => {
    expect(buildReport("workload", issues, NOW).rows[0]).toEqual(["Asha", 2, 0, 0, 0, 2, 1, 1]);
    expect(buildReport("project-progress", issues, NOW).rows[0].at(-1)).toBe(33);
    expect(buildReport("resolution", issues, NOW).rows[0].at(-1)).toBe(2.5);
  });
  it("escapes CSV and neutralises formula injection", () => {
    const csv = toCsv({ columns: ["A", "B"], rows: [['=HYPERLINK("x")', 'say "hi", ok'], [null, 3]] });
    expect(csv).toBe('A,B\r\n"\'=HYPERLINK(""x"")","say ""hi"", ok"\r\n,3\r\n');
  });
});

describe("file validation", () => {
  it("accepts supported types and rejects others", () => {
    expect(checkFile("chat.txt", 100).ok).toBe(true);
    expect(checkFile("evil.exe", 100).ok).toBe(false);
    expect(checkFile("big.png", 26 * 1024 * 1024).ok).toBe(false);
    expect(checkFile("empty.png", 0).ok).toBe(false);
  });
  it("checks magic bytes", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]);
    expect(sniffMatches(png, typeFromName("a.png")!)).toBe(true);
    expect(sniffMatches(png, typeFromName("a.jpg")!)).toBe(false);
    expect(sniffMatches(new Uint8Array([0x4d, 0x5a, 0, 1]), typeFromName("a.txt")!)).toBe(false);
  });
  it("sanitises names and blocks traversal", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("WhatsApp Chat – Team.txt")).toBe("WhatsApp_Chat___Team.txt");
    expect(sanitizeFileName("..\\..\\x.png")).toBe("x.png");
  });
});

describe("media matching", () => {
  const messages = [
    { seq: 1, attachmentName: "IMG-1.jpg", sentAt: "2024-03-12T10:00:00.000Z", isSystem: false },
    { seq: 2, attachmentName: "missing.pdf", sentAt: "2024-03-12T10:01:00.000Z", isSystem: false },
    { seq: 3, attachmentName: null, sentAt: "2024-03-12T14:05:40.000Z", isSystem: false },
  ];
  it("matches by name, by embedded timestamp and reports missing/unmatched files", () => {
    const m = matchMedia(messages, [
      { name: "img-1.JPG", size: 1, mimeType: "image/jpeg" },
      { name: "00000012-PHOTO-2024-03-12-14-05-33.jpg", size: 1, mimeType: "image/jpeg" },
      { name: "random.png", size: 1, mimeType: "image/png" },
    ]);
    expect(m.bySeq.get(1)).toBe("img-1.JPG");
    expect(m.bySeq.get(3)).toBe("00000012-PHOTO-2024-03-12-14-05-33.jpg");
    expect(m.missing).toEqual([2]);
    expect(m.unmatched).toEqual(["random.png"]);
  });
  it("parses timestamps in iOS media names", () => {
    expect(timestampFromFileName("00000012-PHOTO-2024-03-12-14-05-33.jpg")?.toISOString()).toBe("2024-03-12T14:05:33.000Z");
    expect(timestampFromFileName("IMG-20240312-WA0001.jpg")).toBeNull();
  });
});

describe("input schemas", () => {
  it("validates project keys", () => {
    expect(projectSchema.safeParse({ name: "Web", key: "web" }).data?.key).toBe("WEB");
    expect(projectSchema.safeParse({ name: "Web", key: "1WEB" }).success).toBe(false);
  });
  it("rejects unknown fields in issue updates (no mass assignment)", () => {
    expect(issueUpdateSchema.safeParse({ id: crypto.randomUUID(), project_id: "x" }).success).toBe(false);
    expect(issueUpdateSchema.safeParse({ id: crypto.randomUUID(), status: "done" }).success).toBe(false);
  });
  it("enforces password length", () => {
    expect(signUpSchema.safeParse({ fullName: "A B", email: "a@b.co", password: "short" }).success).toBe(false);
  });
  it("ignores invalid filter values instead of failing", () => {
    expect(issueFiltersSchema.parse({ status: "nope", priority: "high" })).toEqual({ priority: "high" });
  });
});

describe("safe redirects", () => {
  it("keeps same-origin paths", () => {
    expect(safeRedirectPath("/issues?view=board")).toBe("/issues?view=board");
    expect(safeRedirectPath("/projects/abc#members")).toBe("/projects/abc#members");
  });
  it("rejects anything that resolves to another host", () => {
    for (const next of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com", "evil.com", "", null, undefined]) {
      expect(safeRedirectPath(next)).toBe("/dashboard");
    }
  });
});

describe("date formatting (app time zone)", () => {
  it("shows timestamps in the app time zone regardless of the server's zone", () => {
    expect(APP_TIMEZONE).toBe("Asia/Kolkata");
    expect(formatDateTime("2026-11-03T03:47:00Z")).toBe("3 Nov 2026, 09:17");
    expect(formatDate("2026-11-03T20:00:00Z")).toBe("4 Nov 2026"); // 01:30 next day in IST
  });
  it("never shifts date-only values", () => {
    expect(formatDate("2026-11-11", "d MMM")).toBe("11 Nov");
    expect(formatDate("2026-01-01")).toBe("1 Jan 2026");
  });
  it("uses the app time zone for 'today' and overdue checks", () => {
    const justAfterMidnightIst = new Date("2026-11-10T18:45:00Z"); // 00:15 on 11 Nov in IST
    expect(calendarDate(justAfterMidnightIst)).toBe("2026-11-11");
    expect(isOverdue({ due_date: "2026-11-10", status: "open" }, justAfterMidnightIst)).toBe(true);
  });
});
