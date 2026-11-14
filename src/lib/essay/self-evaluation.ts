// 학생이 **스스로 점수를 매기는 칸**(자기 평가표)과 **직접 계산한 값에 붙은 검색 각주**를 코드가 바로잡는다.
// alias import 없음 — node:test에서 바로 불러옴.
//
// 1) 자기 평가표 (2026-11-14, 거대 안내문 점검 과학-07): 안내문의 "자기 평가지 1/2/3" 표를 모델이
//    "- 양적 관계 이해: 3", "- 의견 개진: 3"처럼 **점수까지 채워** 냈다. 자기 평가는 학생이 하는 것이고 AI가 점수를 대신 정하면
//    학생이 하지 않은 판단을 한 것이 된다. 점수만 비우고 항목은 남긴다(학생이 그 자리에 표시한다).
// 2) 계산 각주 (같은 점검 수학-02): "이 조건의 단리 계산 예시는 총 납입원금 1,800만 원과 세전 이자 111만 원이다.[7]" —
//    **모델이 직접 계산한 값**인데 검색 출처 각주가 붙었고, 그 값은 틀렸다(실제 105만 원). 계산한 값은 출처가 뒷받침하는 사실이 아니다.
//    각주를 떼서 "출처가 확인한 값"처럼 보이지 않게 한다(틀린 계산 자체를 잡는 것은 이 함수의 일이 아니다).

const SELF_EVAL_HEAD = /(?:자기|자가|스스로)\s*평가/;
const SCORE_VALUE = /^(?:[0-5]|[0-5]\s*점|[○◎●△×OXox]|상|중|하|[ABC])$/;
const LIST_LINE = /^(\s*(?:[-*•]|\d+[.)])\s*)(.+?)\s*[:：]\s*(\S{1,4})\s*$/;

/** 자기 평가 머리줄 아래 이어지는 "- 항목: 점수" 줄의 점수를 비운다. */
export function blankSelfEvaluationScores(content: string): { content: string; blanked: number } {
  const lines = content.split("\n");
  let blanked = 0;
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      // 머리줄 바로 아래 빈 줄은 블록을 끊지 않는다(소제목 다음 한 줄 띄움). 두 번째 빈 줄에서 끝낸다.
      if (inBlock && i > 0 && !lines[i - 1].trim()) inBlock = false;
      continue;
    }
    if (SELF_EVAL_HEAD.test(line) && !LIST_LINE.test(line) && !/[:：]\s*\S{1,4}\s*$/.test(line)) {
      inBlock = true;
      continue;
    }
    if (!inBlock) continue;
    const m = LIST_LINE.exec(line);
    if (m && SCORE_VALUE.test(m[3].trim())) {
      lines[i] = `${m[1]}${m[2]}: (      )`;
      blanked++;
    } else if (/^\s*#{1,4}\s/.test(line)) {
      inBlock = false; // 다음 소제목
    }
  }
  return { content: lines.join("\n"), blanked };
}

/** "계산"이라고 스스로 밝힌 문장 + 숫자·단위. 통계를 인용한 문장은 보통 "계산"이라고 말하지 않는다. */
const CALC_WORD = /계산\s*(?:예시|결과|하면|한\s*결과|했|해\s*보면|해\s*보니)|계산\s*값|직접\s*계산|산출한|구한\s*값/;
const NUMBER_UNIT = /\d[\d,.]*\s*(?:만\s*원|천\s*원|억\s*원|원|%|퍼센트|배|개월|년|km|kg|g|mol|m)/;

/** 계산한 값을 말하는 문장 끝의 [n] 각주를 뗀다. */
export function stripCalculationCitations(content: string): { content: string; stripped: number } {
  let stripped = 0;
  const out = content
    .split("\n")
    .map((line) => {
      if (/^\s*(?:#|\|)/.test(line)) return line;
      // 문장 단위로 본다 — 한 줄에 여러 문장이 있어도 계산 문장의 각주만 뗀다.
      return line.replace(/[^.!?。\n]*[.!?。]?(?:\[\d+\])+/g, (sentence) => {
        const body = sentence.replace(/(?:\[\d+\])+\s*$/, "");
        if (CALC_WORD.test(body) && NUMBER_UNIT.test(body)) {
          stripped++;
          return body;
        }
        return sentence;
      });
    })
    .join("\n");
  return { content: out, stripped };
}
