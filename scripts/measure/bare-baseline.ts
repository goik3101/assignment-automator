// **"ChatGPT에 사진 넣고 쓰라고 한 것"을 그대로 재현해, 우리 파이프라인과 같은 정답 체크리스트로 채점한다.**
//
// 왜: 사용자가 처음부터 묻는 질문이 이것이다 — "ChatGPT 무료도 같은 luna를 쓰는데 왜 우리가 더 안 좋아?"
// 지금까지 우리는 그 질문에 **추측으로** 답했다(요약 손실·규칙 충돌 …). 이 스크립트는 변수를 하나로 줄인다:
// 같은 모델(write 역할 = luna), 같은 안내문 사진, 같은 학생 지침, 같은 채점표. 다른 것은 **우리 층 전부**다
// (analyze 요약, 190여 개 규칙, 프롬프트 블록 20여 개, 분량 숫자, 조사 노트, 단계별 분할 쓰기, 후처리 21개, 보완).
//
// 2026-11-01에 기각한 "글 쓰는 호출에 안내문 사진을 **함께** 보내기"와 다르다 — 그쪽은 우리 프롬프트에 사진을
// 더한 것이고, 이쪽은 우리 프롬프트를 **다 빼고** 사진만 주는 것이다.
//
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/bare-baseline.ts ["사례id" ...]
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
process.env.SOURCE_STATS_LOG = "off";

const { generate } = await import("@/lib/llm");

const IMG = path.join(REPO, "수행평가 안내문");
const CASES: Record<string, { images: string[]; instructions?: string }> = {
  "국어(발표)": {
    images: ["국어 -1/KakaoTalk_20260526_213359166.jpg"],
    instructions: "인터넷 실명제 도입에 반대하는 입장으로 발표할게.",
  },
  "신문(역사)": {
    images: ["역사-1 - 복사본/KakaoTalk_20261021_232340155_02.jpg", "역사-1 - 복사본/KakaoTalk_20261021_232340155_01.jpg"],
  },
  "카드뉴스(역사)": {
    images: ["역사-2/photo_2026-10-21_01-03-10 - 복사본.jpg"],
    instructions: "책: 윤태호 작가의 《사일구》(4·19혁명)를 읽었다.",
  },
  "과학(산·염기)": { images: ["KakaoTalk_20260928_165015557_01 - 복사본.jpg"] },
  "과학(멸치)": { images: ["과학 -1/KakaoTalk_20261106_154404285_02.jpg"] },
  "사회(경제적 유인)": {
    images: ["사회-2/photo_2026-11-11_02-08-20.jpg", "사회-2/photo_2026-11-11_02-08-20 (2).jpg"],
  },
  "수학(수리논술 출제)": {
    images: ["수학-1/photo_2026-11-11_02-08-06.jpg", "수학-1/photo_2026-11-11_02-08-06 (2).jpg"],
  },
};

// 학생이 ChatGPT에 쓸 만한 말. 우리 규칙·분량·형식 지시는 **한 줄도 넣지 않는다**.
const ASK = (instructions?: string) =>
  [
    "이 수행평가 안내문을 보고, 내가 그대로 제출할 수 있는 결과물을 써 줘.",
    instructions ? `참고: ${instructions}` : "",
    "안내문에 있는 조건은 다 지켜 줘.",
  ]
    .filter(Boolean)
    .join("\n");

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CASES);
const outDir = path.join(REPO, "scratchpad", "measure", "out");
fs.mkdirSync(outDir, { recursive: true });

for (const id of ids) {
  const c = CASES[id];
  if (!c) {
    console.log(`모르는 사례: ${id}`);
    continue;
  }
  const parts: unknown[] = c.images.map((rel) => ({
    image: { base64: fs.readFileSync(path.join(IMG, rel)).toString("base64"), mimeType: "image/jpeg" },
  }));
  parts.push({ text: ASK(c.instructions) });

  const t0 = Date.now();
  const r = await generate({
    label: "bareBaseline",
    role: "write",
    prompt: parts as never,
    // ChatGPT가 필요하면 검색하는 것과 맞춘다(강제하지 않는다 — 쓸지 말지는 모델이 정한다).
    search: { maxCalls: 3 },
    effort: "low",
  });
  const secs = (Date.now() - t0) / 1000;
  const file = path.join(outDir, `bare-${id}.md`);
  fs.writeFileSync(file, r.text, "utf8");
  console.log(`${id}\t${secs.toFixed(1)}초\t${r.text.length}자\t각주 ${(r.text.match(/\[\d+\]/g) ?? []).length}개\t→ ${path.basename(file)}`);
}
