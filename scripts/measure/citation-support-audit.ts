// 각주가 붙은 문장의 **숫자**가 그 각주의 페이지에 실제로 있는지 대조한다 — 모델 호출 0(페이지만 연다), 비용 0.
// 왜: 출처 점검이 "링크가 열린다"(validate-sources)까지만이라, 열리지만 문장을 뒷받침하지 않는 각주를 못 잡았다(ChatGPT 개선 요청 2번).
// 판정은 보수적이다: 숫자(연도·수치)는 페이지 글에 같은 값이 있는지만 본다(만·억 단위·쉼표는 풀어서 비교). 숫자 없는 문장은 이 도구가 판정하지 않는다.
// "없음"은 곧 틀렸다는 뜻이 아니라 **사람이 열어 볼 후보**다(페이지가 자바스크립트로 그려지면 글이 안 보여 "못 읽음"으로 따로 센다).
// 입력: screen-dump/regen-saved 결과 폴더의 .md — "전체 출처" 줄에 `[n] 제목 <주소>`가 있거나, 본문 끝 참고문헌에 `- 제목: 주소`가 번호 순서대로 있어야 한다.
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/citation-support-audit.ts [폴더=scratchpad/measure/screen_now]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? path.join(process.cwd(), "scratchpad", "measure", "screen_now");
const cacheDir = path.join(process.cwd(), "scratchpad", "measure", "page-cache");
fs.mkdirSync(cacheDir, { recursive: true });

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

async function pageText(url: string): Promise<string | null> {
  const f = path.join(cacheDir, `${crypto.createHash("sha1").update(url).digest("hex")}.txt`);
  if (fs.existsSync(f)) return fs.readFileSync(f, "utf8") || null;
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (measurement)" }, signal: AbortSignal.timeout(25000), redirect: "follow" });
    if (!r.ok) return null;
    const type = r.headers.get("content-type") ?? "";
    if (!/html|text|xml/i.test(type)) { fs.writeFileSync(f, ""); return null; }
    const text = htmlToText(await r.text());
    fs.writeFileSync(f, text);
    return text.length > 400 ? text : null;
  } catch {
    return null;
  }
}

/** 문장의 숫자를 (원문 표기, 페이지에서 찾을 변형들)로 풀어 준다. 한 자리 수·번호 표지는 뺀다. */
function numberClaims(sentence: string): { raw: string; variants: string[] }[] {
  const out: { raw: string; variants: string[] }[] = [];
  const s = sentence.replace(/\[\d+(?:,\s*\d+)*\]/g, " ");
  for (const m of s.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(만|억|조|%|퍼센트|명|건|원|개|배)?/g)) {
    const digits = m[1].replace(/,/g, "");
    if (digits.length < 2 && !m[2]) continue; // 한 자리 숫자는 너무 흔하다
    if (/^\d{1,2}$/.test(digits) && !m[2]) continue;
    const n = Number(digits);
    // 단위(만·억 …)가 붙은 숫자는 맨 숫자로는 찾지 않는다 — "77만"의 "77"이 페이지 어딘가의 77에 걸려 통과했다(음성 대조에서 확인).
    const v = new Set<string>([m[0].trim()]);
    if (!m[2]) { v.add(digits); v.add(m[1]); }
    if (m[2] === "만") { v.add(String(n * 1e4)); v.add((n * 1e4).toLocaleString("en-US")); }
    if (m[2] === "억") { v.add(String(n * 1e8)); v.add((n * 1e8).toLocaleString("en-US")); }
    out.push({ raw: m[0].trim(), variants: [...v] });
  }
  return out;
}

function sourcesOf(md: string): Map<number, { title: string; url: string }> {
  const map = new Map<number, { title: string; url: string }>();
  const line = md.split("\n").find((l) => l.startsWith("전체 출처"));
  if (line) for (const m of line.matchAll(/\[(\d+)\]\s*(.+?)\s*<(https?:\/\/[^>\s]+)>/g)) map.set(Number(m[1]), { title: m[2], url: m[3] });
  if (map.size === 0) {
    // 참고문헌 목록(번호 순서)
    let n = 0;
    for (const l of md.split("\n")) {
      const m = /^-\s+(.+?):\s*(https?:\/\/\S+)\s*$/.exec(l.trim());
      if (m) map.set(++n, { title: m[1], url: m[2] });
    }
  }
  return map;
}

/** 쉼표를 푼 페이지 글에서 숫자 경계를 지켜 찾는다("43"이 "1430" 안에 걸리지 않게). */
function hasNumber(text: string, v: string): boolean {
  const t = text.replace(/(?<=\d),(?=\d)/g, "");
  const x = v.replace(/,/g, "");
  let i = t.indexOf(x);
  while (i >= 0) {
    const before = t[i - 1] ?? "";
    const after = t[i + x.length] ?? "";
    if (!/\d/.test(before) && !(/\d/.test(x[x.length - 1]) && /\d/.test(after))) return true;
    i = t.indexOf(x, i + 1);
  }
  return false;
}

let checked = 0;
let supported = 0;
let unreadable = 0;
const unsupported: string[] = [];
const perFile: string[] = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".md")).sort()) {
  const id = f.replace(/\.md$/, "");
  const md = fs.readFileSync(path.join(dir, f), "utf8");
  const src = sourcesOf(md);
  if (src.size === 0) { perFile.push(`${id.padEnd(12)} 출처 주소가 저장돼 있지 않아 건너뜀`); continue; }
  const body = md.split("\n").filter((l) => !l.startsWith("전체 출처") && !l.startsWith("#") && !l.startsWith("▣") && !/^-\s+.+:\s*https?:/.test(l.trim())).join("\n");
  let fc = 0, fs_ = 0, fu = 0;
  for (const sentence of body.split(/(?<=[.!?。])\s+|\n+/)) {
    const cites = [...sentence.matchAll(/\[(\d+(?:,\s*\d+)*)\]/g)].flatMap((m) => m[1].split(",").map((x) => Number(x.trim())));
    if (cites.length === 0) continue;
    const claims = numberClaims(sentence);
    if (claims.length === 0) continue;
    const texts: { n: number; text: string | null }[] = [];
    for (const n of new Set(cites)) { const s = src.get(n); texts.push({ n, text: s ? await pageText(s.url) : null }); }
    if (texts.every((t) => t.text === null)) { unreadable += claims.length; continue; }
    for (const c of claims) {
      checked++; fc++;
      const hit = texts.find((t) => t.text && c.variants.some((v) => hasNumber(t.text!, v)));
      if (hit) { supported++; fs_++; }
      else { fu++; unsupported.push(`  [${id}] "${c.raw}" ← 각주 ${[...new Set(cites)].map((n) => `[${n}]`).join("")} : ${sentence.trim().slice(0, 80)}…`); }
    }
  }
  perFile.push(`${id.padEnd(12)} 숫자 ${fc}개 · 각주 페이지에서 확인 ${fs_} · 못 찾음 ${fu}`);
}
console.log(perFile.join("\n"));
console.log(`\n각주 문장의 숫자 ${checked}개 중 각주 페이지에서 확인 ${supported}개 (${checked ? Math.round((supported / checked) * 100) : 0}%) · 페이지를 못 읽어 판정 못 한 숫자 ${unreadable}개`);
if (unsupported.length) console.log(`\n못 찾은 숫자(= 사람이 열어 볼 후보, 틀렸다는 뜻은 아님):\n${unsupported.join("\n")}`);
