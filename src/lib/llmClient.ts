import OpenAI from "openai";
import {
  getActiveChatPreset,
  getActiveEmbeddingPreset,
  apiKeyHash,
  migrateFromEnvLocalIfNeeded,
  type Preset,
} from "@/src/lib/llmPresets";

/**
 * Dual lazy singletons for the OpenAI-compatible client.
 *
 * Chat and embedding roles can be served by different presets (e.g.
 * OpenRouter for chat, local Ollama for embeddings). Each getter looks
 * up its active preset, builds a client keyed on
 * `${presetId}|${endpoint}|${sha256(apiKey)}`, and memoizes on
 * globalThis so dev hot-reload doesn't leak sockets.
 *
 * Not instantiated at module load — that would break `next build` on
 * fresh clones with no presets file. Mirrors the prisma.ts pattern.
 *
 * Returns null if no preset is active for the requested role. Callers
 * handle gracefully (review falls through to procedural findings,
 * embedding service returns empty vectors).
 */

interface CachedClient {
  client: OpenAI;
  cacheKey: string;
}

const globalForLlm = globalThis as unknown & {
  __llmChatClient?: CachedClient | null;
  __llmEmbeddingClient?: CachedClient | null;
};

function buildClient(preset: Preset): OpenAI {
  return new OpenAI({
    apiKey: preset.apiKey || "no-key-required",
    baseURL: preset.endpoint,
  });
}

function cacheKeyFor(preset: Preset): string {
  return `${preset.id}|${preset.endpoint}|${apiKeyHash(preset.apiKey || "")}`;
}

/**
 * Returns the OpenAI client for the currently-active chat preset.
 * Reads the presets file fresh on every call (~2KB, sub-ms) so users
 * don't need to restart the dev server after editing config.
 *
 * Returns null if no chat preset is active or the active preset has
 * no chatModel configured (callers should bail to a fallback).
 */
export function getChatClient(): OpenAI | null {
  migrateFromEnvLocalIfNeeded();
  const preset = getActiveChatPreset();
  if (!preset || !preset.chatModel) return null;

  const key = cacheKeyFor(preset);
  if (globalForLlm.__llmChatClient && globalForLlm.__llmChatClient.cacheKey === key) {
    return globalForLlm.__llmChatClient.client;
  }

  const client = buildClient(preset);
  globalForLlm.__llmChatClient = { client, cacheKey: key };
  return client;
}

export function getEmbeddingClient(): OpenAI | null {
  migrateFromEnvLocalIfNeeded();
  const preset = getActiveEmbeddingPreset();
  if (!preset || !preset.embeddingModel) return null;

  const key = cacheKeyFor(preset);
  if (globalForLlm.__llmEmbeddingClient && globalForLlm.__llmEmbeddingClient.cacheKey === key) {
    return globalForLlm.__llmEmbeddingClient.client;
  }

  const client = buildClient(preset);
  globalForLlm.__llmEmbeddingClient = { client, cacheKey: key };
  return client;
}

export function getChatModel(): string | null {
  migrateFromEnvLocalIfNeeded();
  const preset = getActiveChatPreset();
  return preset?.chatModel || null;
}

export function getEmbeddingModel(): string | null {
  migrateFromEnvLocalIfNeeded();
  const preset = getActiveEmbeddingPreset();
  return preset?.embeddingModel || null;
}
