// **학생이 칸에 실제로 옮겨 적는 글자 수**를 센다. alias import 없음 — node:test에서 바로 불러옴.
//
// 왜(2026-11-10, 구조 점검): 프롬프트는 "공백 포함 약 N자"라고 말하고, 우리 검사는 `content.trim().length`로
// 쟀다. 그 값에는 **학생이 옮겨 적지 않는 것들**이 들어 있다 — `### 소제목`의 샵과 공백, `**굵게**`의 별표,
// `[1]` 같은 각주 번호, 목록의 `- `. 각주가 많은 단계는 그만큼 더 부풀고, 그 부푼 값이 칸 상한에 부딪힌다.
//
// 실측: 저장분석 신문의 만점 실행에서 `trim().length`는 칸 상한(135~234자) 안이었는데, 마크다운을 뺀
// 실제 글은 178~202자였다 — 즉 **칸이 허락하는 글보다 20%쯤 적게** 쓰고 있었다.
// 칸은 손으로 쓰는 자리이므로, 재야 하는 것은 손으로 쓰는 글자다.
//
// `###`은 떼지만 **소제목의 글자는 센다** — 학생은 "머리기사 제목"도 칸에 적는다.
// 표 줄(`|`)은 칸에 옮겨 적는 모양이 아니라 세지 않는다(표를 요구한 과제는 따로 검사한다).

/** 마크다운 표기와 각주 번호를 뗀 "손으로 쓰는 글". 줄바꿈은 한 칸으로 본다. */
export function submittedText(content: string): string {
  return (content ?? "")
    .split("\n")
    .filter((l) => !/^\s*\|/.test(l))
    .map((l) =>
      l
        // 소제목 표시와 목록 표시는 떼고 글자는 남긴다
        .replace(/^\s*#{1,6}\s*/, "")
        .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
    )
    .join("\n")
    // 각주 번호: [1] [2,3]
    .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, "")
    // 굵게·기울임·밑줄 태그·인라인 코드 표시(글자는 남긴다)
    .replace(/\*\*|__|\*|_|`/g, "")
    .replace(/<\/?u>/g, "")
    // 이미지·링크 문법은 보이는 글자만 남긴다
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** 학생이 칸에 적을 글자 수. `countsSpaces=false`면 공백을 빼고 센다(안내문이 그렇게 말한 경우). */
export function submittedLength(content: string, countsSpaces = true): number {
  const t = submittedText(content);
  return countsSpaces ? t.replace(/\n/g, " ").length : t.replace(/\s/g, "").length;
}
