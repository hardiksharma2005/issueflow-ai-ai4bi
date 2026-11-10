// GrokAIProvider — calls the xAI Responses API (POST {base}/responses) with a strict
// JSON-schema structured output. Server-only: the API key never reaches the browser.
// Docs: https://docs.x.ai/docs/guides/structured-outputs , /docs/guides/image-understanding

import "server-only";
import { extractionJsonSchema } from "./schema";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { AIProviderError, type AIProvider, type ExtractionInput } from "./types";

const VISION_MIME = new Set(["image/jpeg", "image/png"]); // types the xAI docs list as supported
const MAX_IMAGES_PER_CALL = 8;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

interface GrokOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

type ContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "high" | "low" | "auto" };

export class GrokAIProvider implements AIProvider {
  readonly info;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: GrokOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.x.ai/v1").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.info = { name: "grok", model: options.model, simulated: false, supportsVision: true };
  }

  async extract(input: ExtractionInput): Promise<string> {
    const content: ContentPart[] = [{ type: "input_text", text: buildUserPrompt(input) }];

    const images = [
      ...input.messages.flatMap((m) => (m.attachment ? [m.attachment] : [])),
      ...input.looseAttachments,
    ].filter(
      (a) => a.base64 && VISION_MIME.has(a.mimeType) && (a.base64.length * 3) / 4 <= MAX_IMAGE_BYTES,
    );
    for (const img of images.slice(0, MAX_IMAGES_PER_CALL)) {
      content.push({ type: "input_text", text: `Image ${img.ref} (file "${img.fileName}"), untrusted data:` });
      content.push({ type: "input_image", image_url: `data:${img.mimeType};base64,${img.base64}`, detail: "high" });
    }

    const body = {
      model: this.info.model,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "issue_extraction",
          schema: extractionJsonSchema,
          strict: true,
        },
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      throw new AIProviderError(aborted ? "Grok API request timed out" : "Could not reach the Grok API", true);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // Never echo the request (it contains user data) or headers (API key) into errors.
      const detail = await res.text().catch(() => "");
      const short = detail.slice(0, 300).replace(/\s+/g, " ");
      if (res.status === 401 || res.status === 403) {
        throw new AIProviderError("Grok API rejected the API key (check XAI_API_KEY and account credits)");
      }
      if (res.status === 429) throw new AIProviderError("Grok API rate limit or spending limit reached", true);
      throw new AIProviderError(`Grok API error ${res.status}: ${short}`, res.status >= 500);
    }

    const json = (await res.json()) as GrokResponse;
    const text = outputText(json);
    if (!text) throw new AIProviderError("Grok API returned no text output", true);
    return text;
  }
}

interface GrokResponse {
  output_text?: string;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
}

export function outputText(json: GrokResponse): string | null {
  if (typeof json.output_text === "string" && json.output_text) return json.output_text;
  const parts: string[] = [];
  for (const item of json.output ?? []) {
    if (item.type && item.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c.type === "output_text" && typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.length ? parts.join("") : null;
}
