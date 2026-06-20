import { getLlmClient, getChatModel, getEmbeddingModel } from "../lib/llmClient";

export class EmbeddingService {
  /**
   * Generates a short semantic docstring/summary for a code symbol via the
   * configured chat model. Returns "" if no LLM client or chat model is
   * configured (callers treat empty summaries as a no-op).
   */
  public static async generateSummary(
    name: string,
    filePath: string,
    signature: string,
    sourceCode: string,
  ): Promise<string> {
    const client = getLlmClient();
    const model = getChatModel();
    if (!client || !model) return "";

    const prompt = `Given this function/class, write a single concise paragraph (2-4 sentences) in plain English
describing what it does, what it accepts as input, what it returns, and any important
side effects or error conditions. Do not describe implementation details unless they
are the only way to convey the function's behaviour.

Function/Class name: ${name}
File: ${filePath}
Signature: ${signature}
Source:
${sourceCode}`;

    try {
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      });
      return response.choices?.[0]?.message?.content?.trim() || "";
    } catch (e) {
      console.error(`Failed to generate summary for ${name}:`, e);
      return "";
    }
  }

  /**
   * Generates a vector embedding for a piece of text (usually the summary)
   * via the configured embedding model. Returns [] if no LLM client or
   * embedding model is configured. Semantic search gracefully degrades to
   * "no results" when this returns empty.
   */
  public static async generateEmbedding(text: string): Promise<number[]> {
    const client = getLlmClient();
    const model = getEmbeddingModel();
    if (!client || !model || !text) return [];

    try {
      const response = await client.embeddings.create({
        model,
        input: text,
      });
      return response.data?.[0]?.embedding || [];
    } catch (e) {
      console.error("Failed to generate embedding:", e);
      return [];
    }
  }

  /**
   * Cosine similarity between two equal-length vectors. Returns 0 for
   * length-mismatched inputs (e.g., when the embedding model was swapped
   * after indexing — prevents silently wrong-but-nonzero scores).
   */
  public static cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
