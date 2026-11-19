import { TARGET_BYTES } from "./attachments";

// 화면 캡처는 몇 MB가 되기 쉬워서, 올리기 전에 브라우저에서 JPEG로 줄인다(글자가 읽히는 선까지만).
const STEPS: { edge: number; quality: number }[] = [
  { edge: 1600, quality: 0.85 },
  { edge: 1600, quality: 0.7 },
  { edge: 1280, quality: 0.7 },
  { edge: 1024, quality: 0.6 },
];

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** 이미지를 읽을 수 없으면(깨진 파일·지원 안 하는 형식) null. */
export async function compressImage(file: File): Promise<File | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    for (const { edge, quality } of STEPS) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      // 투명한 PNG가 JPEG로 바뀌면 검게 나오므로 흰 바탕을 먼저 깐다.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await toBlob(canvas, quality);
      if (blob && blob.size <= TARGET_BYTES) {
        return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}
