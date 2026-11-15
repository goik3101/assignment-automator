// 안내문 전사(notice_text)까지 보면 "교실에서 손으로 쓰는 평가" 관문이 어느 안내문에서 열리는지 본다(분석 1회씩, 생성 없음).
// 새로 열리는 안내문이 정말 현장 작성인지 사람이 보고 판단하려는 것 — 가정에서 제출하는 보고서가 잘못 열리면 안 된다.
import fs from "node:fs";
import path from "node:path";
process.loadEnvFile(path.join(process.cwd(), ".env.local"));
const { analyzeAssignment } = await import("@/lib/gemini/analyze");
const { handwriteBudget } = await import("@/lib/essay/handwrite-budget");
for (const id of process.argv.slice(2)) {
  const dir = path.join(process.cwd(), "수행평가 안내문", "거대 수행평가 안내문", `${id.split("-")[0]} 수행평가`, id);
  const imgs = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().map((f) => ({ base64: fs.readFileSync(path.join(dir, f)).toString("base64"), mimeType: "image/png" }));
  try {
    const a = await analyzeAssignment({ imageBase64: imgs[0].base64, imageMimeType: imgs[0].mimeType, extraImages: imgs.slice(1) });
    const c = a.core_task_info;
    const coreTexts = [c.writing_guide, ...c.requirements, ...c.task_elements.map((e) => e.description)];
    const before = handwriteBudget(coreTexts);
    const after = handwriteBudget([...coreTexts, a.notice_text]);
    const cue = (a.notice_text ?? "").match(/수행평가\s*(?:당일|시간)|평가\s*시간\s*(?:을|에|중)|디지털\s*기기[^.\n]{0,12}(?:불가|금지|못)|손글씨|(?:\d|첫|두|세)\s*번째\s*시간|\d\s*교시|한\s*차시|수업\s*시간\s*(?:중|내|에\s*작성)|시험\s*대형|개별\s*평가|부정\s*행위|\d+\s*분/g);
    console.log(`${id}\t분석요약=${before ? "열림" : "닫힘"}\t전사포함=${after ? `열림(${after.chars}자,${after.minutes}분)` : "닫힘"}\t전사${(a.notice_text ?? "").length}자\t단서=${JSON.stringify([...new Set(cue ?? [])].slice(0, 5))}`);
  } catch (e) {
    console.log(`${id}\t실패 ${String(e).slice(0, 60)}`);
  }
}
