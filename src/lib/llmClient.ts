import OpenAI from "openai";

/**
 * Lazy singleton for the OpenAI-compatible client (OpenRouter by default).
 *
 * Not instantiated at module load — that would break `next build` and
 * `tsc --noEmit` on fresh clones with empty env. Mirrors the prisma.ts
 * pattern of caching on globalThis so dev hot-reload doesn't leak sockets.
 *
 * Returns null if LLM_API_KEY is unset. Callers handle gracefully
 * (review engine falls through to procedural findings, embedding service
 * returns empty vectors).
 */

const DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1";

const globalForLlm = globalThis as unknown & {
  __llmClient?: OpenAI;
  __llmClientKey?: string;
  __llmClientEndpoint?: string;
};

export function getLlmEndpoint(): string {
  return process.env.LLM_ENDPOINT || DEFAULT_ENDPOINT;
}

export function getChatModel(): string | null {
  const m = process.env.LLM_MODEL;
  return m && m.length > 0 ? m : null;
}

export function getEmbeddingModel(): string | null {
  const m = process.env.LLM_EMBEDDING_MODEL;
  return m && m.length > 0 ? m : null;
}

/**
 * Returns a cached OpenAI client keyed on the current apiKey+endpoint.
 * If the env values change (e.g., after a server restart), a fresh
 * client is constructed on the next call.
 */
export function getLlmClient(): OpenAI | null {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;

  const endpoint = getLlmEndpoint();
  const cacheKey = `${apiKey}|${endpoint}`;

  if (
    globalForLlm.__llmClient &&
    globalForLlm.__llmClientKey === cacheKey
  ) {
    return globalForLlm.__llmClient;
  }

  const client = new OpenAI({
    apiKey,
    baseURL: endpoint,
  });

  globalForLlm.__llmClient = client;
  globalForLlm.__llmClientKey = cacheKey;
  globalForLlm.__llmClientEndpoint = endpoint;
  return client;
}
