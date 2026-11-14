// 안내문이 "참고한 기사 제목과 URL을 보고서 맨 아래에 기재"처럼 **글 끝의 출처 목록**을 요구했는지 읽는다. alias import 없음.
//
// 왜(2026-11-15, 거대 안내문 점검 정보-01): 분석이 그 요구를 칸(required_items)으로 옮긴 실행에서는 출처 목록 항목 규칙이 시스템 확인 출처로 채웠지만,
// 요구사항 문장으로만 남긴 실행에서는 글에 출처 목록이 **아예 없었다**(칸으로 오면 모델이 존재하지 않는 기사 제목을 지어 쓰기도 했다).
// 같은 안내문인데 분석이 그 요구를 어떤 모양으로 내느냐에 따라 달라지므로, 요구사항·작성 기준 **문장**에서도 읽어 같은 경로로 채운다.

const NOUN = "(?:참고한|참고\\s*문헌|참고\\s*자료|인용한\\s*자료|출처)";
const WITH_NOUN_AND_VERB = new RegExp(`${NOUN}[^.\\n]{0,25}(?:제목|URL|링크|주소|목록)[^.\\n]{0,25}(?:기재|표기|적|작성|명시|첨부|제시)`, "i");
const WITH_PLACE = new RegExp(`${NOUN}[^.\\n]{0,20}(?:맨\\s*아래|마지막|끝에|말미)`);

export function wantsSourceList(texts: string[]): boolean {
  return texts.some((t) => (t ?? "").split(/(?<=[.。!?])\s+|\n+/).some((s) => WITH_NOUN_AND_VERB.test(s) || WITH_PLACE.test(s)));
}

/** 요구 문장에 맞는 목록 소제목 이름. */
export function sourceListHeading(texts: string[]): string {
  return texts.some((t) => /참고한\s*기사/.test(t ?? "")) ? "참고한 기사 제목과 URL" : "참고문헌";
}
