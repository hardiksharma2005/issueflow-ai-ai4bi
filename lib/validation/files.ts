// File validation shared by the browser (fast feedback) and the server (authoritative).
// Content is checked by magic bytes on the server; extensions alone are never trusted.

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // matches the storage bucket limit
export const MAX_IMPORT_FILES = 40;
export const MAX_IMPORT_TOTAL_BYTES = 100 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 500;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

export type FileKind = "chat" | "zip" | "image" | "document" | "audio" | "video";

interface TypeInfo {
  kind: FileKind;
  mime: string;
}

const EXTENSIONS: Record<string, TypeInfo> = {
  txt: { kind: "chat", mime: "text/plain" },
  zip: { kind: "zip", mime: "application/zip" },
  png: { kind: "image", mime: "image/png" },
  jpg: { kind: "image", mime: "image/jpeg" },
  jpeg: { kind: "image", mime: "image/jpeg" },
  webp: { kind: "image", mime: "image/webp" },
  gif: { kind: "image", mime: "image/gif" },
  pdf: { kind: "document", mime: "application/pdf" },
  csv: { kind: "document", mime: "text/csv" },
  doc: { kind: "document", mime: "application/msword" },
  docx: { kind: "document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  xls: { kind: "document", mime: "application/vnd.ms-excel" },
  xlsx: { kind: "document", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  mp4: { kind: "video", mime: "video/mp4" },
  opus: { kind: "audio", mime: "audio/opus" },
  ogg: { kind: "audio", mime: "audio/ogg" },
  mp3: { kind: "audio", mime: "audio/mpeg" },
  m4a: { kind: "audio", mime: "audio/mp4" },
};

export function extensionOf(name: string) {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

export function typeFromName(name: string): TypeInfo | null {
  return EXTENSIONS[extensionOf(name)] ?? null;
}

/** Keep only safe characters; never allow path traversal. */
export function sanitizeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f\u200E\u200F]/g, "")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .slice(-120);
  return cleaned || "file";
}

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) =>
  sig.every((b, i) => bytes[offset + i] === b);

/** Verify that the file content matches what its extension claims. */
export function sniffMatches(bytes: Uint8Array, info: TypeInfo): boolean {
  switch (info.mime) {
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]);
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/gif":
      return startsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
    case "image/webp":
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
    case "application/pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]);
    case "application/zip":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]);
    case "text/plain":
    case "text/csv":
      return looksLikeText(bytes);
    default:
      return true; // audio/video/legacy office: allowed by extension + bucket MIME allow-list
  }
}

function looksLikeText(bytes: Uint8Array) {
  const sample = bytes.subarray(0, 4096);
  for (const b of sample) {
    if (b === 0) return false; // NUL bytes => binary
  }
  return true;
}

export interface FileCheck {
  ok: boolean;
  error?: string;
  info?: TypeInfo;
}

export function checkFile(name: string, size: number): FileCheck {
  const info = typeFromName(name);
  if (!info) return { ok: false, error: `${name}: unsupported file type` };
  if (size <= 0) return { ok: false, error: `${name}: file is empty` };
  if (size > MAX_FILE_BYTES) return { ok: false, error: `${name}: larger than 25 MB` };
  return { ok: true, info };
}
