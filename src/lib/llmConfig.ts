import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface LlmConfigForm {
  endpoint: string;
  apiKey: string;
  chatModel: string;
  embeddingModel: string;
}

export interface LlmConfigView {
  endpoint: string;
  hasApiKey: boolean;
  chatModel: string;
  embeddingModel: string;
  configured: boolean;
}

export interface RemoteModel {
  id: string;
  name?: string;
}

export interface RemoteModelsResult {
  ok: boolean;
  count?: number;
  models?: RemoteModel[];
  error?: string;
}

const ENV_LOCAL_PATH = join(process.cwd(), ".env.local");
const DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1";

export function viewFromEnv(): LlmConfigView {
  const endpoint = process.env.LLM_ENDPOINT || DEFAULT_ENDPOINT;
  const chatModel = process.env.LLM_MODEL || "";
  const embeddingModel = process.env.LLM_EMBEDDING_MODEL || "";
  return {
    endpoint,
    hasApiKey: Boolean(process.env.LLM_API_KEY),
    chatModel,
    embeddingModel,
    configured: Boolean(process.env.LLM_API_KEY && chatModel),
  };
}

/**
 * Fetches the model catalog from an OpenAI-compatible /v1/models endpoint.
 * Doubles as the connection test — a 200 response means the endpoint is
 * reachable and the key is valid. AbortController caps the wait at 8s.
 */
export async function fetchRemoteModels(
  endpoint: string,
  apiKey: string,
): Promise<RemoteModelsResult> {
  if (!endpoint) return { ok: false, error: "Endpoint URL is required." };
  if (!apiKey) return { ok: false, error: "API key is required." };

  try {
    const url = `${endpoint.replace(/\/$/, "")}/models`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Endpoint returned ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = await res.json();
    const raw: any[] = data.data || data.models || [];
    const models: RemoteModel[] = raw
      .map((m: any) => ({
        id: typeof m.id === "string" ? m.id : typeof m.name === "string" ? m.name : "",
        name: typeof m.name === "string" ? m.name : undefined,
      }))
      .filter((m) => m.id.length > 0)
      .sort((a, b) => a.id.localeCompare(b.id));

    return { ok: true, count: models.length, models };
  } catch (e: any) {
    const msg = e?.name === "AbortError"
      ? "Timed out after 8s waiting for endpoint response."
      : e?.message || String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Persists the LLM config to .env.local. If `apiKey` is blank, preserves
 * any existing LLM_API_KEY already in the file (so the user doesn't have
 * to re-enter it on every save). Removes any leftover GEMINI_API_KEY line.
 */
export async function saveLlmConfigToEnvLocal(form: LlmConfigForm): Promise<void> {
  let contents = "";
  if (existsSync(ENV_LOCAL_PATH)) {
    contents = await readFile(ENV_LOCAL_PATH, "utf8");
  }
  const lines = contents.length > 0 ? contents.split("\n") : [];

  // Preserve existing key if the form's apiKey field is blank.
  let effectiveKey = form.apiKey;
  if (!effectiveKey) {
    const existing = lines.find((l) => /^LLM_API_KEY=/.test(l));
    if (existing) {
      effectiveKey = existing.replace(/^LLM_API_KEY="/, "").replace(/"$/, "");
    }
  }

  const updates: Record<string, string> = {
    LLM_ENDPOINT: form.endpoint || DEFAULT_ENDPOINT,
    LLM_API_KEY: effectiveKey,
    LLM_MODEL: form.chatModel,
    LLM_EMBEDDING_MODEL: form.embeddingModel,
  };

  // Strip any leftover GEMINI_API_KEY line (legacy).
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^GEMINI_API_KEY=/.test(lines[i])) {
      lines.splice(i, 1);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=`);
    const idx = lines.findIndex((l) => re.test(l));
    const newLine = `${key}="${value}"`;
    if (idx >= 0) {
      lines[idx] = newLine;
    } else {
      if (lines.length > 0 && lines[lines.length - 1] !== "") {
        lines.push("");
      }
      lines.push(newLine);
    }
  }

  await writeFile(ENV_LOCAL_PATH, lines.join("\n"), "utf8");
}
