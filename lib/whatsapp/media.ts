// Matches uploaded media files (from a ZIP export or uploaded separately) to parsed messages.
//
// Strategy, in order of confidence:
//   1. Exact file-name reference in the message ("IMG-20240312-WA0003.jpg (file attached)").
//   2. Case-insensitive / whitespace-normalised name match.
//   3. iOS-style names that embed a timestamp ("00000012-PHOTO-2024-03-12-14-05-33.jpg")
//      matched to the message with the closest timestamp within 2 minutes.
// Anything else is kept as an "unmatched" file: still stored as evidence, never guessed.

import type { ParsedMessage } from "./parser";

export interface MediaFile {
  name: string;
  size: number;
  mimeType: string;
}

export interface MediaMatch {
  /** message seq -> media file name */
  bySeq: Map<number, string>;
  /** messages that reference a file we did not receive */
  missing: number[];
  /** media files that could not be linked to any message */
  unmatched: string[];
}

const normalise = (name: string) => name.replace(/[\u200E\u200F]/g, "").trim().toLowerCase();

const IOS_TS = /(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/;

export function timestampFromFileName(name: string): Date | null {
  const m = IOS_TS.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function matchMedia(
  messages: Pick<ParsedMessage, "seq" | "attachmentName" | "sentAt" | "isSystem">[],
  files: MediaFile[],
  timezoneOffsetMinutes = 0,
): MediaMatch {
  const bySeq = new Map<number, string>();
  const used = new Set<string>();
  const byName = new Map(files.map((f) => [normalise(f.name), f.name]));
  const missing: number[] = [];

  for (const msg of messages) {
    if (!msg.attachmentName) continue;
    const exact = files.find((f) => f.name === msg.attachmentName);
    const fuzzy = exact?.name ?? byName.get(normalise(msg.attachmentName));
    if (fuzzy && !used.has(fuzzy)) {
      bySeq.set(msg.seq, fuzzy);
      used.add(fuzzy);
    } else if (!fuzzy) {
      missing.push(msg.seq);
    }
  }

  // Timestamp-based fallback for files that were not referenced by name.
  const candidates = messages.filter((m) => !m.isSystem && m.sentAt && !bySeq.has(m.seq));
  for (const file of files) {
    if (used.has(file.name)) continue;
    const ts = timestampFromFileName(file.name);
    if (!ts) continue;
    const fileTime = ts.getTime() + timezoneOffsetMinutes * 60_000;
    let best: { seq: number; delta: number } | null = null;
    for (const m of candidates) {
      if (bySeq.has(m.seq)) continue;
      const delta = Math.abs(new Date(m.sentAt!).getTime() - fileTime);
      if (delta <= 120_000 && (!best || delta < best.delta)) best = { seq: m.seq, delta };
    }
    if (best) {
      bySeq.set(best.seq, file.name);
      used.add(file.name);
    }
  }

  const unmatched = files.filter((f) => !used.has(f.name)).map((f) => f.name);
  return { bySeq, missing, unmatched };
}
