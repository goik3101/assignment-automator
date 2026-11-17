// 관리자 집계에서 뺄 계정(운영자 본인·테스트 계정) 판별용 순수 함수(alias import 없음).
// STATS_EXCLUDE_EMAILS에 쉼표로 이메일을 적는다. `*`는 아무 글자나 뜻한다(예: studed-diversity-*@example.com).

export function excludePatterns(raw: string | undefined | null): RegExp[] {
  return (raw ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((p) => new RegExp("^" + p.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$"));
}

export function isExcludedEmail(email: string | null | undefined, patterns: RegExp[]): boolean {
  if (!email || patterns.length === 0) return false;
  const e = email.trim().toLowerCase();
  return patterns.some((re) => re.test(e));
}
