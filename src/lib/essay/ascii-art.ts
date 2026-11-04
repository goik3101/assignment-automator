// 제출할 글에 섞인 "그림 흉내"(아스키 아트)를 찾아 뺀다.
//
// 왜(실측 2026-11-01, 공통영어2 발명품 제안서): 안내문은 학생이 발명품 사진을 7cm×7cm로 준비하라고 했는데
// 결과물은 코드 블록 안에 볼펜을 기호로 그려 넣었다(`| BIRO PEN ||`). 학생이 그대로 제출하면 사진이 없는 글이고,
// 채점자에게는 장난처럼 보인다. 과제 종류와 무관하게, 수행평가로 낼 글에 기호로 그린 그림이 들어갈 일은 없다.
//
// 코드 블록을 전부 지우지는 않는다 — 글자가 대부분인 블록(인용문·예시 문장)은 둔다. 기호 비율로만 가른다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

const FENCE = /^([ \t]*)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n?\1?\2[ \t]*$/gm;
// 그림에 쓰이는 기호(글자·숫자·문장부호가 아닌 것).
const ART = /[_|/\^~<>+=*#@─━│┃┌┐└┘├┤┬┴┼╔╗╚╝║═▲▼◄►●○■□]/g;

/** 블록 안 내용이 글이 아니라 기호로 그린 그림인가. */
export function isAsciiArt(body: string): boolean {
  const solid = body.replace(/\s/g, "");
  if (solid.length < 8) return false;
  const art = (solid.match(ART) ?? []).length;
  if (art / solid.length >= 0.25) return true;
  // 기호와 공백만으로 된 줄이 두 줄 이상이면 그림으로 본다(글자가 한두 줄 섞인 간판 그림).
  const lines = body.split("\n").filter((l) => l.trim());
  return lines.filter((l) => !/[A-Za-z가-힣0-9]/.test(l) && ART.test(l)).length >= 2;
}

export interface ArtHit {
  info: string;
  body: string;
}

/** 아스키 아트 블록을 빼고, 뺀 것들을 돌려준다. */
export function stripAsciiArt(content: string): { content: string; removed: ArtHit[] } {
  const removed: ArtHit[] = [];
  const out = content.replace(FENCE, (whole, _indent: string, _fence: string, info: string, body: string) => {
    if (!isAsciiArt(body)) return whole;
    removed.push({ info: info.trim(), body });
    return "";
  });
  if (removed.length === 0) return { content, removed };
  return { content: out.replace(/\n{3,}/g, "\n\n").trim(), removed };
}

// 모델이 이미지를 끼워 넣으려 한 흔적("![설명](주소)", "!GravityLight product photograph")은 제출할 글에 남으면 안 된다.
// 실측(2026-11-04, 공통영어2): 본문 한가운데 "!GravityLight product photograph" 한 줄이 그대로 있었고,
// 저장된 결과물 173편 중 5편에 같은 것이 있었다. 학생은 그 줄을 글자 그대로 옮겨 적게 된다.
// 지우기만 하면 "무슨 사진을 준비해야 하는지"도 같이 사라지므로, 설명은 꺼내서 제작 참고로 넘긴다.
const MD_IMAGE = /!\[([^\]]*)\]\([^)\s]*\)/g;
const BARE_IMAGE_LINE = /^\s*!\s*([^\s!][^\n]{2,80})\s*$/;

export interface ImageHint {
  caption: string;
}

/** 이미지 문법을 본문에서 빼고, 거기 적힌 설명을 돌려준다(제작 참고로 옮기기 위해). */
export function stripImageMarkup(content: string): { content: string; hints: ImageHint[] } {
  const hints: ImageHint[] = [];
  let out = content.replace(MD_IMAGE, (_m, alt: string) => {
    const caption = String(alt).trim();
    if (caption) hints.push({ caption });
    return "";
  });
  out = out
    .split("\n")
    .filter((line) => {
      const m = BARE_IMAGE_LINE.exec(line);
      if (!m) return true;
      // "!!" 강조나 "!중요" 같은 한 낱말은 이미지가 아니다 — 두 낱말 이상의 설명일 때만 이미지로 본다.
      const caption = m[1].trim();
      if (caption.split(/\s+/).length < 2) return true;
      hints.push({ caption });
      return false;
    })
    .join("\n");
  if (hints.length === 0) return { content, hints };
  return { content: out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), hints };
}
