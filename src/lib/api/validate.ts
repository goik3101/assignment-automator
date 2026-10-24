// 라우트 공통 입력 검증. 모델을 부르기 전에 걸러서 비용·시간을 아끼고(실측: 5만자 입력이 그대로 모델로 감, 요소 0개 입력이 22초 걸려 지어낸 요약을 돌려줌) 사용자에게 알아볼 수 있는 오류를 준다.
export const LIMITS = {
  topicText: 8000,
  instructions: 5000,
  imageBase64: 14_000_000, // 약 10MB 이미지
  coreTaskInfoJson: 60_000,
  // 정상 사용(과목명·재생성 요청·앞서 만든 원고 본문)보다 훨씬 넉넉한 값 — 임의로 긴 문자열이 그대로 모델·DB로 가지 않게 하는 상한.
  subject: 300,
  revisionInstructions: 3000,
  fixedSubject: 300,
  referenceFactsText: 100_000,
  feedback: 2000,
  announcement: 1000,
  interests: 1000,
  shortField: 100,
} as const;

/** 이미지 MIME 형식("image/jpeg" 등)만 허용 — data URL에 그대로 끼우는 값이라 `;`·`,` 같은 문자를 막는다. */
export const IMAGE_MIME_PATTERN = /^image\/[a-z0-9.+-]{1,30}$/i;

/** 값이 없거나(undefined/null) 문자열이고 max 이하이면 null, 아니면 사용자에게 보여줄 메시지. */
export function checkText(value: unknown, max: number, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return `${label} 형식이 올바르지 않습니다.`;
  if (value.length > max) return `${label}이(가) 너무 깁니다(최대 ${max.toLocaleString()}자).`;
  return null;
}

/** 생성·재생성 요청 본문의 자유 입력 필드 검증. 문제가 있으면 사용자에게 보여줄 메시지를 돌려준다. */
export function validateGenerationFields(b: {
  subject?: unknown;
  revisionInstructions?: unknown;
  fixedSubject?: unknown;
  referenceFactsText?: unknown;
}): string | null {
  return (
    checkText(b.subject, LIMITS.subject, "과목") ??
    checkText(b.revisionInstructions, LIMITS.revisionInstructions, "수정 요청") ??
    checkText(b.fixedSubject, LIMITS.fixedSubject, "확정된 대상") ??
    checkText(b.referenceFactsText, LIMITS.referenceFactsText, "참고 원고")
  );
}

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** 분석 요청 본문 검증. 문제가 있으면 사용자에게 보여줄 메시지를 돌려준다. */
export function validateAnalyzeInput(b: { imageBase64?: unknown; imageMimeType?: unknown; topicText?: unknown; instructions?: unknown; extraImages?: unknown }): string | null {
  if (b.topicText !== undefined && typeof b.topicText !== "string") return "주제 텍스트 형식이 올바르지 않습니다.";
  if (b.instructions !== undefined && b.instructions !== null && typeof b.instructions !== "string") return "추가 지침 형식이 올바르지 않습니다.";
  if (typeof b.topicText === "string" && b.topicText.length > LIMITS.topicText) return `주제 텍스트가 너무 깁니다(최대 ${LIMITS.topicText}자).`;
  if (typeof b.instructions === "string" && b.instructions.length > LIMITS.instructions) return `추가 지침이 너무 깁니다(최대 ${LIMITS.instructions}자).`;
  if (typeof b.imageBase64 === "string" && b.imageBase64.length > LIMITS.imageBase64) return "이미지 용량이 너무 큽니다(최대 약 10MB).";
  if (typeof b.imageMimeType === "string" && b.imageMimeType && !IMAGE_MIME_PATTERN.test(b.imageMimeType)) return "이미지 형식이 올바르지 않습니다.";
  if (b.extraImages !== undefined) {
    if (!Array.isArray(b.extraImages) || b.extraImages.length > 3) return "추가 사진은 최대 3장까지 올릴 수 있습니다.";
    for (const img of b.extraImages as { base64?: unknown; mimeType?: unknown }[]) {
      if (!img || typeof img.base64 !== "string" || typeof img.mimeType !== "string" || !IMAGE_MIME_PATTERN.test(img.mimeType)) return "추가 사진 형식이 올바르지 않습니다.";
      if (img.base64.length > LIMITS.imageBase64) return "이미지 용량이 너무 큽니다(최대 약 10MB).";
    }
  }
  return null;
}

/** 생성 요청의 coreTaskInfo 검증: 요소가 하나도 없거나 형식이 깨졌으면 모델을 부르지 않는다. */
export function validateCoreTaskInfo(info: unknown, instructions?: unknown): string | null {
  const c = info as { topic?: unknown; task_elements?: unknown } | null;
  if (!c || typeof c !== "object") return "coreTaskInfo 형식이 올바르지 않습니다.";
  if (!Array.isArray(c.task_elements) || c.task_elements.length === 0) return "분석된 과제 항목이 없습니다. 안내문을 다시 분석해주세요.";
  if (c.task_elements.some((e) => !e || typeof (e as { label?: unknown }).label !== "string")) return "과제 항목 형식이 올바르지 않습니다.";
  if (JSON.stringify(c).length > LIMITS.coreTaskInfoJson) return "과제 정보가 너무 큽니다.";
  if (typeof instructions === "string" && instructions.length > LIMITS.instructions) return `추가 지침이 너무 깁니다(최대 ${LIMITS.instructions}자).`;
  return null;
}
