import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectDateOrder, parseTimestamp, parseWhatsAppChat, WhatsAppParseError } from "@/lib/whatsapp/parser";

const sample = readFileSync(
  path.join(__dirname, "../../public/demo/WhatsApp Chat with Bloom Retail Support.txt"),
  "utf8",
);

describe("parseWhatsAppChat — Android export", () => {
  const result = parseWhatsAppChat(sample);

  it("detects the format and day-first date order", () => {
    expect(result.format).toBe("android");
    expect(result.dateOrder).toBe("DMY");
  });

  it("parses senders, timestamps and preserves order", () => {
    const first = result.messages.find((m) => m.sender === "Priya Shah")!;
    expect(first.body).toBe("Good morning team 👋");
    expect(first.sentAt).toBe("2026-11-03T09:15:00.000Z");
    expect(result.messages.map((m) => m.seq)).toEqual(result.messages.map((_, i) => i + 1));
  });

  it("marks system messages with no sender", () => {
    const system = result.messages.filter((m) => m.isSystem);
    expect(system.length).toBe(3);
    expect(system.every((m) => m.sender === null)).toBe(true);
  });

  it("joins multiline messages", () => {
    const multi = result.messages.find((m) => m.sender === "Meera Iyer" && m.body.includes("#48213"))!;
    expect(multi.body.split("\n")).toHaveLength(3);
    expect(multi.body).toContain("Can someone look into the email notifications?");
  });

  it("extracts attachments, captions and omitted media", () => {
    const img = result.messages.find((m) => m.attachmentName === "IMG-20261103-WA0001.jpg")!;
    expect(img.body).toBe("");
    const doc = result.messages.find((m) => m.attachmentName === "DOC-20261106-WA0004.pdf")!;
    expect(doc.body).toBe("Delivery delay report from the courier");
    expect(result.messages.filter((m) => m.attachmentOmitted)).toHaveLength(1);
    expect(result.warnings.join(" ")).toMatch(/omitted/);
  });

  it("lists participants", () => {
    expect(result.participants).toEqual(["Arjun Mehta", "Daniel Okafor", "Meera Iyer", "Priya Shah", "Sara Lim"]);
  });
});

describe("parseWhatsAppChat — format variations", () => {
  it("parses iOS exports with seconds, brackets and invisible marks", () => {
    const ios = [
      "[12/03/2024, 14:05:33] Bloom Group: \u200EMessages and calls are end-to-end encrypted.",
      "[12/03/2024, 14:06:01] Priya Shah: The login page is blank",
      "[12/03/2024, 14:06:20] Priya Shah: \u200E<attached: 00000012-PHOTO-2024-03-12-14-06-20.jpg>",
      "[12/03/2024, 14:07:00] Bloom Group: \u200EArjun added Sara",
    ].join("\n");
    const r = parseWhatsAppChat(ios);
    expect(r.format).toBe("ios");
    expect(r.messages).toHaveLength(4);
    expect(r.messages[0].isSystem).toBe(true);
    expect(r.messages[1]).toMatchObject({ sender: "Priya Shah", body: "The login page is blank", sentAt: "2024-03-12T14:06:01.000Z" });
    expect(r.messages[2].attachmentName).toBe("00000012-PHOTO-2024-03-12-14-06-20.jpg");
    expect(r.messages[3].isSystem).toBe(true);
  });

  it("parses US 12-hour exports (with narrow no-break space) as month-first", () => {
    const us = [
      "3/12/24, 2:05 PM - John: Checkout is slow",
      "3/13/24, 12:30 AM - Jane: Still slow",
    ].join("\n");
    const r = parseWhatsAppChat(us);
    expect(r.dateOrder).toBe("MDY");
    expect(r.messages[0].sentAt).toBe("2024-03-12T14:05:00.000Z");
    expect(r.messages[1].sentAt).toBe("2024-03-13T00:30:00.000Z");
  });

  it("parses dotted European dates", () => {
    const r = parseWhatsAppChat("25.12.23, 18:00 - Anna: Heizung ist kaputt");
    expect(r.messages[0].sentAt).toBe("2023-12-25T18:00:00.000Z");
  });

  it("applies the exporter timezone offset", () => {
    const r = parseWhatsAppChat("25/12/2023, 18:00 - Anna: hi", { timezoneOffsetMinutes: -330 });
    expect(r.messages[0].sentAt).toBe("2023-12-25T12:30:00.000Z");
  });

  it("warns when the date order is ambiguous", () => {
    const r = parseWhatsAppChat("01/02/2024, 10:00 - A: hello");
    expect(r.warnings.join(" ")).toMatch(/ambiguous/);
  });

  it("keeps messages with impossible dates but marks the date unknown", () => {
    const r = parseWhatsAppChat("31/02/2024, 10:00 - A: broken date\n01/03/2024, 10:00 - B: ok date");
    expect(r.messages[0].sentAt).toBeNull();
    expect(r.messages[0].rawTimestamp).toBe("31/02/2024 10:00");
    expect(r.warnings.join(" ")).toMatch(/unrecognised date/);
  });

  it("skips empty messages", () => {
    const r = parseWhatsAppChat("01/03/2024, 10:00 - A: \n01/03/2024, 10:01 - B: real");
    expect(r.messages).toHaveLength(1);
    expect(r.warnings.join(" ")).toMatch(/empty/);
  });

  it("rejects files that are not WhatsApp exports", () => {
    expect(() => parseWhatsAppChat("hello world\nthis is not a chat")).toThrow(WhatsAppParseError);
  });

  it("truncates huge imports", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `01/03/2024, 10:${String(i).padStart(2, "0")} - A: msg ${i}`);
    const r = parseWhatsAppChat(lines.join("\n"), { maxMessages: 10 });
    expect(r.messages).toHaveLength(10);
    expect(r.warnings.join(" ")).toMatch(/truncated/);
  });
});

describe("date helpers", () => {
  it("detects year-first dates", () => {
    expect(detectDateOrder(["2024-03-12"])).toBe("YMD");
  });
  it("converts 12 AM / 12 PM correctly", () => {
    expect(parseTimestamp("1/1/24", "12:00", "AM", "MDY")?.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(parseTimestamp("1/1/24", "12:00", "PM", "MDY")?.toISOString()).toBe("2024-01-01T12:00:00.000Z");
  });
});
