// 대시보드 카드 썸네일에 보여줄 "글 미리보기". 저장된 결과(JSON 문자열)에서 본문만 꺼내
// 마크다운 기호·각주·제목 줄을 걷어내고 앞부분 몇 줄만 남긴다 — 목록 응답이 커지지 않게
// 서버에서 잘라서 내려준다.
const MAX_LINES = 9;
const MAX_CHARS = 420;

export function makePreview(raw: string | null, outputType: "essay" | "plan"): string {
  if (!raw) return "";
  let text = raw;
  try {
    const parsed = JSON.parse(raw) as { markdown?: string; content?: string };
    text = (outputType === "essay" ? parsed.markdown : parsed.content) ?? "";
  } catch {
    // JSON이 아니면 원문 그대로 쓴다.
  }
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !/^\|?[\s:-]+\|?$/.test(l))
    .map((l) =>
      l
        .replace(/\[\d+\]/g, "")
        .replace(/^[-*•]\s+/, "· ")
        .replace(/[*_`>]/g, "")
        .replace(/\s{2,}/g, " ")
        .trim()
    )
    .filter(Boolean)
    .slice(0, MAX_LINES);
  return lines.join("\n").slice(0, MAX_CHARS);
}
