// MockAIProvider — deterministic, rule-based issue extraction that needs no API key.
//
// It returns the SAME JSON shape as the real Grok provider, so the whole pipeline
// (validation, duplicate detection, review) is exercised in demo mode. Results are
// always labelled as simulated: no model is called and images are NOT looked at.

import { jaccard, tokens } from "./duplicates";
import type { AIProvider, ExtractionInput, ExtractionMessage, RawExtraction, RawIssue } from "./types";
import type { IssueCategory, IssuePriority } from "@/lib/domain";

const PROBLEM =
  /\b(not working|doesn'?t work|isn'?t working|stopped working|broken|error|errors|issue|problem|bug|crash(?:es|ed|ing)?|fail(?:s|ed|ing|ure)?|can'?t|cannot|unable|slow|takes forever|timeout|timed out|down|missing|wrong|incorrect|stuck|leak(?:ing|s)?|complain(?:t|ed|ing)?|not loading|blank|404|500|please fix|urgent|could you add|can we add|would be (?:great|nice)|feature|request|delayed|damaged|refund|overlapping|misaligned|cut off|out[- ]of[- ]stock)\b/i;

const FOLLOW_UP = /\b(still|same|again|any update|update on|also seeing|happening again|me too|as well|any news|following up)\b/i;
// Explicit references to an earlier report, even when the message also sounds like a problem.
const STRONG_FOLLOW_UP = /\b(any update|update on|any news|following up|status of)\b/i;
// Short replies that confirm or support the previous report.
const AGREEMENT = /^(?:yes|yeah|yep|agreed?|\+1|same here|me too|that would be (?:great|nice|helpful)|i see it too|i can see it too|confirmed)\b/i;
// "X, could you check ..." right after a report is part of that report's thread.
const ACTION_REQUEST = /\b(?:can|could|would) you (?:please )?(?:check|look|fix|handle|investigate)|\blook(?:ing)? into\b/i;

// Order matters only for ties: earlier categories win.
const CATEGORY_RULES: [IssueCategory, RegExp][] = [
  ["bug", /\b(error|crash(?:es|ed)?|not working|doesn'?t work|bug|fails?|failed|500|404|exception|broken|blank)\b/gi],
  ["performance", /\b(slow|loading time|takes forever|timeout|timed out|lag(?:gy)?|speed|performance|seconds to load|minutes to load)\b/gi],
  ["ui_ux", /\b(button|layout|alignment|align|font|colou?r|overlapping|mobile view|design|ui|looks|misaligned|responsive|cut off|logo|menu)\b/gi],
  ["feature_request", /\b(could you add|can we add|would be (?:great|nice)|feature|option to|ability to|wish|add an? |new report|export)\b/gi],
  ["customer_complaint", /\b(customer|client complained|complain(?:t|ed|ing)?|refund|angry|unhappy|bad review|charged twice)\b/gi],
  ["maintenance", /\b(leak(?:ing|s)?|air ?con|\bac\b|plumbing|repair|maintenance|generator|lift|elevator|window|ceiling|light(?:s)?|pipe|water)\b/gi],
  ["operations", /\b(delivery|deliveries|delivered|delayed|shipment|stock|inventory|schedule|staff|invoice|vendor|supplier|courier)\b/gi],
];

const CRITICAL = /\b(urgent|asap|immediately|outage|is down|site down|all (?:users|customers)|production|data loss|security|critical|payments? (?:are |is )?fail|can'?t pay|cannot pay|charged twice|nobody can)\b/i;
const HIGH = /\b(important|customers? (?:are|can'?t|cannot)|blocking|blocked|can'?t|cannot|unable|crash|error|refund|leak(?:ing)?)\b/i;
const LOW = /\b(minor|typo|cosmetic|when you get a chance|nice to have|low priority|no rush|not urgent)\b/i;

const GREETING =
  /^(?:(?:hi|hello|hey|dear|good (?:morning|afternoon|evening)|ok(?:ay)?|so|guys|all|team|folks|everyone|another thing|also|fyi)\b[\s,!.:-]*)+/i;
const MIN_NEW_ISSUE_LENGTH = 25;
// Words too common in support chats to indicate that two messages share a topic (stemmed).
const GENERIC = new Set(
  "customer order check look into morning today now issue problem thank sure someone something more some everyone result".split(" "),
);
const topicTokens = (text: string) => new Set([...tokens(text)].filter((t) => !GENERIC.has(t)));

interface Cluster {
  messages: ExtractionMessage[];
  tokens: Set<string>;
  attachmentRefs: Set<string>;
  lastTime: number;
}

const time = (m: ExtractionMessage) => (m.sentAt ? new Date(m.sentAt).getTime() : Number.NaN);

function categorize(text: string): IssueCategory {
  let best: IssueCategory = "other";
  let bestScore = 0;
  for (const [category, re] of CATEGORY_RULES) {
    const score = (text.match(re) ?? []).length;
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best;
}

function prioritize(text: string): IssuePriority {
  if (CRITICAL.test(text)) return "critical";
  if (LOW.test(text)) return "low";
  if (HIGH.test(text)) return "high";
  return "medium";
}

export function makeTitle(text: string): string {
  let t = text.replace(/\s+/g, " ").trim();
  t = t.replace(/@\S+\s*/g, "").replace(GREETING, "").trim();
  // Drop short label prefixes such as "Urgent:" or "Feature request from the client:".
  t = t.replace(/^[\p{L} ]{3,40}:\s+(?=\S)/u, "").trim();
  const sentence = t.split(/(?<=[.!?])\s/)[0] ?? t;
  t = sentence.replace(/[.!?…]+$/, "").trim();
  if (t.length > 90) t = `${t.slice(0, 87).replace(/\s+\S*$/, "")}…`;
  if (!t) return "Issue reported in WhatsApp conversation";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function mentionedAssignee(cluster: Cluster, participants: Set<string>): string | null {
  for (const m of cluster.messages) {
    for (const name of participants) {
      const first = name.split(" ")[0];
      const re = new RegExp(`@${escapeRe(first)}\\b|\\b${escapeRe(first)},? (?:can|could|please) you (?:check|look|fix|handle|take)`, "i");
      if (re.test(m.text) && name !== cluster.messages[0].sender) return name;
    }
  }
  return null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function mockExtract(input: ExtractionInput): RawExtraction {
  const clusters: Cluster[] = [];
  const participants = new Set(input.messages.map((m) => m.sender).filter((s): s is string => !!s));
  // Attachments sent just before the describing text ("screenshot first, then message").
  const pendingBySender = new Map<string, { ref: string; t: number }[]>();
  const pendingMessages = new Map<string, ExtractionMessage>();
  const order = new Map(input.messages.map((m, i) => [m.ref, i]));

  // Most recently active clusters first.
  const byActivity = () => [...clusters].sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
  const latestFor = (sender: string | null, t: number) =>
    byActivity().find(
      (c) => c.messages.some((m) => m.sender === sender) && (Number.isNaN(t) || t - c.lastTime <= 10 * 60_000),
    );

  for (const msg of input.messages) {
    const t = time(msg);
    const text = msg.text.trim();
    const msgTokens = topicTokens(text);

    if (!text && msg.attachment) {
      const owner = latestFor(msg.sender, t);
      if (owner && !Number.isNaN(t) && t - owner.lastTime <= 5 * 60_000) {
        owner.messages.push(msg);
        owner.attachmentRefs.add(msg.attachment.ref);
      } else {
        const list = pendingBySender.get(msg.sender ?? "") ?? [];
        list.push({ ref: msg.attachment.ref, t });
        pendingBySender.set(msg.sender ?? "", list);
        pendingMessages.set(msg.attachment.ref, msg); // referenced once a cluster claims it
      }
      continue;
    }

    // Best existing cluster by topic overlap (how much of this message the cluster already covers).
    let best: Cluster | null = null;
    let bestShared = 0;
    for (const c of clusters) {
      let shared = 0;
      for (const tok of msgTokens) if (c.tokens.has(tok)) shared++;
      if (shared > bestShared) {
        best = c;
        bestShared = shared;
      }
    }
    const containment = msgTokens.size ? bestShared / msgTokens.size : 0;

    const last = byActivity()[0];
    const lastMsg = last?.messages[last.messages.length - 1];
    const minutesSinceLast = last && !Number.isNaN(t) ? (t - last.lastTime) / 60_000 : Number.POSITIVE_INFINITY;

    const isProblem = PROBLEM.test(text) && text.length >= MIN_NEW_ISSUE_LENGTH && !AGREEMENT.test(text);
    const isFollowUp = FOLLOW_UP.test(text);

    let target: Cluster | null = null;
    if (best && bestShared >= 2 && containment >= 0.2) {
      target = best; // same topic
    } else if (last && lastMsg?.sender === msg.sender && minutesSinceLast <= 3) {
      target = last; // the same person continuing their report
    } else if (last && minutesSinceLast <= 30 && (AGREEMENT.test(text) || ACTION_REQUEST.test(text))) {
      target = last; // confirmation or hand-off in the same thread
    } else if (best && bestShared >= 1 && (STRONG_FOLLOW_UP.test(text) || (isFollowUp && !isProblem))) {
      target = best; // "any update on the payment issue?"
    } else if (isProblem) {
      target = { messages: [], tokens: new Set(), attachmentRefs: new Set(), lastTime: t };
      clusters.push(target);
    } else if (isFollowUp && clusters.length > 0) {
      target = latestFor(msg.sender, t) ?? last;
    }

    if (!target) continue; // chit-chat, acknowledgements, greetings

    target.messages.push(msg);
    for (const tok of msgTokens) target.tokens.add(tok);
    if (msg.attachment) target.attachmentRefs.add(msg.attachment.ref);
    if (!Number.isNaN(t)) target.lastTime = t;

    // Claim screenshots the same sender posted shortly before this message.
    const pending = pendingBySender.get(msg.sender ?? "");
    if (pending?.length) {
      const keep = [];
      for (const p of pending) {
        if (Number.isNaN(t) || Number.isNaN(p.t) || t - p.t <= 5 * 60_000) {
          target.attachmentRefs.add(p.ref);
          const pm = pendingMessages.get(p.ref);
          if (pm) target.messages.push(pm);
        } else keep.push(p);
      }
      pendingBySender.set(msg.sender ?? "", keep);
    }
  }

  // Loose screenshots (uploaded outside the chat) attach to the issue whose text best matches the file name.
  const looseFindings = input.looseAttachments.map((a) => ({
    ref: a.ref,
    description: `[Simulated] Image content was not analysed in demo mode. File "${a.fileName}" was uploaded alongside the chat.`,
  }));
  for (const a of input.looseAttachments) {
    const nameTokens = tokens(a.fileName.replace(/[-_]/g, " "));
    let best: Cluster | null = null;
    let bestScore = 0;
    for (const c of clusters) {
      const s = jaccard(nameTokens, c.tokens);
      if (s > bestScore) {
        best = c;
        bestScore = s;
      }
    }
    if (best && bestScore > 0) best.attachmentRefs.add(a.ref);
  }

  const issues: RawIssue[] = clusters.map((c) => {
    const ordered = [...c.messages].sort((a, b) => order.get(a.ref)! - order.get(b.ref)!);
    const first = ordered.find((m) => m.text.trim()) ?? ordered[0];
    const allText = ordered.map((m) => m.text).join("\n");
    const problemHits = (allText.match(new RegExp(PROBLEM.source, "gi")) ?? []).length;
    const quotes = ordered
      .filter((m) => m.text.trim())
      .slice(0, 6)
      .map((m) => `- ${m.sender ?? "Unknown"}: "${m.text.trim().slice(0, 280)}"`)
      .join("\n");
    const description = [
      `Reported in the WhatsApp conversation by ${first.sender ?? "an unknown sender"}.`,
      "",
      "Relevant messages:",
      quotes,
      c.attachmentRefs.size ? `\n${c.attachmentRefs.size} screenshot/file(s) attached as evidence.` : "",
    ]
      .join("\n")
      .trim();

    return {
      title: makeTitle(first.text),
      description,
      category: categorize(allText),
      priority: prioritize(allText),
      reported_by: first.sender,
      message_refs: ordered.map((m) => m.ref),
      attachment_refs: [...c.attachmentRefs],
      suggested_assignee: mentionedAssignee(c, participants),
      confidence: Math.min(0.92, 0.55 + 0.08 * Math.min(3, problemHits) + (c.attachmentRefs.size ? 0.05 : 0) + (ordered.length > 1 ? 0.05 : 0)),
      possible_duplicate_of: null,
    };
  });

  const messageFindings = input.messages
    .filter((m) => m.attachment?.kind === "image")
    .map((m) => ({
      ref: m.attachment!.ref,
      description: `[Simulated] Image content was not analysed in demo mode. Shared by ${m.sender ?? "an unknown sender"}${
        m.text ? ` with the caption "${m.text.slice(0, 160)}"` : ""
      }.`,
    }));

  return { issues, attachment_findings: [...messageFindings, ...looseFindings] };
}

export class MockAIProvider implements AIProvider {
  readonly info = { name: "mock", model: "mock-heuristic-v1", simulated: true, supportsVision: false };

  async extract(input: ExtractionInput): Promise<string> {
    return JSON.stringify(mockExtract(input));
  }
}
