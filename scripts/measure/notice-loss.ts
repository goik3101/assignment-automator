// 안내문 **원문**과 **분석 결과**를 나란히 놓고, 분석이 흘린 것·잘못 담은 것을 센다.
//
// 왜: 안내문을 읽는 규칙 190여 개가 전부 analyze의 **요약**만 읽는다(원문 notice_text는 아무도 안 읽는다).
// 요약이 흘린 것은 아래 어디서도 복구되지 않으므로, 새 안내문이 올 때마다 "이번엔 무엇이 사라졌나"가 된다.
// 이 스크립트는 그 손실을 과제별로 센다. 생성은 하지 않는다(analyze 1회씩).
//
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/notice-loss.ts ["사례id" ...]
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
process.env.SOURCE_STATS_LOG = "off";
process.env.NOTICE_TEXT = "on";

const { analyzeAssignment } = await import("@/lib/gemini/analyze");

const IMG = path.join(REPO, "수행평가 안내문");
const CASES: Record<string, string[]> = {
  "국어(발표)": ["국어 -1/KakaoTalk_20260526_213359166.jpg"],
  "신문(역사)": ["역사-1 - 복사본/KakaoTalk_20261021_232340155_02.jpg", "역사-1 - 복사본/KakaoTalk_20261021_232340155_01.jpg"],
  "과학(산·염기)": ["KakaoTalk_20260928_165015557_01 - 복사본.jpg"],
  "카드뉴스(역사)": ["역사-2/photo_2026-10-21_01-03-10 - 복사본.jpg"],
  "영어(발명품)": ["영어-1 - 복사본/KakaoTalk_20261021_232340155_08.jpg", "영어-1 - 복사본/KakaoTalk_20261021_232340155_06.jpg", "영어-1 - 복사본/KakaoTalk_20261021_232340155_07.jpg"],
  "과학(멸치)": ["과학 -1/KakaoTalk_20261106_154404285_02.jpg"],
  "사회(경제적 유인)": ["사회-2/photo_2026-11-11_02-08-20.jpg", "사회-2/photo_2026-11-11_02-08-20 (2).jpg"],
  "수학(수리논술 출제)": ["수학-1/photo_2026-11-11_02-08-06.jpg", "수학-1/photo_2026-11-11_02-08-06 (2).jpg"],
  "화작(문제해결)": ["KakaoTalk_20260829_112309789 - 복사본.jpg"],
  "사회(인권저널)": ["KakaoTalk_20260912_203359067_05 - 복사본.jpg"],
};

// 안내문에 **인쇄된 칸 이름**으로 보이는 줄. 번호 칸(①~⑩, 1., 가.)과 이름표 기입란("제목:")을 본다.
const NUM = /^\s*(?:[①-⑩]|[0-9]{1,2}\s*[.)]|[가-하]\s*[.)]|[-◦○●*])\s*/;
function printedFields(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.length > 60) continue;
    const numbered = NUM.test(line) ? line.replace(NUM, "").trim() : "";
    const labeled = /^([^:：]{2,24})\s*[:：]\s*$/.exec(line)?.[1]?.trim() ?? "";
    const cand = numbered || labeled;
    if (!cand || cand.length < 2) continue;
    out.push(cand.replace(/[.:：]+$/, "").trim());
  }
  return [...new Set(out)];
}

const words = (s: string) => (s.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).map((w) => w.toLowerCase());
// 같은 칸인가 — 글자 포함이 아니라 **낱말 겹침**으로 본다(guide-fields.ts와 같은 이유).
function covered(field: string, haystack: string[]): boolean {
  const fw = words(field);
  if (!fw.length) return false;
  return haystack.some((h) => {
    const hw = new Set(words(h));
    const hit = fw.filter((w) => hw.has(w)).length;
    return hit / fw.length >= 0.6;
  });
}

const ADMIN = /(배점|총\s*\d+\s*점|기본\s*점수|감점|제출\s*기한|마감|차시|시험\s*대형|부정행위|평가\s*일시|수업\s*시간에)/;
const FIG = /\d+(?:[.,]\d+)?\s*(?:%|퍼센트|원|만\s*원|억|명|년|개월|℃|배)/g;

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CASES);
const rows: Record<string, string>[] = [];
for (const id of ids) {
  const rel = CASES[id];
  if (!rel) { console.log(`모르는 사례: ${id}`); continue; }
  const imgs = rel.map((r) => ({ base64: fs.readFileSync(path.join(IMG, r)).toString("base64"), mimeType: "image/jpeg" }));
  const t0 = Date.now();
  const a: any = await analyzeAssignment({ imageBase64: imgs[0].base64, imageMimeType: imgs[0].mimeType, extraImages: imgs.slice(1) });
  const c = a.core_task_info;
  const notice: string = a.notice_text ?? "";
  const coreTexts: string[] = [
    c.topic ?? "",
    ...(c.requirements ?? []),
    c.writing_guide ?? "",
    ...(c.provided_materials ?? []),
    ...(c.task_elements ?? []).flatMap((e: any) => [e.label, e.description, ...(e.required_items ?? [])]),
  ].filter(Boolean);

  const fields = printedFields(notice);
  const lostFields = fields.filter((f) => !covered(f, coreTexts));
  const noticeFigs = [...new Set(notice.match(FIG) ?? [])];
  const lostFigs = noticeFigs.filter((f) => !coreTexts.some((t) => t.includes(f)));
  const adminIn = coreTexts.filter((t) => ADMIN.test(t));

  const row = {
    "과제": id,
    "초": ((Date.now() - t0) / 1000).toFixed(1),
    "원문자": String(notice.length),
    "인쇄칸": String(fields.length),
    "흘린칸": String(lostFields.length),
    "원문수치": String(noticeFigs.length),
    "흘린수치": String(lostFigs.length),
    "행정유입": String(adminIn.length),
  };
  rows.push(row);
  console.log(JSON.stringify(row, null, 0));
  if (lostFields.length) console.log(`   흘린 칸: ${lostFields.slice(0, 12).join(" | ")}`);
  if (lostFigs.length) console.log(`   흘린 수치: ${lostFigs.slice(0, 12).join(", ")}`);
  for (const t of adminIn.slice(0, 4)) console.log(`   행정유입: ${t.slice(0, 90)}`);
  fs.mkdirSync(path.join(REPO, "scratchpad/measure/notice"), { recursive: true });
  fs.writeFileSync(path.join(REPO, "scratchpad/measure/notice", `${id}.json`), JSON.stringify({ notice_text: notice, core: c, admin: a.administrative_info }, null, 2));
}

console.log("\n과제\t원문자\t인쇄칸\t흘린칸\t흘린수치\t행정유입");
for (const r of rows) console.log(`${r["과제"]}\t${r["원문자"]}\t${r["인쇄칸"]}\t${r["흘린칸"]}\t${r["흘린수치"]}\t${r["행정유입"]}`);
