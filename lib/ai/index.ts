import "server-only";
import { GrokAIProvider } from "./grok";
import { MockAIProvider } from "./mock";
import type { AIProvider } from "./types";

export const DEFAULT_GROK_MODEL = "grok-4.7";

/**
 * AI_PROVIDER=mock (default) needs no key and costs nothing.
 * AI_PROVIDER=grok requires XAI_API_KEY; we never silently fall back to a paid service,
 * and we never pretend a mock result came from Grok.
 */
export function getAIProvider(): AIProvider {
  const choice = (process.env.AI_PROVIDER ?? "mock").toLowerCase();
  if (choice === "grok") {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      throw new Error("AI_PROVIDER is set to grok but XAI_API_KEY is not configured.");
    }
    return new GrokAIProvider({
      apiKey,
      model: process.env.XAI_MODEL || DEFAULT_GROK_MODEL,
      baseUrl: process.env.XAI_BASE_URL || undefined,
    });
  }
  return new MockAIProvider();
}

export function describeConfiguredProvider() {
  const choice = (process.env.AI_PROVIDER ?? "mock").toLowerCase();
  if (choice === "grok") {
    return {
      name: "grok",
      model: process.env.XAI_MODEL || DEFAULT_GROK_MODEL,
      configured: Boolean(process.env.XAI_API_KEY),
      simulated: false,
    };
  }
  return { name: "mock", model: "mock-heuristic-v1", configured: true, simulated: true };
}
