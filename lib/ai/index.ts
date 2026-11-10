import "server-only";
import { GrokAIProvider } from "./grok";
import { DEFAULT_GROQ_MODEL, GroqAIProvider } from "./groq";
import { MockAIProvider } from "./mock";
import type { AIProvider } from "./types";

export const DEFAULT_GROK_MODEL = "grok-4.7";

type ProviderChoice = "mock" | "grok" | "groq";

function choice(): ProviderChoice {
  const value = (process.env.AI_PROVIDER ?? "mock").toLowerCase();
  return value === "grok" || value === "groq" ? value : "mock";
}

/** Explains a key that belongs to the other, similarly named provider. */
function keyProblem(provider: ProviderChoice): string | null {
  if (provider === "grok" && process.env.XAI_API_KEY?.startsWith("gsk_")) {
    return "XAI_API_KEY contains a Groq key (gsk_…). For GroqCloud set AI_PROVIDER=groq and GROQ_API_KEY.";
  }
  if (provider === "groq" && process.env.GROQ_API_KEY?.startsWith("xai-")) {
    return "GROQ_API_KEY contains an xAI key (xai-…). For xAI Grok set AI_PROVIDER=grok and XAI_API_KEY.";
  }
  return null;
}

/**
 * AI_PROVIDER=mock (default) needs no key and costs nothing.
 * AI_PROVIDER=groq uses GroqCloud (GROQ_API_KEY; free plan with rate limits).
 * AI_PROVIDER=grok uses xAI Grok (XAI_API_KEY; billed per token).
 * There is never a silent fallback between providers, and a mock result never claims to be a model's.
 */
export function getAIProvider(): AIProvider {
  const provider = choice();
  const problem = keyProblem(provider);
  if (problem) throw new Error(problem);
  if (provider === "grok") {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) throw new Error("AI_PROVIDER is set to grok but XAI_API_KEY is not configured.");
    return new GrokAIProvider({
      apiKey,
      model: process.env.XAI_MODEL || DEFAULT_GROK_MODEL,
      baseUrl: process.env.XAI_BASE_URL || undefined,
    });
  }
  if (provider === "groq") {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("AI_PROVIDER is set to groq but GROQ_API_KEY is not configured.");
    return new GroqAIProvider({ apiKey, model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL });
  }
  return new MockAIProvider();
}

export function describeConfiguredProvider() {
  const provider = choice();
  const problem = keyProblem(provider);
  if (provider === "grok") {
    return {
      name: "grok",
      label: "xAI Grok",
      model: process.env.XAI_MODEL || DEFAULT_GROK_MODEL,
      configured: Boolean(process.env.XAI_API_KEY) && !problem,
      missing: problem ?? "XAI_API_KEY is missing",
      simulated: false,
      supportsVision: true,
    };
  }
  if (provider === "groq") {
    return {
      name: "groq",
      label: "GroqCloud",
      model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
      configured: Boolean(process.env.GROQ_API_KEY) && !problem,
      missing: problem ?? "GROQ_API_KEY is missing",
      simulated: false,
      supportsVision: false,
    };
  }
  return { name: "mock", label: "MockAIProvider", model: "mock-heuristic-v1", configured: true, missing: "", simulated: true, supportsVision: false };
}
