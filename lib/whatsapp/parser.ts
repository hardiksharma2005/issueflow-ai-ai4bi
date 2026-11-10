// WhatsApp chat export parser.
//
// Supports the common export variants:
//   Android 24h : 12/03/2024, 14:05 - Priya Shah: The payment page is down
//   Android 12h : 3/12/24, 2:05 PM - Priya Shah: The payment page is down
//   iOS         : [12/03/2024, 14:05:33] Priya Shah: The payment page is down
//   Dotted      : 12.03.24, 14:05 - Priya Shah: ...
//   ISO-ish     : 2024-03-12 14:05 - Priya Shah: ...
// Lines that do not start with a timestamp header continue the previous message.
//
// Rules: never invent data. Unknown sender -> null. Unparseable date -> null (raw text kept).

export type DateOrder = "DMY" | "MDY" | "YMD";
export type ExportFormat = "android" | "ios" | "unknown";

export interface ParsedMessage {
  seq: number;
  sender: string | null;
  /** ISO 8601 timestamp, or null when the date could not be determined */
  sentAt: string | null;
  rawTimestamp: string | null;
  body: string;
  isSystem: boolean;
  /** File name referenced by the message, if any */
  attachmentName: string | null;
  /** WhatsApp exported the chat "without media" so the file is not available */
  attachmentOmitted: boolean;
}

export interface ParseResult {
  messages: ParsedMessage[];
  warnings: string[];
  format: ExportFormat;
  dateOrder: DateOrder;
  participants: string[];
}

export interface ParseOptions {
  /** Minutes to ADD to local chat time to reach UTC, i.e. `new Date().getTimezoneOffset()` of the exporter. */
  timezoneOffsetMinutes?: number;
  /** Hard cap to protect the server from enormous files. */
  maxMessages?: number;
  /** Force a date order instead of auto-detecting. */
  dateOrder?: DateOrder;
}

export class WhatsAppParseError extends Error {}

const INVISIBLE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069﻿]/g;
const SPACES = /[   ]/g;

const DATE = String.raw`(\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4})`;
const TIME = String.raw`(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?)`;
const AMPM = String.raw`(?:\s*([AaPp]\.?\s?[Mm]\.?))?`;

const ANDROID_HEADER = new RegExp(String.raw`^${DATE},?\s+${TIME}${AMPM}\s+[-–—]\s+([\s\S]*)$`);
const IOS_HEADER = new RegExp(String.raw`^\[${DATE},?\s+${TIME}${AMPM}\]\s+([\s\S]*)$`);

// "Name: text" — name must not be absurdly long and must not contain a colon.
const SENDER_SPLIT = /^([^:\n]{1,80}?):(?:\s([\s\S]*))?$/;

const ATTACHED_IOS = /<attached:\s*([^>]+?)\s*>/i;
const ATTACHED_ANDROID = /^(.+?\.[A-Za-z0-9]{2,5})\s+\((?:file attached|archivo adjunto|fichier joint|Datei angehängt)\)\s*$/im;
const OMITTED =
  /^(?:<Media omitted>|<Médias omis>|(?:image|video|audio|sticker|document|GIF|Contact card) omitted)$/im;

const SYSTEM_PATTERNS: RegExp[] = [
  /^Messages and calls are end-to-end encrypted/i,
  /^Messages to this group are now secured/i,
  /^This message was deleted\.?$/i,
  /^You deleted this message\.?$/i,
  /^Waiting for this message/i,
  /^Missed (?:voice|video) call/i,
  /^Your security code with .+ changed/i,
];
// iOS writes group events as "Group Name: \u200EAlice added Bob" — only treat as system when the
// body starts with the invisible marker AND looks like a membership/admin event.
const IOS_EVENT = /\b(added|left|removed|changed|created|joined|pinned|turned on|turned off)\b/i;

function clean(line: string) {
  return line.replace(SPACES, " ");
}

interface RawHeader {
  date: string;
  time: string;
  ampm: string | undefined;
  rest: string;
  format: ExportFormat;
  hadInvisibleMarker: boolean;
}

function matchHeader(line: string): RawHeader | null {
  const hadInvisibleMarker = /^[\u200E\u200F]/.test(line) || /:\s?[\u200E]/.test(line);
  const stripped = clean(line).replace(/^[\u200E\u200F﻿]+/, "");
  const visible = stripped.replace(INVISIBLE, "");
  let m = IOS_HEADER.exec(visible);
  if (m) return { date: m[1], time: m[2], ampm: m[3], rest: m[4], format: "ios", hadInvisibleMarker };
  m = ANDROID_HEADER.exec(visible);
  if (m) return { date: m[1], time: m[2], ampm: m[3], rest: m[4], format: "android", hadInvisibleMarker };
  return null;
}

function splitDate(date: string): [number, number, number] | null {
  const parts = date.split(/[\/.\-]/).map((p) => Number.parseInt(p, 10));
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return null;
  return [parts[0], parts[1], parts[2]];
}

/** Decide whether dates are day-first or month-first by looking at every header in the file. */
export function detectDateOrder(dates: string[]): DateOrder {
  let dayFirstEvidence = 0;
  let monthFirstEvidence = 0;
  for (const d of dates) {
    const parts = splitDate(d);
    if (!parts) continue;
    const [a, b] = parts;
    if (String(a).length === 4 || d.split(/[\/.\-]/)[0].length === 4) return "YMD";
    if (a > 12 && b <= 12) dayFirstEvidence++;
    if (b > 12 && a <= 12) monthFirstEvidence++;
  }
  if (monthFirstEvidence > dayFirstEvidence) return "MDY";
  return "DMY"; // WhatsApp's most common export order worldwide; ambiguity is reported as a warning
}

export function parseTimestamp(
  date: string,
  time: string,
  ampm: string | undefined,
  order: DateOrder,
  timezoneOffsetMinutes = 0,
): Date | null {
  const parts = splitDate(date);
  if (!parts) return null;
  let year: number;
  let month: number;
  let day: number;
  if (order === "YMD") [year, month, day] = parts;
  else if (order === "MDY") [month, day, year] = parts;
  else [day, month, year] = parts;
  if (year < 100) year += 2000;

  const t = time.split(/[:.]/).map((p) => Number.parseInt(p, 10));
  let hour = t[0];
  const minute = t[1];
  const second = t[2] ?? 0;
  if (ampm) {
    const pm = /^p/i.test(ampm);
    if (hour < 1 || hour > 12) return null;
    if (pm && hour !== 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;

  const utc = Date.UTC(year, month - 1, day, hour, minute, second) + timezoneOffsetMinutes * 60_000;
  const result = new Date(utc);
  // Reject impossible dates such as 31/02 (Date.UTC would roll them over).
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return result;
}

function extractAttachment(body: string): { body: string; attachmentName: string | null; omitted: boolean } {
  let attachmentName: string | null = null;
  let omitted = false;
  let text = body;

  const ios = ATTACHED_IOS.exec(text);
  if (ios) {
    attachmentName = ios[1].trim();
    text = text.replace(ATTACHED_IOS, "");
  } else {
    const android = ATTACHED_ANDROID.exec(text);
    if (android) {
      attachmentName = android[1].trim();
      text = text.replace(ATTACHED_ANDROID, "");
    } else if (OMITTED.test(text)) {
      omitted = true;
      text = text.replace(OMITTED, "");
    }
  }
  return { body: text.replace(INVISIBLE, "").trim(), attachmentName, omitted };
}

export function parseWhatsAppChat(input: string, options: ParseOptions = {}): ParseResult {
  const maxMessages = options.maxMessages ?? 20_000;
  const warnings: string[] = [];
  const lines = input.replace(/\r\n?/g, "\n").split("\n");

  // Pass 1: find headers so the date order can be detected from the whole file.
  interface Block {
    header: RawHeader;
    extra: string[];
  }
  const blocks: Block[] = [];
  let leadingOrphans = 0;
  for (const line of lines) {
    const header = matchHeader(line);
    if (header) {
      blocks.push({ header, extra: [] });
    } else if (blocks.length > 0) {
      blocks[blocks.length - 1].extra.push(clean(line).replace(INVISIBLE, ""));
    } else if (line.trim()) {
      leadingOrphans++;
    }
  }

  if (blocks.length === 0) {
    throw new WhatsAppParseError(
      "No WhatsApp messages were found. Export the chat from WhatsApp (More → Export chat) and upload the .txt file or the .zip archive.",
    );
  }
  if (leadingOrphans > 0) {
    warnings.push(`${leadingOrphans} line(s) before the first message were ignored.`);
  }

  const dateOrder = options.dateOrder ?? detectDateOrder(blocks.map((b) => b.header.date));
  if (!options.dateOrder && dateOrder === "DMY") {
    const ambiguous = blocks.every((b) => {
      const p = splitDate(b.header.date);
      return p ? p[0] <= 12 && p[1] <= 12 : true;
    });
    if (ambiguous) {
      warnings.push("Date order is ambiguous (all days ≤ 12); assumed day/month/year.");
    }
  }

  const formats = new Set(blocks.map((b) => b.header.format));
  const format: ExportFormat = formats.size === 1 ? [...formats][0] : "unknown";

  const messages: ParsedMessage[] = [];
  const participants = new Set<string>();
  let unparsedDates = 0;
  let emptySkipped = 0;

  for (const block of blocks) {
    if (messages.length >= maxMessages) {
      warnings.push(`Import truncated to the first ${maxMessages} messages.`);
      break;
    }
    const { header } = block;
    const rest = [header.rest, ...block.extra].join("\n");

    let sender: string | null = null;
    let body = rest;
    const split = SENDER_SPLIT.exec(rest);
    if (split) {
      sender = split[1].trim();
      body = split[2] ?? "";
    }

    const { body: text, attachmentName, omitted } = extractAttachment(body);

    // Header lines without "Name:" are always system lines (group created, member added...).
    let isSystem = sender === null;
    if (!isSystem && SYSTEM_PATTERNS.some((p) => p.test(text))) isSystem = true;
    if (
      !isSystem &&
      header.format === "ios" &&
      header.hadInvisibleMarker &&
      !attachmentName &&
      text.length < 160 &&
      IOS_EVENT.test(text)
    ) {
      isSystem = true;
    }

    if (!text && !attachmentName && !omitted) {
      emptySkipped++;
      continue;
    }

    const date = parseTimestamp(header.date, header.time, header.ampm, dateOrder, options.timezoneOffsetMinutes ?? 0);
    if (!date) unparsedDates++;

    if (sender && !isSystem) participants.add(sender);

    messages.push({
      seq: messages.length + 1,
      sender: isSystem ? null : sender,
      sentAt: date ? date.toISOString() : null,
      rawTimestamp: `${header.date} ${header.time}${header.ampm ? " " + header.ampm : ""}`,
      body: text,
      isSystem,
      attachmentName,
      attachmentOmitted: omitted,
    });
  }

  if (unparsedDates > 0) warnings.push(`${unparsedDates} message(s) have an unrecognised date; marked as unknown.`);
  if (emptySkipped > 0) warnings.push(`${emptySkipped} empty message(s) were skipped.`);
  const omittedCount = messages.filter((m) => m.attachmentOmitted).length;
  if (omittedCount > 0) {
    warnings.push(`${omittedCount} attachment(s) were omitted by WhatsApp ("Export without media").`);
  }

  return { messages, warnings, format, dateOrder, participants: [...participants].sort() };
}
