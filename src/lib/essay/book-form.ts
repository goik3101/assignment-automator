// 학생이 읽은 책이 **어떤 형태의 책인지**(만화·그림책·소설…)를 조사로 확인된 사실에서만 읽는다.
//
// 왜(실측 2026-11-03, 역사 카드뉴스): 사용자의 최소 통과 기준 4번이 "그림을 너무 복잡하게 안 그리고
// **책에 맞게** 그렸는가"다. 《사일구》는 '만화로 보는 민주화운동' 시리즈의 만화책인데, 결과물의 그림 묘사는
// 실사 사진 같은 장면이었다(3회 중 '만화'라는 말이 1회·0회). 만화책을 읽고 만드는 카드뉴스라면
// 그림도 만화의 한 컷처럼 그릴 수 있게 알려 줘야 한다.
//
// **책을 읽을 수는 없다.** 그래서 형태만 쓰고 장면·대사는 절대 지어내지 않는다 — 형태는 서지 조사로 확인된다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

/** 그림을 어떻게 그릴지 달라지는 형태만 본다(소설·수필은 그림 지시가 달라지지 않아 넣지 않는다). */
const FORMS: [RegExp, string][] = [
  [/만화로\s*보는|만화책|그래픽\s*노블|웹툰|카툰|(?<![가-힣])만화(?![화가])/, "만화"],
  [/그림책|그림\s*동화/, "그림책"],
  [/사진집|포토\s*에세이/, "사진집"],
  [/시집(?![가-힣])/, "시집"],
];

export interface BookFormFact {
  text?: string;
  title?: string;
}

/**
 * 조사 노트의 사실들에서 이 책의 형태를 찾는다. 책 제목이 함께 나오는 사실만 본다
 * (다른 책 이야기에 걸리지 않게). 못 찾으면 null — 그러면 아무 지시도 더하지 않는다.
 */
export function bookForm(facts: BookFormFact[], title: string): string | null {
  const key = title.replace(/\s/g, "").toLowerCase();
  if (!key) return null;
  for (const f of facts) {
    const text = `${f.text ?? ""} ${f.title ?? ""}`;
    if (!text.replace(/\s/g, "").toLowerCase().includes(key)) continue;
    for (const [re, name] of FORMS) if (re.test(text)) return name;
  }
  return null;
}

/** 그림을 그려야 하는 산출물에만 붙이는 한 줄. 형태를 모르면 빈 문자열. */
export function bookFormBlock(form: string | null, title: string): string {
  if (!form) return "";
  const how =
    form === "만화"
      ? "칸의 그림은 만화의 한 컷처럼 묘사할 것(인물 표정과 말풍선 한두 개, 단순한 배경)."
      : form === "그림책"
        ? "칸의 그림은 그림책의 한 장면처럼 묘사할 것(큰 인물 하나와 단순한 배경)."
        : form === "사진집"
          ? "칸의 그림은 사진 한 장을 옮겨 그리듯 묘사할 것(한 장면, 군더더기 없이)."
          : "칸의 그림은 그 책의 분위기에 맞게 단순하게 묘사할 것.";
  return `\n【읽은 책의 형태 — 그림 묘사에 반영할 것】 학생이 읽은 『${title}』은 ${form}이다. ${how} 다만 **그 책에 실제로 있는 장면·대사·그림을 본 것처럼 지어내지 말 것** — 책을 확인하지 않았다. 사건의 내용을 ${form}의 그림으로 어떻게 보여줄지만 적는다.\n`;
}
