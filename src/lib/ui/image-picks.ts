// 안내문 사진 여러 장 고르기(새 창작물 모달). 안내문이 안내·채점 기준표·예시 답안지로 나뉘어 있는 과제가 많다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

/** 분석 API가 받는 최대 장수(첫 장 + extraImages 3장). */
export const MAX_GUIDE_IMAGES = 4;

export interface PickLike {
  type: string;
  name: string;
  size: number;
  lastModified: number;
}

/** 이미 고른 사진에 새로 고른 사진을 더한다 — 이미지가 아닌 파일·같은 파일·최대 장수를 넘는 파일은 뺀다. */
export function mergeImagePicks<T extends PickLike>(
  current: T[],
  incoming: T[],
  max = MAX_GUIDE_IMAGES
): { files: T[]; rejectedNonImage: number; overflow: number } {
  const key = (f: T) => `${f.name}|${f.size}|${f.lastModified}`;
  const seen = new Set(current.map(key));
  const files = [...current];
  let rejectedNonImage = 0;
  let overflow = 0;
  for (const f of incoming) {
    if (!f.type.startsWith("image/")) {
      rejectedNonImage++;
      continue;
    }
    if (seen.has(key(f))) continue;
    if (files.length >= max) {
      overflow++;
      continue;
    }
    seen.add(key(f));
    files.push(f);
  }
  return { files, rejectedNonImage, overflow };
}
