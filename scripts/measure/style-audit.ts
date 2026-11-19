// 글의 문체가 단조로운지(ChatGPT 개선 요청 5번: "문장 구조·어조가 지나치게 일정하다") 폴더별로 잰다 — 모델 호출 0, 비용 0.
// 같은 안내문을 사진+한 줄로 쓴 기준선(screen_bare)과 우리 결과(screen 등)를 **같은 잣대**로 비교해, 우리가 더 단조로운지부터 본다.
// 지표(모두 본문 문장 기준, 제목·표·각주·빈칸 줄 제외):
//  - 문장 길이 변동계수(표준편차/평균): 클수록 길이가 다채롭다.
//  - 가장 흔한 어미 비율: 문장 끝 3글자 중 1위의 점유율(높을수록 같은 꼴로 끝난다).
//  - 같은 첫 낱말로 시작하는 문장 비율: 첫 낱말 1위의 점유율.
//  - 연속 같은 어미: 바로 앞 문장과 끝 3글자가 같은 문장 비율.
//  - 상투구 밀도: AI 말투로 알려진 연결·결론 상투구 1,000자당 개수.
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/style-audit.ts <폴더이름…>   (기본: screen screen_now screen_bare)
import fs from "node:fs";
import path from "node:path";

const base = path.join(process.cwd(), "scratchpad", "measure");
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ["screen", "screen_now", "screen_bare"];

const CLICHE = /결론적으로|따라서 우리는|이처럼|이러한 점에서|뿐만 아니라|중요한 역할을 (?:한다|했다)|시사하는 바가 크|의미가 크다|필요가 있다|할 수 있을 것이다|라고 할 수 있다|것으로 보인다|다양한 관점|더욱 중요/g;

function bodySentences(md: string): string[] {
  const out: string[] = [];
  for (const raw of md.split(/\r?\n/)) {
    const l = raw.trim();
    // 서술 문단만 센다 — 목록(-,*,•,숫자.)·굵은 라벨·표·제목·40자 미만 줄은 뺀다. 기준선(보고서식)은 목록 줄이 15%(우리 4%)라, 빼지 않으면
    // 짧은 라벨 줄이 "문장"으로 세어져 길이 변동이 부풀려진다(2026-11-20: 변동계수 0.29 대 0.39는 이 착시였고, 서술만 재면 0.28 대 0.31).
    if (!l || /^[-*•]\s|^\d+[.)]\s|^\*\*|^#|^▣|^=+ |^\||^전체 출처|^학생 지침|^분석 |^\[직접|^\[붙일/.test(l) || /https?:\/\//.test(l) || l.length < 40) continue;
    for (const s of l.replace(/\[\d+(?:,\s*\d+)*\]/g, "").split(/(?<=[.!?。])\s+/)) {
      const t = s.trim();
      if (t.length >= 8) out.push(t);
    }
  }
  return out;
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const cv = (a: number[]) => { const m = mean(a); return m ? Math.sqrt(mean(a.map((x) => (x - m) ** 2))) / m : 0; };
const endOf = (s: string) => s.replace(/[^가-힣a-zA-Z0-9]+$/g, "").slice(-3);
const headOf = (s: string) => s.split(/\s+/)[0].replace(/[^가-힣a-zA-Z0-9]/g, "");
const topShare = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return Math.max(0, ...m.values()) / (xs.length || 1); };

console.log("폴더            문서  문장  길이변동  어미1위  첫낱말1위  연속어미  상투구/천자");
for (const d of dirs) {
  const dir = path.join(base, d);
  if (!fs.existsSync(dir)) continue;
  const per: { cv: number; end: number; head: number; run: number; cl: number; n: number }[] = [];
  let sentTotal = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".md"))) {
    const md = fs.readFileSync(path.join(dir, f), "utf8");
    const ss = bodySentences(md);
    if (ss.length < 8) continue;
    const ends = ss.map(endOf);
    let run = 0;
    for (let i = 1; i < ends.length; i++) if (ends[i] === ends[i - 1]) run++;
    const chars = ss.join("").length;
    per.push({ cv: cv(ss.map((s) => s.length)), end: topShare(ends), head: topShare(ss.map(headOf)), run: run / (ss.length - 1), cl: ((md.match(CLICHE) ?? []).length / chars) * 1000, n: ss.length });
    sentTotal += ss.length;
  }
  const p = (k: "cv" | "end" | "head" | "run" | "cl") => mean(per.map((r) => r[k]));
  console.log(`${d.padEnd(14)} ${String(per.length).padStart(4)} ${String(sentTotal).padStart(5)}  ${p("cv").toFixed(2).padStart(7)}  ${(p("end") * 100).toFixed(0).padStart(5)}%  ${(p("head") * 100).toFixed(0).padStart(7)}%  ${(p("run") * 100).toFixed(0).padStart(6)}%  ${p("cl").toFixed(2).padStart(9)}`);
}
