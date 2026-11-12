// **조사를 미리 해 두면 학생이 기다리는 시간이 얼마나 줄어드는가**를 잰다.
//
// 화면에서는 "AI가 만들어줘요"를 고른 순간 조사가 시작되고, 학생이 제작 전 질문 2~4개에 답하는
// 10~30초 동안 끝난다(research-prefetch.ts). 그래서 학생이 **생성 버튼을 누른 뒤** 기다리는 시간에서
// 조사 한 호출이 빠진다. 이 스크립트는 같은 안내문으로 두 번 생성해 그 차이를 본다.
//
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/prefetch-gain.ts "<사례id>"
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
process.env.SOURCE_STATS_LOG = "off";

const { analyzeAssignment } = await import("@/lib/gemini/analyze");
const { generateEssay, researchForTask } = await import("@/lib/gemini/generate-essay");

const IMG = path.join(REPO, "수행평가 안내문");
const CASES: Record<string, string[]> = {
  "과학(멸치)": ["과학 -1/KakaoTalk_20261106_154404285_02.jpg"],
  "과학(산·염기)": ["KakaoTalk_20260928_165015557_01 - 복사본.jpg"],
  "신문(역사)": ["역사-1 - 복사본/KakaoTalk_20261021_232340155_02.jpg", "역사-1 - 복사본/KakaoTalk_20261021_232340155_01.jpg"],
};

const id = process.argv[2] ?? "과학(멸치)";
const rel = CASES[id];
if (!rel) throw new Error(`모르는 사례: ${id}`);
const imgs = rel.map((r) => ({ base64: fs.readFileSync(path.join(IMG, r)).toString("base64"), mimeType: "image/jpeg" }));

const a = await analyzeAssignment({ imageBase64: imgs[0].base64, imageMimeType: imgs[0].mimeType, extraImages: imgs.slice(1) });
const core = a.core_task_info;
const elements = core.task_elements.filter((e) => e.type === "text_submission");
const input = { subject: a.subject, coreTaskInfo: core, selection: { history: [] as never[] } };

// ① 지금(조사가 생성 안에서 직렬로 돈다)
const t0 = Date.now();
await generateEssay(input as never);
const before = (Date.now() - t0) / 1000;

// ② 제작 전 질문에 답하는 동안 조사를 끝내 둔 경우 — 학생이 기다리는 것은 생성뿐이다
const tR = Date.now();
const notes = await researchForTask(input as never, elements as never);
const researchSecs = (Date.now() - tR) / 1000;
const t1 = Date.now();
await generateEssay({ ...input, researchNotes: notes } as never);
const after = (Date.now() - t1) / 1000;

console.log(`\n### ${id}`);
console.log(`  지금            : ${before.toFixed(1)}초 (조사가 생성 안에서 직렬)`);
console.log(`  미리 조사한 뒤  : ${after.toFixed(1)}초 (조사 ${researchSecs.toFixed(1)}초는 질문에 답하는 동안 끝남)`);
console.log(`  학생 체감 차이  : ${(before - after).toFixed(1)}초`);
