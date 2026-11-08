import fs from "fs";
import { withLlmTrace, generate } from "@/lib/llm";
import { analyzeAssignment } from "@/lib/gemini/analyze";
import { buildSourceList, insertCitationMarkers } from "@/lib/gemini/citations";
import { ANALYZE_SCHEMA } from "@/lib/gemini/analyze";
import { SCHEMA as EXPECTED } from "@/lib/gemini/expected-questions";
import { SECTIONS_SCHEMA, BOOK_CANDIDATES_SCHEMA } from "@/lib/gemini/generate-essay";
import { MEMO_NOTE_SCHEMA } from "@/lib/gemini/memo-note";
import { PROPOSE_SCHEMA, VERIFY_SCHEMA as PP_VERIFY } from "@/lib/gemini/style-postprocess";
import { FEEDBACK_SCHEMA } from "@/lib/learning/feedback";
import { SPEC_SCHEMA, VERIFY_SCHEMA as SPEC_VERIFY } from "@/lib/learning/subject-spec";
import { SCHEMA as SUGGEST } from "@/lib/learning/suggest-subject";
import { CANDIDATE_SCHEMA } from "@/lib/selection/subject-selection";
import { VERIFICATION_EXTRACT_SCHEMA, ATTRIBUTION_EXTRACT_SCHEMA } from "@/lib/verification/excerpt-verification";

const S = process.env.SCRATCH!;
async function main() {
  console.log("제공자/모델:", process.env.LLM_PROVIDER, process.env.OPENAI_MODEL_MAIN);

  console.log("\n===== [3] 안내문 이미지 분석 (analyzeAssignment, guideline.png) =====");
  const b64 = fs.readFileSync(`${S}/guideline.png`).toString("base64");
  const t0 = Date.now();
  const r = await withLlmTrace("analyze", async (trace) => {
    const a = await analyzeAssignment({ imageBase64: b64, imageMimeType: "image/png" });
    return { a, trace };
  });
  const ci = r.a.core_task_info;
  console.log(`${Date.now() - t0}ms | 과목=${r.a.subject} | 주제=${ci.topic}`);
  console.log("요구사항:", ci.requirements.join(" / ").slice(0, 300));
  for (const e of ci.task_elements) console.log(` - [${e.type}] ${e.label} | 분량=${JSON.stringify(e.target_length)} | 항목=${JSON.stringify(e.required_items)} | 형식=${e.items_format}`);
  console.log("행정정보:", JSON.stringify(r.a.administrative_info));
  console.log("호출:", JSON.stringify(r.trace.calls.map((c) => ({ l: c.label, ms: c.ms, in: c.inputTokens, out: c.outputTokens, r: c.reasoningTokens }))));

  console.log("\n===== [4] 웹 검색 + 출처 (force 검색 → 각주 삽입) =====");
  const s = await generate({ label: "live:search", role: "main", search: { force: true },
    prompt: "앙리 뒤낭이 태어난 해, 솔페리노 전투가 일어난 해, 제1회 노벨 평화상 수상 연도를 웹에서 확인해서 세 문장으로 한국어로 써줘. 문장마다 근거를 달아줘." });
  const g = s.grounding!;
  const { sources, chunkIndexToN } = buildSourceList(g.chunks);
  const annotated = insertCitationMarkers(s.text, g.supports, chunkIndexToN);
  console.log(`검색 호출 ${g.searchCalls}회 | 질의 ${JSON.stringify(g.queries)} | 출처 ${sources.length}개 | 토큰 in ${s.usage.inputTokens} out ${s.usage.outputTokens}`);
  console.log("링크 잔존:", /\]\(http/.test(annotated), "| utm 잔존:", annotated.includes("utm_"), "| 마커 제거 후 본문 동일:", annotated.replace(/\[\d+\]/g, "") === s.text);
  console.log(annotated);
  console.log(sources.map((x) => `[${x.n}] ${x.title} ${x.url}`).join("\n"));

  console.log("\n===== [5] JSON 구조화: 실제 스키마 15개를 OpenAI strict로 =====");
  const all: [string, unknown][] = [["ANALYZE", ANALYZE_SCHEMA], ["EXPECTED_QUESTIONS", EXPECTED], ["SECTIONS", SECTIONS_SCHEMA], ["BOOK_CANDIDATES", BOOK_CANDIDATES_SCHEMA], ["MEMO_NOTE", MEMO_NOTE_SCHEMA], ["POST_PROPOSE", PROPOSE_SCHEMA], ["POST_VERIFY", PP_VERIFY], ["FEEDBACK", FEEDBACK_SCHEMA], ["SUBJECT_SPEC", SPEC_SCHEMA], ["SUBJECT_VERIFY", SPEC_VERIFY], ["SUGGEST", SUGGEST], ["SELECTION_CANDIDATES", CANDIDATE_SCHEMA], ["VERIFY_EXCERPT", VERIFICATION_EXTRACT_SCHEMA], ["VERIFY_AUTHOR", ATTRIBUTION_EXTRACT_SCHEMA], ["SAME_TASK", { type: "OBJECT", properties: { same: { type: "BOOLEAN" } }, required: ["same"] }]];
  let ok = 0;
  for (const [name, schema] of all) {
    const t = Date.now();
    try {
      const res = await generate({ label: `schema:${name}`, role: "lite", effort: "minimal", schema: schema as never, prompt: "이 스키마의 모든 필드를 그럴듯한 짧은 예시 값으로 채운 JSON을 만들어줘. 배열은 항목 1~2개만." });
      const parsed = JSON.parse(res.text);
      ok++;
      console.log(`OK   ${name.padEnd(22)} ${Date.now() - t}ms  키 ${Object.keys(parsed).length}개`);
    } catch (e) {
      console.log(`FAIL ${name.padEnd(22)} ${String(e).slice(0, 200)}`);
    }
  }
  console.log(`\n스키마 통과 ${ok}/${all.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
