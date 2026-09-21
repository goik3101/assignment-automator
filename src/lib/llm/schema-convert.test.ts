/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toOpenAiSchema, restoreOptional } from "./schema-convert.ts";

// Type enum 값은 런타임에 "OBJECT" 같은 문자열이라 테스트에서는 문자열을 그대로 쓴다.
const S = (x: unknown) => x as never;
const schema = S({
  type: "OBJECT",
  properties: {
    subject_type: { type: "STRING", enum: ["person", "event"], description: "종류" },
    constraints: { type: "ARRAY", items: { type: "STRING" } },
    needs_clarification: { type: "BOOLEAN" },
    clarification_note: { type: "STRING", nullable: true },
    optional_note: { type: "STRING" },
    optional_enum: { type: "STRING", enum: ["a", "b"] },
    nested: {
      type: "OBJECT",
      properties: { fit: { type: "INTEGER" }, tags: { type: "ARRAY", items: { type: "OBJECT", properties: { k: { type: "STRING" }, v: { type: "STRING" } }, required: ["k"] } } },
      required: ["fit"],
    },
  },
  required: ["subject_type", "constraints", "needs_clarification", "nested"],
});

test("타입 소문자화, 모든 객체 additionalProperties:false, 모든 속성 required", () => {
  const o = toOpenAiSchema(schema) as any;
  assert.equal(o.type, "object");
  assert.equal(o.additionalProperties, false);
  assert.deepEqual(new Set(o.required), new Set(Object.keys(o.properties)));
  assert.equal(o.properties.nested.additionalProperties, false);
  assert.equal(o.properties.nested.properties.tags.items.additionalProperties, false);
  assert.deepEqual(new Set(o.properties.nested.properties.tags.items.required), new Set(["k", "v"]));
});

test("nullable과 원래 선택이던 속성은 null 허용 타입이 되고, enum에는 null이 추가된다", () => {
  const o = toOpenAiSchema(schema) as any;
  assert.deepEqual(o.properties.clarification_note.type, ["string", "null"]);
  assert.deepEqual(o.properties.optional_note.type, ["string", "null"]);
  assert.deepEqual(o.properties.optional_enum.type, ["string", "null"]);
  assert.deepEqual(o.properties.optional_enum.enum, ["a", "b", null]);
  assert.deepEqual(o.properties.subject_type.type, "string");
  assert.deepEqual(o.properties.subject_type.enum, ["person", "event"]);
  assert.equal(o.properties.nested.properties.tags.items.properties.v.type[1], "null");
  assert.equal(o.properties.subject_type.description, "종류");
});

test("변환 결과에 Gemini 전용 키워드(nullable)가 남지 않는다", () => {
  assert.ok(!JSON.stringify(toOpenAiSchema(schema)).includes("nullable"));
});

test("응답 복원: 원래 선택 항목의 null은 키를 지우고, 원래 nullable 항목의 null은 유지한다", () => {
  const raw = { subject_type: "person", constraints: [], needs_clarification: false, clarification_note: null, optional_note: null, optional_enum: null, nested: { fit: 3, tags: [{ k: "x", v: null }] } };
  const r = restoreOptional(raw, schema) as any;
  assert.equal("optional_note" in r, false);
  assert.equal("optional_enum" in r, false);
  assert.equal(r.clarification_note, null); // 원래 nullable
  assert.equal("v" in r.nested.tags[0], false);
  assert.equal(r.nested.tags[0].k, "x");
});

test("루트가 OBJECT가 아니면 거부한다", () => {
  assert.throws(() => toOpenAiSchema(S({ type: "ARRAY", items: { type: "STRING" } })), /루트/);
});
