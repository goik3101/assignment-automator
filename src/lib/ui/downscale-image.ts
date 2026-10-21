// 브라우저 전용: 안내문 사진을 보내기 전에 줄인다. 휴대폰 사진(3~5MB)을 그대로 base64로 보내면 4장에 약 20MB가 되고,
// Vercel 함수 요청 본문 한도(4.5MB)를 넘는다. 비전 모델은 어차피 긴 변 2048px 안으로 줄여서 읽으므로 그 크기로 맞춘다.
// 줄이지 못하는 형식(HEIC 등 브라우저가 못 그리는 사진)은 원본을 그대로 쓴다.

const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.85;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = src;
  });
}

/** base64 본문(data URL 접두사 제외)과 MIME 타입. */
export async function imageFileToUploadBase64(file: File): Promise<{ data: string; mimeType: string }> {
  const original = await readAsDataUrl(file);
  const fallback = { data: original.split(",")[1] ?? "", mimeType: file.type };
  try {
    const img = await loadImage(original);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    // 이미 작고 가벼운 사진(1.5MB 이하)은 다시 압축하지 않는다(글씨가 흐려지지 않게).
    if (scale === 1 && file.size <= 1_500_000) return fallback;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return fallback;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const data = out.split(",")[1];
    return data && data.length < fallback.data.length ? { data, mimeType: "image/jpeg" } : fallback;
  } catch {
    return fallback;
  }
}
