// 우리가 모델에게 준 **프롬프트의 표기**가 학생이 낼 글에 그대로 묻어 나온 것을 코드가 지운다. alias import 없음.
//
// 왜(2026-11-15, 거대 안내문 점검 사회-06): 책이 미리 정해진 과제에서 프롬프트가 "『제목』 (저자: 이름)" 꼴로 책을 알려 주는데,
// 모델이 그 표기를 문장에 베껴 "리처드 탈러와 캐스 선스타인이 공동으로 쓴 『『넛지』』 (저자: 캐스 선스타인)"이 나왔다.
// 겹낫표가 두 겹이고, 이미 저자를 말한 문장 끝에 괄호 저자가 또 붙었다(그 저자는 둘 중 한 명뿐이라 틀리기까지 했다).
// 프롬프트에 "베끼지 말 것"을 더하는 길 대신 후처리가 지운다 — 학생이 제출하는 글에 괄호 저자 표기는 필요 없다.

const DOUBLE_OPEN: Record<string, string> = { "『『": "『", "「「": "「" };

export function stripPromptLeaks(content: string): { content: string; fixed: number } {
  let fixed = 0;
  let out = content;
  // 겹낫표 → 한 겹. 『『넛지』』 → 『넛지』
  out = out.replace(/(『『|「「)([^『』「」\n]{1,80})(』』|」」)/g, (_m, open: string, title: string) => {
    fixed++;
    return `${DOUBLE_OPEN[open]}${title}${open === "『『" ? "』" : "」"}`;
  });
  // 프롬프트의 "(저자: 이름)" 표기. 칸 이름표("저자: ")는 괄호가 없으므로 건드리지 않는다.
  out = out.replace(/[ \t]*\(저자\s*[:：][^()\n]{1,40}\)/g, () => {
    fixed++;
    return "";
  });
  return { content: out, fixed };
}
