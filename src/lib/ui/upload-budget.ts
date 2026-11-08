// 안내문 사진 여러 장의 "합계" 크기를 서버 요청 한도 안으로 맞추는 계산(순수 함수 — 실제 그림 줄이기는 downscale-image.ts).
// 실측(2026-11-04): 사진 4장을 올리면 "분석에 실패했어요"가 떴다. 서버 기록(ai_usage_log)에는 4장 요청이 한 건도 없었다 — 모델까지 가지도 못한 것이다.
// 원인은 요청 본문 한도(Vercel 함수 4.5MB): 예전 코드는 사진 한 장씩만 보고 "긴 변 2048px 이하·1.5MB 이하면 원본 그대로" 두어서,
// 카카오톡 등으로 받은 1.1~1.4MB 사진 4장은 base64로 합 6~7MB가 되어 한도를 넘었다(한도를 넘으면 서버 코드가 돌기 전에 플랫폼이 거절해 JSON 오류 문구도 없다).
// alias import 없음 — node:test에서 바로 불러올 수 있게.

/** 요청 본문(JSON) 전체 한도. base64 문자열 길이로 센다. */
export const MAX_REQUEST_BASE64 = 4.5 * 1024 * 1024;
/** 사진 base64 합계 예산 — 한도에서 JSON 구조·학생 지침·쿠키 여유를 뺀다. */
export const UPLOAD_BUDGET = 3.6 * 1024 * 1024;

/** 큰 설정에서 작은 설정 순. 인쇄된 안내문 글씨를 읽으려면 긴 변 1200px 밑으로는 내리지 않는다. */
export const LADDER = [
  { edge: 2048, quality: 0.85 },
  { edge: 1800, quality: 0.8 },
  { edge: 1600, quality: 0.75 },
  { edge: 1400, quality: 0.7 },
  { edge: 1200, quality: 0.65 },
] as const;

/** 단계마다 사진 합계 크기(base64 길이)가 주어질 때, 예산 안에 처음 들어오는 단계. 끝까지 안 들어오면 마지막 단계. */
export function chooseLadderStep(totalsByStep: number[], budget = UPLOAD_BUDGET): number {
  const i = totalsByStep.findIndex((t) => t <= budget);
  return i >= 0 ? i : Math.max(0, totalsByStep.length - 1);
}

/**
 * count장의 사진을 가장 선명한 단계부터 줄여 가며 합계를 예산 안에 맞춘다.
 * sizeAt(i, step) = i번째 사진을 그 단계로 만들었을 때 base64 길이. 필요한 단계까지만 계산한다.
 */
export function fitToBudget(count: number, sizeAt: (i: number, step: number) => number, budget = UPLOAD_BUDGET): { step: number; total: number; sizes: number[] } {
  let sizes: number[] = [];
  let total = 0;
  for (let step = 0; step < LADDER.length; step++) {
    sizes = Array.from({ length: count }, (_, i) => sizeAt(i, step));
    total = sizes.reduce((a, b) => a + b, 0);
    if (total <= budget) return { step, total, sizes };
  }
  return { step: LADDER.length - 1, total, sizes };
}
