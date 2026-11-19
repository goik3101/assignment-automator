// 피드백 첨부 이미지 규칙. 브라우저(줄이기)와 서버(받기)가 같은 숫자를 본다. 서버 전용 코드는 넣지 않는다.
export const FEEDBACK_BUCKET = "feedback-attachments";
export const MAX_ATTACHMENTS = 3;
/** 브라우저가 줄인 뒤 목표 크기. 서버 상한(아래)보다 작아야 한다. */
export const TARGET_BYTES = 1_200_000;
/** 서버가 받는 한 장의 상한. Vercel 요청 본문 한도(4.5MB)에 세 장이 들어가야 한다. */
export const MAX_BYTES_EACH = 1_400_000;

export interface FeedbackAttachment {
  /** Storage 경로 */
  path: string;
  /** 사용자가 올린 원래 파일 이름(표시용) */
  name: string;
  size: number;
  type: string;
}

const SIGNATURES: { type: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    type: "image/webp",
    ext: "webp",
    test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  { type: "image/gif", ext: "gif", test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
];

/** 파일 앞부분으로 실제 이미지인지 확인한다(이름·Content-Type은 속일 수 있다). 아니면 null. */
export function sniffImage(bytes: Uint8Array): { type: string; ext: string } | null {
  const hit = SIGNATURES.find((s) => s.test(bytes));
  return hit ? { type: hit.type, ext: hit.ext } : null;
}
