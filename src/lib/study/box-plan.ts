// **요약의 칸을 코드가 정한다.** 지금까지는 "항목마다 한 칸, 장면은 2~3칸으로 묶어라"를 프롬프트로 시켰고, 같은 결과물인데도 실행마다
// 글의 목적과 주제를 합치거나 마지막 칸을 빼먹었다(2026-11-23 실측). 칸의 이름·순서·개수는 결과물의 소제목(`##` 단계, `###` 항목)에서
// 코드가 정확히 정할 수 있으므로, 모델에게는 "이 칸 목록의 칸마다 한 줄과 핵심어만 채워라"만 시킨다.
// alias import 없음 — node:test에서 바로 불러옴.
import { findSections, normHeading } from "./section-edit.ts";
import { NOT_A_BOX } from "./memorize-source.ts";

export interface PlannedBox {
  /** 칸 이름(결과물의 소제목 그대로, 묶은 칸은 "장면 1~4"). */
  name: string;
  /** 그 칸의 실제 글(각주 번호 뗌). 모델이 줄을 못 채웠을 때 코드가 첫 문장으로 대신 채우는 데 쓴다. */
  text: string;
  /** 코드가 이미 줄과 핵심어까지 만든 칸(연표). 모델에게 맡기지 않는다. */
  fixed?: { line: string; keywords: string[] };
}

const MAX_RUN = 4; // 번호만 다른 항목(장면 1~8)을 한 칸에 묶는 최대 개수
const TEXT_CAP = 700;

const stripFootnotes = (s: string) => s.replace(/\[\d+(?:\s*,\s*\d+)*\]/g, "").replace(/[ \t]+\n/g, "\n").trim();
const clipText = (s: string, n = TEXT_CAP) => (s.length > n ? s.slice(0, n) : s);
// 이름·반·번호·날짜 같은 인적 사항 칸은 외울 내용이 아니다(역할극 스토리보드의 "반 번호" 칸).
const ID_FIELD = /^(?:학년)?(?:반)?(?:번호|학번)$|^(?:이름|성명|날짜|제출일|작성일)$/;
const skip = (name: string) => NOT_A_BOX.test(name.replace(/\s/g, "")) || ID_FIELD.test(name.replace(/\s/g, ""));

/** "장면 3" → { stem: "장면", n: 3 }. 번호로 끝나지 않으면 null. */
function numbered(name: string): { stem: string; n: number } | null {
  const m = /^(.*?\D)\s*(\d+)\s*(?:번째|번)?\s*$/.exec(name.trim());
  return m && m[1].trim() ? { stem: m[1].trim(), n: Number(m[2]) } : null;
}

const bodyOf = (md: string, s: { start: number; end: number; headingLine: string }, until = s.end) =>
  stripFootnotes(md.slice(s.start + s.headingLine.length, until)).trim();

const YEAR_CELL = /^(\d{4})\s*년?(?:\s*(?:[~\-–]|부터)\s*\d{4}\s*년?)?(?:\s*\d{1,2}월)?$/;

/**
 * 연도와 사건을 적은 표(연표)를 한 칸으로 만든다 — "1929년 …태어남 → 1955년 …보이콧"처럼 사건은 보이고 연도가 빈칸이 된다.
 * 연표는 결과물에서 가장 외우기 좋고 틀리기 쉬운 부분인데, 모델에게 줄을 쓰게 하면 연도 일부만 담았다(2026-11-25 사용자 지적). 표의 행을 그대로 쓰므로 모델 호출이 없다.
 */
export function timelineBox(section: string): PlannedBox | null {
  const rows: { year: string; event: string }[] = [];
  for (const raw of section.split("\n")) {
    const t = raw.trim();
    if (!t.startsWith("|")) continue;
    const cells = t.replace(/^\||\|$/g, "").split("|").map((c) => stripFootnotes(c).replace(/\s+/g, " ").trim());
    if (cells.length < 2 || /^:?-{2,}:?$/.test(cells[0])) continue;
    const m = YEAR_CELL.exec(cells[0]);
    if (!m || !cells[1]) continue;
    const year = /년|월/.test(cells[0]) ? cells[0] : `${cells[0]}년`;
    rows.push({ year, event: cells[1].replace(/[.。]$/, "") });
  }
  if (rows.length < 3) return null;
  const used = rows.slice(0, 8);
  return {
    name: "연표",
    text: used.map((r) => `${r.year} ${r.event}`).join("\n"),
    fixed: { line: used.map((r) => `${r.year} ${r.event}`).join(" → "), keywords: used.map((r) => r.year) },
  };
}

/**
 * 결과물 마크다운에서 칸 목록을 만든다. 이름 있는 항목(글의 목적·예상 독자…)은 항목마다 한 칸, 번호만 다른 반복 항목(장면 1~8)은 4개씩 묶어 한 칸,
 * 항목 없는 단계는 단계 하나가 한 칸. 칸이 maxBoxes를 넘으면 항목이 가장 많은 단계부터 한 칸으로 합친다.
 * 칸이 2개 미만이거나 합쳐도 maxBoxes를 넘으면 null — 그때는 예전처럼 모델이 칸을 고른다.
 */
export function planBoxes(markdown: string, maxBoxes: number): PlannedBox[] | null {
  const secs = findSections(markdown ?? "");
  const groups = secs.filter((s) => s.level === 2 && !skip(s.title.replace(/[*_`]/g, "")));
  if (groups.length === 0) return null;

  // 단계마다: 그 단계가 만드는 칸들(펼친 것)과 한 칸으로 합친 것
  const perGroup = groups.map((g) => {
    const clean = (t: string) => t.replace(/[*_`]/g, "").trim();
    const items = secs.filter((s) => s.level === 3 && s.start > g.start && s.end <= g.end && !skip(clean(s.title)));
    const joined: PlannedBox = { name: clean(g.title), text: clipText(bodyOf(markdown, g)) };
    // 연표는 단계를 합쳐도 따로 남긴다(합치면 연도가 사라진다).
    const tl = timelineBox(markdown.slice(g.start, g.end));
    const extra = tl ? [tl] : [];
    if (items.length < 2) return { expanded: [joined], joined, extra };

    const expanded: PlannedBox[] = [];
    for (let i = 0; i < items.length; ) {
      const first = numbered(clean(items[i].title));
      let j = i + 1;
      if (first) while (j < items.length && numbered(clean(items[j].title))?.stem === first.stem) j++;
      const runLen = j - i;
      if (!first || runLen < 2) {
        expanded.push({ name: clean(items[i].title), text: clipText(bodyOf(markdown, items[i])) });
        i = j;
        continue;
      }
      // 번호만 다른 반복 항목: 4개씩 묶되 마지막 묶음이 너무 작지 않게 고르게 나눈다.
      const chunks = Math.ceil(runLen / MAX_RUN);
      const size = Math.ceil(runLen / chunks);
      for (let a = i; a < j; a += size) {
        const b = Math.min(a + size, j);
        const lo = numbered(clean(items[a].title))!.n;
        const hi = numbered(clean(items[b - 1].title))!.n;
        expanded.push({
          name: b - a === 1 ? clean(items[a].title) : `${first.stem} ${lo}~${hi}`,
          text: clipText(
            items
              .slice(a, b)
              .map((it) => `[${clean(it.title)}] ${bodyOf(markdown, it)}`)
              .join("\n")
          ),
        });
      }
      i = j;
    }
    return { expanded, joined, extra };
  });

  // 한도를 넘으면 칸이 가장 많이 펼쳐진 단계부터 한 칸으로 합친다.
  const use = perGroup.map((g) => g.expanded);
  const total = () => use.reduce((n, b, i) => n + b.length + perGroup[i].extra.length, 0);
  while (total() > maxBoxes) {
    let worst = -1;
    for (let i = 0; i < use.length; i++) if (use[i].length > 1 && (worst < 0 || use[i].length >= use[worst].length)) worst = i;
    if (worst < 0) return null; // 더 합칠 수 없다 → 모델이 고른다
    use[worst] = [perGroup[worst].joined];
  }
  const out = use.flatMap((b, i) => [...b, ...perGroup[i].extra]);
  return out.length >= 2 ? out : null;
}

/** 모델이 정리한 칸들을 코드가 정한 칸 목록에 맞춘다: 이름(소제목)으로 먼저, 안 맞으면 같은 순번으로. 그래도 없으면 칸 글의 첫 문장. */
export function alignSkeleton(
  plan: PlannedBox[],
  raw: { box?: string; line?: string; keywords?: string[] }[] | undefined
): { box: string; line: string; keywords: string[]; fixed?: boolean }[] {
  // 코드가 줄까지 만든 칸(연표)은 모델이 채우지 않는다 — 나머지 칸만 맞춘 뒤 제자리에 끼운다.
  const free = alignFree(plan.filter((p) => !p.fixed), raw);
  let k = 0;
  return plan.map((p) => (p.fixed ? { box: p.name, line: p.fixed.line, keywords: p.fixed.keywords, fixed: true } : free[k++]));
}

function alignFree(
  plan: PlannedBox[],
  raw: { box?: string; line?: string; keywords?: string[] }[] | undefined
): { box: string; line: string; keywords: string[] }[] {
  const items = (raw ?? []).filter((r) => r && typeof r === "object");
  const used = new Set<number>();
  const byName = new Map(plan.map((p, i) => [normHeading(p.name), i] as const));
  const slot: ({ line?: string; keywords?: string[] } | null)[] = plan.map(() => null);
  items.forEach((r, k) => {
    const i = byName.get(normHeading(r.box ?? ""));
    if (i !== undefined && !slot[i]) {
      slot[i] = r;
      used.add(k);
    }
  });
  // 이름이 어긋난 것은 같은 순번 자리가 비어 있고, 그 이름이 다른 칸 이름도 아닐 때만 받는다.
  items.forEach((r, k) => {
    if (used.has(k) || k >= plan.length || slot[k]) return;
    if (byName.has(normHeading(r.box ?? ""))) return;
    slot[k] = r;
    used.add(k);
  });
  return plan.map((p, i) => ({
    box: p.name,
    line: slot[i]?.line?.trim() || firstSentence(p.text),
    keywords: slot[i]?.keywords ?? [],
  }));
}

/** 칸 글의 첫 문장(모델이 그 칸을 못 채웠을 때의 대체 줄). */
export function firstSentence(text: string, max = 60): string {
  const flat = text.replace(/\[[^\]]*\]\s*/g, "").replace(/\s+/g, " ").trim();
  const m = /^(.+?[.!?。])(\s|$)/.exec(flat);
  const s = (m ? m[1] : flat).trim();
  return s.length > max ? `${s.slice(0, max).trim()}…` : s;
}
