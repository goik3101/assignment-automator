// 제출 글에 섞여 나온 **수업 운영·배점 안내**를 코드가 지운다.
//
// 왜(2026-11-11 측정, 안내문 10종 × 분석 1회): 행정 정보와 핵심 정보의 분리는 분석 모델의 판단에
// 맡겨져 있고, **10종 중 6종**에서 차시·시험 대형·배점·감점 문구가 `core_task_info`로 들어왔다.
// 생성은 그것을 과제 설명으로 읽어 글에 적는다 — 새 안내문 3종 중 2종에서 실제로 새어 나갔다:
//   - 수학: "### 문제" 바로 아래에 "(총 30점, 기본점수 10점 포함)"
//   - 과학: 소제목이 "## 1차시 멸치해부실험"
// 학생이 그대로 내면 선생님이 적어 둔 배점·차시가 답안에 실려 나간다. 프롬프트로 막는 쪽은
// 이미 여러 번 실패했고(`rubric-check`가 체크리스트에서 빼는 것도 같은 문제였다), 분석이 흘리는 것은
// 아래 어디서도 복구되지 않으므로 **제출 직전에 코드로** 지운다. 모델 호출이 없어 시간 예산에 밀리지 않는다.
//
// alias import 없음 — node:test에서 바로 불러올 수 있게.

/** 글 전체가 행정 안내인 줄(앞뒤로 괄호가 있을 수 있다). */
const WHOLE_LINE = [
  // "(총 30점, 기본점수 10점 포함)" — 선생님이 적어 둔 총점
  /^[(（[【]?\s*총\s*\d+\s*점[^)）\]】]*[)）\]】]?\s*$/,
  /^[(（[【]?\s*기본\s*?점수[^)）\]】]*[)）\]】]?\s*$/,
  // "배점: 8점", "평가 일시: 11월 2일", "실시일 : 8월 24일~26일"
  /^[-•*]?\s*(?:배점|총점|평가\s*일시|실시\s*일|실시일|평가\s*시간|제출\s*기한|제출\s*방법|준비물)\s*[:：]\s*.{0,40}$/,
  // "시험 대형으로 책상 간격을 띄운다", "부정행위 적발 시 최하점" — 수업 운영 안내
  /^[-•*]?\s*.{0,40}(?:시험\s*대형|부정\s*행위|부정행위|학업성적관리위원회)\s*.{0,40}$/,
  /^[-•*]?\s*.{0,30}(?:감점(?:된다|됩니다|한다|합니다|처리)|감점\s*요인|감점\s*함)\s*.{0,20}$/,
  // "1차시: 모둠 실험 / 2차시: 개별 평가"처럼 차시 운영만 적은 줄
  /^[-•*]?\s*\d+\s*차시\s*[:：]?\s*.{0,40}$/,
];

/** 소제목 앞의 "N차시" — 뒤에 칸 이름이 남으면 그 이름만 남긴다. */
const HEADING_SESSION = /^(#{1,6}\s*)(?:\[?\s*\d+\s*차시\s*\]?)\s*[-:：]?\s*(?=\S)/;

export interface AdminLeakOptions {
  /** 이 단계가 **채점 기준을 만드는** 칸이면 배점은 학생이 쓸 내용이다(수학 수리논술 출제 과제). */
  keepScoring?: boolean;
}

/** 이 단계가 채점 기준·배점을 **만드는** 칸인가. */
export function isScoringStep(label: string, items: string[] = []): boolean {
  const text = `${label} ${items.join(" ")}`.replace(/\s/g, "");
  return /채점|평가기준|배점|루브릭/.test(text);
}

const SCORING_LINE = /총\s*\d+\s*점|기본\s*?점수|배점|총점|감점/;

// 선생님이 **그냥 주는** 기본점수는 채점 기준을 만드는 칸에서도 학생이 쓸 내용이 아니다.
// 왜(2026-11-14 실측, 수학 출제): 학생이 만든 채점표의 합계 칸이 "… = 30점(기본점수 10점 포함)."으로 나왔다 —
// 기본점수는 선생님이 안내문에 적어 둔 운영 사항이고, 학생이 낸 문항의 배점 합계와는 무관하다.
// 표 칸 안으로 들어오므로 줄을 지우지 않고 **그 구절만** 뗀다(같은 줄에 학생이 만든 배점 합계가 함께 있다).
const BASE_SCORE_PAREN = /\s*[(（[【][^)）\]】]*기본\s*?점수[^)）\]】]*[)）\]】]/g;
const BASE_SCORE_PHRASE = /[,，]?\s*기본\s*?점수\s*\d+\s*점(?:\s*포함)?/g;

/** 어느 줄에서든 기본점수 구절을 뗀다(표 칸 포함). 뗀 자리의 군더더기 공백·쉼표를 정리한다. */
export function stripBaseScore(line: string): string {
  if (!/기본\s*?점수/.test(line)) return line;
  return line.replace(BASE_SCORE_PAREN, "").replace(BASE_SCORE_PHRASE, "").replace(/\s+([.,)）])/g, "$1").replace(/[ \t]{2,}/g, " ");
}

export function stripAdminLeak(content: string, opts: AdminLeakOptions = {}): { content: string; removed: string[] } {
  const removed: string[] = [];
  const out: string[] = [];
  for (const original of content.split("\n")) {
    const raw = stripBaseScore(original);
    if (raw !== original) removed.push(`기본점수 구절: ${original.trim().slice(0, 60)}`);
    const line = raw.trim();
    // 표 줄은 건드리지 않는다 — 학생이 만든 채점표의 값이 들어 있다.
    if (/^\|/.test(line)) {
      out.push(raw);
      continue;
    }
    if (/^#/.test(line)) {
      out.push(raw.replace(HEADING_SESSION, "$1"));
      continue;
    }
    if (line && WHOLE_LINE.some((re) => re.test(line))) {
      if (opts.keepScoring && SCORING_LINE.test(line)) {
        out.push(raw);
        continue;
      }
      removed.push(line);
      continue;
    }
    out.push(raw);
  }
  // 지운 줄 자리에 빈 줄이 겹치면 하나로 줄인다.
  const text = out.join("\n").replace(/\n{3,}/g, "\n\n");
  return { content: text, removed };
}
