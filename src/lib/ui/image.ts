// 사진을 서버로 보내기 전에 긴 변 기준으로 줄여서 JPEG로 다시 만든다 — 폰 사진(수 MB)을 그대로 보내면 요청이 커지고 느려진다.
export interface PreparedImage {
  base64: string;
  mimeType: string;
  /** 화면 미리보기용 object URL. 다 쓰면 URL.revokeObjectURL로 해제한다. */
  previewUrl: string;
}

export async function prepareImage(file: File, maxSide = 1600, quality = 0.85): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일(JPG, PNG 등)만 올릴 수 있어요.");
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("이미지를 열지 못했어요. 다른 파일로 시도해 주세요.");
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 처리하지 못했어요.");
  ctx.fillStyle = "#fff"; // 투명 PNG가 검게 나오지 않게
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("이미지를 처리하지 못했어요.");
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
  return { base64: dataUrl.split(",")[1] ?? "", mimeType: "image/jpeg", previewUrl: URL.createObjectURL(blob) };
}
