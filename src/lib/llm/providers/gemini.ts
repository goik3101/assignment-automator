import { ApiError } from "@google/genai";
import { getGeminiClient, GEMINI_MODELS, EMBEDDING_DIMENSIONS } from "../../gemini/client.ts";
import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse, type ModelRole, type SearchGrounding } from "../types.ts";

// 기존 Gemini 호출을 그대로 감싼 제공자. 동작은 예전 서비스 코드와 같게 유지한다(검색 그라운딩 메타데이터를 정규화해 돌려줌).
function toError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  if (err instanceof ApiError) {
    const s = err.status;
    if (s === 402) return new LlmError(err.message, "quota", false, s);
    if (s === 429) return new LlmError(err.message, "rate_limit", true, s);
    if (s === 401 || s === 403) return new LlmError(err.message, "auth", false, s);
    if (s === 400) return new LlmError(err.message, "bad_request", false, s);
    if (s >= 500) return new LlmError(err.message, "server", true, s);
    return new LlmError(err.message, "unknown", false, s);
  }
  if (err instanceof TypeError) return new LlmError(String(err.message), "network", true);
  return new LlmError(err instanceof Error ? err.message : String(err), "unknown", false);
}

export const geminiProvider: LlmProvider = {
  name: "gemini",
  model(role: ModelRole) {
    return role === "main" || role === "write" ? GEMINI_MODELS.flash : GEMINI_MODELS.flashLite;
  },
  async generate(req: LlmRequest, model: string): Promise<LlmResponse> {
    const ai = getGeminiClient();
    const parts = (typeof req.prompt === "string" ? [{ text: req.prompt }] : req.prompt).map((p) =>
      "text" in p ? { text: p.text } : { inlineData: { data: p.image.base64, mimeType: p.image.mimeType } }
    );
    try {
      const resp = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          ...(req.system ? { systemInstruction: req.system } : {}),
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
          ...(req.search ? { tools: [{ googleSearch: {} }] } : {}),
          ...(req.schema ? { responseMimeType: "application/json", responseSchema: req.schema } : {}),
        },
      });
      const g = resp.candidates?.[0]?.groundingMetadata;
      const grounding: SearchGrounding | undefined = req.search
        ? {
            queries: g?.webSearchQueries ?? [],
            chunks: (g?.groundingChunks ?? []).map((c) => ({ web: { uri: c.web?.uri, title: c.web?.title } })),
            supports: (g?.groundingSupports ?? []).map((s) => ({
              segment: { startIndex: s.segment?.startIndex, endIndex: s.segment?.endIndex },
              groundingChunkIndices: s.groundingChunkIndices,
              unit: "utf8" as const,
            })),
            searchCalls: g?.webSearchQueries?.length ?? 0,
          }
        : undefined;
      return {
        text: resp.text ?? "",
        grounding,
        usage: {
          inputTokens: resp.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: resp.usageMetadata?.candidatesTokenCount ?? 0,
          searchCalls: grounding?.searchCalls ?? 0,
        },
        provider: "gemini",
        model,
      };
    } catch (err) {
      throw toError(err);
    }
  },
  async embed(text, purpose) {
    const ai = getGeminiClient();
    try {
      const response = await ai.models.embedContent({
        model: GEMINI_MODELS.embedding,
        contents: text,
        config: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: purpose === "clustering" ? "CLUSTERING" : "SEMANTIC_SIMILARITY" },
      });
      const values = response.embeddings?.[0]?.values;
      if (!values) throw new LlmError("임베딩 응답이 비어 있습니다.", "empty_output", false);
      return values;
    } catch (err) {
      throw toError(err);
    }
  },
};
