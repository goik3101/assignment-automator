// 안내문이 "최신·트렌드"를 요구하면 자동 선정 후보를 **최근 대상**으로 좁힌다. alias import 없음.
//
// 왜(2026-11-26, 정보-01 안내문 사진과 대조): 사진 제목은 "2026 IT 트렌드: 세상을 바꾸는 기술 찾기"이고 예시는 AI 저작권·키오스크·딥페이크인데,
// 분석 요약에는 제목의 "2026·최신"이 사라지고 "IT 관련 뉴스 중 하나"만 남았다. 후보 생성은 그 요약만 보므로 2011년 네이트 해킹 사건(fit 1.00)이 뽑혔다.
// 단어 하나로 다 읽을 수는 없어 **"최신"·"트렌드"가 과제 주제·요구에 있고 "~해도 된다" 같은 허용 문장이 아닐 때만** 건다.
// 저장된 안내문 53종 중 걸리는 것: 정보-01·과학-01(최신 과학기술 사례). 과학-05("최신 연구를 주제로 삼아도 된다"는 허용)와 책처방전("요즘 나의 고민")은 제외.
// 되돌리기: SELECTION_RECENCY=off

const WANTS = /최신|트렌드/;
const PERMISSION = /도\s*(?:된다|좋다|괜찮|가능)|할\s*수\s*있/;

export function wantsRecent(texts: (string | undefined)[]): boolean {
  if (process.env.SELECTION_RECENCY === "off") return false;
  for (const t of texts) {
    for (const s of (t ?? "").split(/[.。\n]/)) {
      if (WANTS.test(s) && !PERMISSION.test(s)) return true;
    }
  }
  return false;
}

export function recentConstraint(year = new Date().getFullYear()): string {
  return `안내문이 최신 기술·트렌드를 요구하므로 ${year}년 기준 최근 3년 안(${year - 2}~${year}년)에 화제가 되었거나 지금도 쓰이는 대상만 — 옛 사건·이미 지난 기술은 후보에서 뺀다`;
}

// ── 교과서 위치를 후보로 지어내지 않게 ────────────────────────────────────────────────────────────────────────
// 왜(2026-11-27, 수학-01 사진 대조): "교과서에서 자신에게 의미가 있는 문제"를 고르라는 안내문에서 후보 생성이 "교과서 p16 예제6: 이항정리로 …"를
// 대상으로 만들었고(우리는 학생 교과서를 못 본다 — 존재하지 않는 위치), 글쓰기가 "정해진 대상"이라며 그대로 8/8 출력했다. 글쓰기 끝에 "지어내지 말 것"을 붙여도 8/8이었다(원인이 선정이라서).
// 후보는 쪽수·번호가 아니라 **개념·문제 유형**으로 적게 한다. 저장된 안내문 38종 중 교과서 문제를 고르라는 것은 수학-01·가정-03. SELECTION_TEXTBOOK=off로 끈다.
const TEXTBOOK_PICK = /교과서[^.\n]{0,25}(?:문제|예제|p\.?\s*\d)|(?:문제|예제)[^.\n]{0,15}교과서/;

export function wantsTextbookFree(texts: (string | undefined)[]): boolean {
  if (process.env.SELECTION_TEXTBOOK === "off") return false;
  return texts.some((t) => (t ?? "").split(/[.。\n]/).some((s) => TEXTBOOK_PICK.test(s)));
}

export const TEXTBOOK_CONSTRAINT =
  "후보는 교과서의 쪽수·예제 번호·문제 번호로 적지 말고(우리는 학생의 교과서를 볼 수 없다) 단원 개념이나 문제 유형으로 적는다 — 예: \"이항정리로 (a+b)^n 전개식의 특정 항 계수 구하기\"";
