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
