// GroqAIProvider — calls GroqCloud's OpenAI-compatible Chat Completions API with a strict
// JSON-schema structured output. Server-only: the API key never reaches the browser.
// Docs: https://console.groq.com/docs/structured-outputs , /docs/reasoning , /docs/rate-limits
//
// Not to be confused with xAI Grok (lib/ai/grok.ts). The Groq models that support strict
// structured outputs (openai/gpt-oss-*) are text-only, so screenshots are not sent.

import "server-only";
import { extractionJsonSchema } from "./schema";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { AIProviderError, type AIProvider, type ExtractionInput } from "./types";

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

interface GroqOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class GroqAIProvider implements AIProvider {
  readonly info;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: GroqOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 120_000;
    // The free plan allows ~8K tokens per minute on gpt-oss models: keep each request small.
    this.info = { name: "groq", model: options.model, simulated: false, supportsVision: false, batchSize: 60, maxExistingIssues: 60 };
  }

  async extract(input: ExtractionInput): Promise<string> {
    const body = {
      model: this.info.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "issue_extraction", strict: true, schema: extractionJsonSchema },
      },
      // Reasoning tokens count against the per-minute limit; extraction doesn't need much.
      reasoning_effort: "low",
      include_reasoning: false,
      temperature: 0.2,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      throw new AIProviderError(aborted ? "Groq API request timed out" : "Could not reach the Groq API", true);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // Never echo the request (it contains user data) or headers (API key) into errors.
      const detail = (await res.text().catch(() => "")).slice(0, 300).replace(/\s+/g, " ");
      if (res.status === 401 || res.status === 403) {
        throw new AIProviderError("Groq API rejected the API key (check GROQ_API_KEY)");
      }
      if (res.status === 429) {
        const seconds = Number(res.headers.get("retry-after"));
        throw new AIProviderError(
          "Groq rate limit reached (the free plan allows a limited number of tokens per minute)",
          true,
          Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined,
        );
      }
      // 400 json_validate_failed: the model produced JSON that didn't match the schema — worth one retry.
      const schemaMiss = res.status === 400 && /json_validate_failed|does not match/i.test(detail);
      throw new AIProviderError(`Groq API error ${res.status}: ${detail}`, schemaMiss || res.status >= 500);
    }

    const json = (await res.json()) as GroqResponse;
    const text = json.choices?.[0]?.message?.content;
    if (!text) throw new AIProviderError("Groq API returned no output", true);
    return text;
  }
}

interface GroqResponse {
  choices?: { message?: { content?: string | null } }[];
}
