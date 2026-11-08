// 브라우저 전용: 안내문 사진을 보내기 전에 줄인다. 휴대폰 사진(3~5MB)을 그대로 base64로 보내면 4장에 약 20MB가 되고,
// Vercel 함수 요청 본문 한도(4.5MB)를 넘는다. 비전 모델은 어차피 긴 변 2048px 안으로 줄여서 읽으므로 그 크기로 맞춘다.
// 한도는 사진 한 장이 아니라 "요청 전체"에 걸리므로 여러 장이면 합계를 예산(upload-budget.ts) 안으로 맞춘다 —
// 한 장씩만 보면 1.2MB 사진 4장이 모두 "가볍다"고 원본 그대로 가서 합 6MB가 되어 한도를 넘는다(2026-11-04 실측 사례).
// 줄이지 못하는 형식(HEIC 등 브라우저가 못 그리는 사진)은 원본을 그대로 쓴다.
import { LADDER, fitToBudget } from "./upload-budget";

const SINGLE_KEEP_BYTES = 1_500_000;

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

export interface UploadImage {
  /** base64 본문(data URL 접두사 제외) */
  data: string;
  mimeType: string;
}

interface Source {
  file: File;
  original: UploadImage;
  /** 브라우저가 그릴 수 있으면 디코딩된 그림, 아니면 null(원본을 그대로 쓴다). */
  img: HTMLImageElement | null;
}

function encodeAt(src: Source, step: number, single: boolean): UploadImage {
  const { original, img, file } = src;
  if (!img) return original;
  const { edge, quality } = LADDER[step];
  const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
  // 사진이 한 장이고 이미 작고 가벼우면 다시 압축하지 않는다(글씨가 흐려지지 않게). 여러 장은 합계가 한도에 걸려서 이 지름길을 쓰지 않는다.
  if (step === 0 && scale === 1 && file.size <= SINGLE_KEEP_BYTES && single) return original;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL("image/jpeg", quality).split(",")[1];
  return data && data.length < original.data.length ? { data, mimeType: "image/jpeg" } : original;
}

/** 사진 여러 장을 한 번에 줄여, 합계가 요청 한도 안에 들어오게 한다. 입력 순서 그대로 돌려준다. */
export async function imagesToUploadBase64(files: File[]): Promise<UploadImage[]> {
  const sources: Source[] = await Promise.all(
    files.map(async (file) => {
      const url = await readAsDataUrl(file);
      const original = { data: url.split(",")[1] ?? "", mimeType: file.type };
      try {
        return { file, original, img: await loadImage(url) };
      } catch {
        return { file, original, img: null };
      }
    })
  );
  const single = sources.length === 1;
  const cache = new Map<string, UploadImage>();
  const at = (i: number, step: number) => {
    const key = `${i}:${step}`;
    let hit = cache.get(key);
    if (!hit) {
      hit = encodeAt(sources[i], step, single);
      cache.set(key, hit);
    }
    return hit;
  };
  const { step } = fitToBudget(sources.length, (i, s) => at(i, s).data.length);
  return sources.map((_, i) => at(i, step));
}

/** base64 본문(data URL 접두사 제외)과 MIME 타입. 한 장만 줄일 때(호환용). */
export async function imageFileToUploadBase64(file: File): Promise<UploadImage> {
  return (await imagesToUploadBase64([file]))[0];
}
