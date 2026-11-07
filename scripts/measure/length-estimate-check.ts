// 분석이 사진을 보고 정한 분량(length_estimate)이 **무엇을 내놓는지, 얼마나 흔들리는지**만 본다.
// 분석만 돌린다 — 생성은 하지 않으므로 값싸다(analyze 1건 ≈ $0.01).
//
// 비교 기준은 정답 채점으로 확인된 분량이다(scripts/measure/length-truth.ts):
//   과학 1,285+1,358(11/11) / 신문 930·687·362(11/11) / 카드뉴스 1,750(9/9) / 사회 스크랩 170~202
//
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/length-estimate-check.ts [사례id] [횟수]
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
process.env.SOURCE_STATS_LOG = "off";

const { analyzeAssignment } = await import("@/lib/gemini/analyze");
const { narrowTarget } = await import("@/lib/essay/length-plan");
const { boxLengths } = await import("@/lib/essay/box-lines");

const IMG = path.join(REPO, "수행평가 안내문");
const CASES: Record<string, string[]> = {
  "국어(발표)": ["국어 -1/KakaoTalk_20260526_213359166.jpg"],
  "신문(역사)": ["역사-1 - 복사본/KakaoTalk_20261021_232340155_02.jpg", "역사-1 - 복사본/KakaoTalk_20261021_232340155_01.jpg"],
  "과학(산·염기)": ["KakaoTalk_20260928_165015557_01 - 복사본.jpg"],
  "카드뉴스(역사)": ["역사-2/photo_2026-10-21_01-03-10 - 복사본.jpg"],
  "영어(발명품)": ["영어-1 - 복사본/KakaoTalk_20261021_232340155_08.jpg", "영어-1 - 복사본/KakaoTalk_20261021_232340155_06.jpg", "영어-1 - 복사본/KakaoTalk_20261021_232340155_07.jpg"],
};

const ids = process.argv[2] ? [process.argv[2]] : Object.keys(CASES);
const n = Number(process.argv[3] ?? 1);

for (const id of ids) {
  const imgs = CASES[id].map((rel) => ({ base64: fs.readFileSync(path.join(IMG, rel)).toString("base64"), mimeType: "image/jpeg" }));
  console.log(`\n### ${id}`);
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    const a = await analyzeAssignment({ imageBase64: imgs[0].base64, imageMimeType: imgs[0].mimeType, extraImages: imgs.slice(1) });
    const c = a.core_task_info as never as {
      task_elements: { type: string; label: string; required_items?: string[]; target_length?: { min: number; max: number }; length_estimate?: { chars: number; basis: string } }[];
      writing_guide?: string;
    };
    const els = c.task_elements.filter((e) => e.type === "text_submission");
    const boxes = boxLengths(els.map((e) => e.label), c.writing_guide);
    console.log(`  ${i + 1}회 (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
    for (const el of els) {
      const t = narrowTarget(el as never);
      const box = boxes.find((b) => b.label === el.label);
      const est = el.length_estimate;
      console.log(
        `     ${String(el.label).slice(0, 20).padEnd(22)} 항목${String(el.required_items?.length ?? 0).padEnd(3)}` +
          `명시=${el.target_length ? `${el.target_length.min}~${el.target_length.max}` : "-"}  ` +
          `칸=${box ? `${box.lines}줄 ${box.min}~${box.max}` : "-"}  ` +
          `분석추정=${est ? `${est.chars}자 "${est.basis}"` : "-"}  → 목표 ${t.target}자(${t.basis.slice(0, 40)})`
      );
    }
  }
}
