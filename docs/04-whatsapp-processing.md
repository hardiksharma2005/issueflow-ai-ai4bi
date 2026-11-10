# 04 · WhatsApp processing

Code: `lib/whatsapp/parser.ts`, `lib/whatsapp/media.ts`, `lib/validation/files.ts`, `lib/imports/pipeline.ts › parseImport`. Tests: `tests/unit/parser.test.ts`.

## How users export a chat

- **Android:** open the chat → ⋮ → More → Export chat → *Include media* (or *Without media*). Produces `WhatsApp Chat with <name>.txt`, or a `.zip` containing the `.txt` and media files.
- **iPhone:** open the chat → contact/group name → Export Chat → *Attach Media*. Produces a `.zip` with `_chat.txt` and files such as `00000012-PHOTO-2024-03-12-14-05-33.jpg`.

Users can upload the `.zip`, or the `.txt` plus screenshots separately, plus any loose screenshots or documents that were shared elsewhere.

## Supported formats

| Variant | Example header |
|---|---|
| Android, 24 h | `12/03/2024, 14:05 - Priya Shah: The payment page is down` |
| Android, 12 h | `3/12/24, 2:05 PM - Priya Shah: …` (also `p.m.`, narrow no-break spaces) |
| iOS | `[12/03/2024, 14:05:33] Priya Shah: …` |
| Dotted dates | `12.03.24, 14:05 - …` |
| Year first | `2024-03-12 14:05 - …` |

Lines without a header continue the previous message (multi-line messages). Invisible direction marks (U+200E etc.) and Unicode spaces that WhatsApp inserts are stripped before matching.

### Dates and time zones

- **Date order** is detected across the whole file: any first part > 12 means day-first, any second part > 12 means month-first, a 4-digit first part means year-first. If every date is ambiguous the parser assumes day/month/year and records a warning.
- WhatsApp writes local times without a zone. The browser sends its `getTimezoneOffset()` with the parse request and timestamps are stored in UTC.
- A date that cannot be parsed is stored as `sent_at = null` with the original text kept in `raw_timestamp`. The parser never guesses.

### Message classification

| Kind | Detection | Stored as |
|---|---|---|
| Normal message | `Sender: text` after the header | `sender`, `body` |
| System message | No sender (group created, X added Y…), encryption notice, deleted message, missed call, security code changed; iOS events marked with an invisible character | `is_system = true` — shown in the preview, never sent to the AI |
| Attachment (iOS) | `<attached: 00000012-PHOTO-….jpg>` | `attachment_name` |
| Attachment (Android) | `IMG-20241103-WA0001.jpg (file attached)` (also Spanish/French/German labels) | `attachment_name` |
| Omitted media | `<Media omitted>`, `image omitted`, … | warning "N attachment(s) were omitted by WhatsApp" |
| Empty | nothing after the sender | skipped, counted in a warning |

A file with no recognisable message headers is rejected with: *"No WhatsApp messages were found. Export the chat from WhatsApp (More → Export chat) and upload the .txt file or the .zip archive."* Unknown senders are kept as `null`, never invented.

## Media matching

`matchMedia(messages, files, tzOffset)` links uploaded files to messages, most confident first:

1. Exact file name referenced in a message.
2. Case-/whitespace-insensitive name match.
3. iOS names that embed a timestamp (`…-2024-03-12-14-05-33.jpg`) → the closest message within 2 minutes.

Anything else is **unmatched**: stored as evidence for the import and offered to the AI as a "loose attachment", but never attached to a message by guesswork. Messages that reference a file that was not uploaded are flagged `attachment_missing` and listed in the import notes.

## Server-side checks

Before parsing, every uploaded object is downloaded from storage and checked again on the server (client checks are a convenience, not a control):

| Check | Limit |
|---|---|
| File size | 25 MB per file (also enforced by the storage bucket) |
| Files per import | 40 |
| Total upload | 100 MB |
| ZIP entries | 500 |
| ZIP uncompressed size | 200 MB in total (zip-bomb guard; counted entry by entry while extracting, import fails when exceeded) |
| Messages | 20,000 per import (excess truncated with a warning) |
| File signature | Magic bytes must match the extension (PNG, JPEG, GIF, WebP, PDF, ZIP/Office); `.txt` must be valid text |
| File names | Sanitised: path components, control characters and unsafe characters removed |

Paths inside archives are never trusted: every entry is flattened to its file name. macOS metadata (`__MACOSX/`, dot-files) is ignored; nested ZIPs, unsupported types and entries whose content does not match their extension are skipped and reported in the import notes.

## Duplicate imports

The sha256 of the chat text (line endings normalised) — or, for screenshot-only imports, of the files — is stored in `imports.content_hash`. A partial unique index allows each conversation once per project (failed and duplicate attempts don't count, so a failed import can be retried). A second upload ends with status **duplicate** and a message pointing to the original import; no messages are stored twice.

## Untrusted content

Message text is stored and displayed verbatim, rendered as text (React escapes it; no HTML rendering). It reaches the AI only inside a delimited JSON data block with explicit instructions not to follow it (see [05-ai-integration.md](05-ai-integration.md)). The sample chat in `public/demo/` deliberately contains a prompt-injection message to demonstrate this.

## Sample data

`public/demo/` (regenerate with `npm run demo:assets`):

- `WhatsApp Chat with Bloom Retail Support.txt` — Android format, 37 messages, 5 participants, 7 real issues mixed with chatter, one prompt-injection attempt, one omitted media item, one referenced PDF that is not included.
- Three screenshots referenced by name in the chat, one loose screenshot (`slow-category-page-load.png`).
- `WhatsApp Chat with Bloom Retail Support.zip` — the chat plus the three referenced screenshots, as WhatsApp would export it.
