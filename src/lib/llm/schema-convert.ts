import type { Schema } from "@google/genai";
import { LlmError } from "./types.ts";

// Gemini 스타일 Schema(대문자 Type, nullable, 일부 필드만 required) → OpenAI Structured Outputs(strict) JSON Schema 변환.
// 서비스 코드의 스키마 15개는 그대로 두고 이 한 곳에서 변환한다.
//
// strict 모드 규칙: 모든 객체는 additionalProperties:false, 모든 속성이 required, 선택 항목은 null 허용 타입으로 표현.
//  - 원래 required가 아니던 속성 → ["type","null"]로 바꾸고 required에 넣는다(모델이 없으면 null을 낸다)
//  - nullable:true → ["type","null"] (enum이 있으면 null도 enum에 추가)
//  - 응답의 null은 restoreOptional()이 "원래 선택 항목이었으면 키 제거"로 되돌려 Gemini 때와 같은 모양으로 만든다.

type JsonSchema = Record<string, unknown>;

const TYPE_MAP: Record<string, string> = {
  OBJECT: "object",
  ARRAY: "array",
  STRING: "string",
  INTEGER: "integer",
  NUMBER: "number",
  BOOLEAN: "boolean",
};

const MAX_DEPTH = 10; // OpenAI strict 모드의 중첩 한도(문서 기준)
const MAX_PROPS = 5000;

function convert(node: Schema, depth: number, counter: { n: number }): JsonSchema {
  if (depth > MAX_DEPTH) throw new LlmError("스키마 중첩이 너무 깊습니다.", "bad_request", false);
  const out: JsonSchema = {};
  const t = (node.type as unknown as string | undefined) ?? "STRING";
  const base = TYPE_MAP[t];
  if (!base) throw new LlmError(`지원하지 않는 스키마 타입: ${t}`, "bad_request", false);
  const nullable = (node as { nullable?: boolean }).nullable === true;
  out.type = nullable ? [base, "null"] : base;
  if (node.description) out.description = node.description;
  if (node.enum) out.enum = nullable ? [...node.enum, null] : [...node.enum];

  if (base === "object") {
    const props = node.properties ?? {};
    const required = new Set(node.required ?? []);
    const converted: Record<string, JsonSchema> = {};
    for (const [key, child] of Object.entries(props)) {
      counter.n++;
      if (counter.n > MAX_PROPS) throw new LlmError("스키마 속성이 너무 많습니다.", "bad_request", false);
      let c = convert(child as Schema, depth + 1, counter);
      if (!required.has(key)) c = makeNullable(c);
      converted[key] = c;
    }
    out.properties = converted;
    out.required = Object.keys(converted);
    out.additionalProperties = false;
  }
  if (base === "array") {
    if (!node.items) throw new LlmError("배열 스키마에 items가 없습니다.", "bad_request", false);
    out.items = convert(node.items as Schema, depth + 1, counter);
  }
  return out;
}

function makeNullable(s: JsonSchema): JsonSchema {
  const t = s.type;
  if (Array.isArray(t)) return s;
  const next: JsonSchema = { ...s, type: [t as string, "null"] };
  if (Array.isArray(s.enum) && !s.enum.includes(null)) next.enum = [...(s.enum as unknown[]), null];
  return next;
}

/** 루트는 반드시 object여야 한다(OpenAI 요구). */
export function toOpenAiSchema(schema: Schema): JsonSchema {
  if ((schema.type as unknown as string) !== "OBJECT") throw new LlmError("구조화 출력의 루트 스키마는 OBJECT여야 합니다.", "bad_request", false);
  return convert(schema, 1, { n: 0 });
}

/**
 * 변환 때문에 생긴 null을 되돌린다: 원래 스키마에서 required가 아니고 nullable도 아니던 속성이 null이면 키를 지운다
 * (Gemini는 선택 항목을 생략했으므로 서비스 코드의 `x === undefined`/`x ?? 기본값` 판단이 그대로 동작하게 한다).
 * 원래 nullable:true였던 속성은 null 그대로 둔다.
 */
export function restoreOptional(data: unknown, schema: Schema): unknown {
  const t = schema.type as unknown as string;
  if (t === "ARRAY" && Array.isArray(data) && schema.items) return data.map((d) => restoreOptional(d, schema.items as Schema));
  if (t === "OBJECT" && data && typeof data === "object" && !Array.isArray(data)) {
    const required = new Set(schema.required ?? []);
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const child = schema.properties?.[key] as Schema | undefined;
      const wasOptional = !required.has(key) && !(child as { nullable?: boolean } | undefined)?.nullable;
      if (value === null && wasOptional) continue;
      out[key] = child ? restoreOptional(value, child) : value;
    }
    return out;
  }
  return data;
}
