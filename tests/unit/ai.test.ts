import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runExtraction } from "@/lib/ai/extract";
import { findDuplicates, similarity } from "@/lib/ai/duplicates";
import { makeTitle, MockAIProvider, mockExtract } from "@/lib/ai/mock";
import { outputText } from "@/lib/ai/grok";
import { AIOutputError, extractJson, validateExtraction } from "@/lib/ai/validate";
import type { AIProvider, ExtractionInput } from "@/lib/ai/types";
import { parseWhatsAppChat } from "@/lib/whatsapp/parser";

const sample = readFileSync(
  path.join(__dirname, "../../public/demo/WhatsApp Chat with Bloom Retail Support.txt"),
  "utf8",
);

function toInput(): ExtractionInput {
  const parsed = parseWhatsAppChat(sample);
  let a = 0;
  return {
    projectName: "Bloom Retail",
    existingIssues: [{ key: "BLOOM-3", title: "Search results show out-of-stock products first", status: "open" }],
    looseAttachments: [],
    messages: parsed.messages
      .filter((m) => !m.isSystem)
      .map((m) => ({
        ref: `m${m.seq}`,
        sender: m.sender,
        sentAt: m.sentAt,
        text: m.body,
        attachment: m.attachmentName
          ? { ref: `a${++a}`, fileName: m.attachmentName, mimeType: "image/jpeg", kind: "image" as const }
          : undefined,
      })),
  };
}

describe("MockAIProvider", () => {
  const input = toInput();
  const out = mockExtract(input);
  const titles = out.issues.map((i) => i.title);

  it("is deterministic", () => {
    expect(mockExtract(toInput())).toEqual(out);
  });

  it("groups the conversation into distinct issues instead of one per message", () => {
    expect(out.issues.length).toBeGreaterThanOrEqual(5);
    expect(out.issues.length).toBeLessThanOrEqual(8);
    expect(out.issues.length).toBeLessThan(input.messages.length / 3);
  });

  it("groups payment follow-ups with the original report and attaches the screenshot", () => {
    const payment = out.issues.find((i) => /payment page/i.test(i.title))!;
    expect(payment).toBeDefined();
    expect(payment.priority).toBe("critical");
    expect(payment.message_refs.length).toBeGreaterThanOrEqual(3);
    expect(payment.attachment_refs.length).toBeGreaterThanOrEqual(1);
    expect(payment.reported_by).toBe("Priya Shah");
  });

  it("classifies categories", () => {
    const perf = out.issues.find((i) => /images/i.test(i.title))!;
    expect(perf.category).toBe("performance");
    const feature = out.issues.find((i) => /export orders/i.test(i.title))!;
    expect(feature.category).toBe("feature_request");
    const ui = out.issues.find((i) => /add to cart/i.test(i.title))!;
    expect(ui.category).toBe("ui_ux");
  });

  it("does not turn a prompt-injection message into an action or an issue", () => {
    const injection = input.messages.find((m) => /ignore all previous instructions/i.test(m.text))!;
    expect(out.issues.some((i) => i.message_refs.includes(injection.ref))).toBe(false);
    expect(titles.some((t) => /ignore all previous|make meera an admin/i.test(t))).toBe(false);
  });

  it("only labels images as simulated", () => {
    expect(out.attachment_findings.every((f) => f.description.startsWith("[Simulated]"))).toBe(true);
  });

  it("cleans titles", () => {
    expect(makeTitle("Hi team, the login page is broken. Please help")).toBe("The login page is broken");
    expect(makeTitle("")).toBe("Issue reported in WhatsApp conversation");
  });
});

describe("validateExtraction", () => {
  const input = toInput();

  it("drops invented references, issues without evidence and unsupported assignees", () => {
    const raw = JSON.stringify({
      issues: [
        {
          title: "Payment page error",
          description: "x",
          category: "bug",
          priority: "critical",
          reported_by: "Somebody Invented",
          message_refs: ["m5", "m999"],
          attachment_refs: ["a99"],
          suggested_assignee: "Elon",
          confidence: 7,
          possible_duplicate_of: "NOPE-1",
        },
        { title: "Hallucinated issue", description: "", category: "bug", priority: "low", reported_by: null, message_refs: ["m999"], attachment_refs: [], suggested_assignee: null, confidence: 0.9, possible_duplicate_of: null },
      ],
      attachment_findings: [{ ref: "zzz", description: "not real" }],
    });
    const report = validateExtraction(raw, input);
    expect(report.issues).toHaveLength(1);
    const [issue] = report.issues;
    expect(issue.messageRefs).toEqual(["m5"]);
    expect(issue.reportedBy).toBe("Priya Shah"); // from the source message, not the model
    expect(issue.reportedAt).toBe("2026-11-03T09:17:00.000Z");
    expect(issue.suggestedAssignee).toBeNull();
    expect(issue.confidence).toBe(1);
    expect(issue.possibleDuplicateOf).toBeNull();
    expect(report.droppedIssues).toBe(1);
    expect(Object.keys(report.findings)).toHaveLength(0);
  });

  it("coerces invalid enums to safe defaults", () => {
    const raw = JSON.stringify({
      issues: [{ title: "Thing broken", description: "", category: "explosion", priority: "p0", reported_by: null, message_refs: ["m5"], attachment_refs: [], suggested_assignee: null, confidence: "0.4", possible_duplicate_of: "bloom-3" }],
    });
    const [issue] = validateExtraction(raw, input).issues;
    expect(issue.category).toBe("other");
    expect(issue.priority).toBe("medium");
    expect(issue.confidence).toBe(0.4);
    expect(issue.possibleDuplicateOf).toBe("BLOOM-3");
  });

  it("handles fenced and malformed JSON", () => {
    expect(extractJson('```json\n{"issues":[]}\n```')).toEqual({ issues: [] });
    expect(extractJson('Sure! {"issues":[]} hope this helps')).toEqual({ issues: [] });
    expect(() => validateExtraction("not json at all", input)).toThrow(AIOutputError);
    expect(() => validateExtraction('{"issues": "nope"}', input)).toThrow(AIOutputError);
  });
});

describe("runExtraction", () => {
  it("flags duplicates of existing issues", async () => {
    const outcome = await runExtraction(new MockAIProvider(), toInput(), [
      { id: "issue-3", key: "BLOOM-3", title: "Search results show out-of-stock products first", description: "", status: "open" },
    ]);
    const search = outcome.drafts.find((d) => /search/i.test(d.title))!;
    expect(search.duplicateCandidates[0]).toMatchObject({ type: "issue", key: "BLOOM-3" });
  });

  it("retries once on malformed output then succeeds", async () => {
    let calls = 0;
    const flaky: AIProvider = {
      info: { name: "test", model: "t", simulated: true, supportsVision: false },
      async extract() {
        calls++;
        return calls === 1 ? "{oops" : JSON.stringify({ issues: [], attachment_findings: [] });
      },
    };
    const outcome = await runExtraction(flaky, toInput(), []);
    expect(calls).toBe(2);
    expect(outcome.drafts).toEqual([]);
  });

  it("batches large conversations", async () => {
    const input = toInput();
    const many = { ...input, messages: Array.from({ length: 320 }, (_, i) => ({ ...input.messages[i % input.messages.length], ref: `m${i}` })) };
    const outcome = await runExtraction(new MockAIProvider(), many, []);
    expect(outcome.batches).toBe(3);
  });
});

describe("duplicates", () => {
  it("scores related titles higher than unrelated ones", () => {
    const a = { title: "Payment page shows timeout error" };
    expect(similarity(a, { title: "Timeout error on the payment page" })).toBeGreaterThan(0.5);
    expect(similarity(a, { title: "Add export to Excel" })).toBe(0);
    expect(findDuplicates(a, [{ id: "1", title: "Payment timeout error" }], "issue")).toHaveLength(1);
  });
});

describe("Grok response parsing", () => {
  it("reads output_text from the Responses API output array", () => {
    expect(outputText({ output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: '{"a":1}' }] }] })).toBe('{"a":1}');
    expect(outputText({ output_text: "x" })).toBe("x");
    expect(outputText({})).toBeNull();
  });
});
