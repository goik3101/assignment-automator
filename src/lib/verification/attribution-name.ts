// 저자 이름 비교(모델 호출 없음). alias import 없음 — node:test에서 바로 불러올 수 있게.

// "전승환 지음", "전승환(지은이)", "전승환 저" 처럼 흔한 접미사가 붙어도
// 같은 인물로 인식하도록 정리한다 — 이름 자체의 표기 차이(예: 띄어쓰기)에만
// 관대할 뿐, 실제로 다른 이름까지 같다고 우기지는 않는다.
export function normalizeAttributionName(name: string): string {
  return name
    .replace(/\s+/g, "")
    .replace(/(지음|지은이|엮음|엮은이|옮김|옮긴이|글|그림|저자|저)$/g, "")
    .toLowerCase();
}

/**
 * 같은 사람인가 — 괄호 속 병기·"또는" 이표기·공저 구분 기호 차이까지 풀어 하나라도 겹치면 같다고 본다.
 * 실측(2026-10-22, 30회 테스트에서 3건 — 매번 전체 재생성 약 16초 + 거짓 "저자 정보가 불확실합니다" 경고):
 * "마셜 B. 로젠버그" vs "Marshall B. Rosenberg (마셜 B. 로젠버그, 또는 마샬 B. 로젠버그)",
 * "케빈 리먼" vs "Kevin Leman (한국어 표기: 케빈 리먼)", "기시미 이치로, 고가 후미타케" vs "기시미 이치로; 고가 후미타케".
 */
export function sameAttribution(a: string, b: string): boolean {
  if (process.env.ESSAY_QUALITY_FIXES === "off") return normalizeAttributionName(a) === normalizeAttributionName(b);
  const squash = (s: string) => normalizeAttributionName(s.replace(/\([^)]*\)/g, "")).replace(/[,;/·&.]|and|외/g, "");
  const sa = squash(a);
  const sb = squash(b);
  if (sa.length >= 3 && sb.length >= 3 && (sa.includes(sb) || sb.includes(sa))) return true;
  const variants = (s: string) =>
    new Set(
      [s.replace(/\([^)]*\)/g, ""), ...[...s.matchAll(/\(([^)]*)\)/g)].map((m) => m[1])]
        .flatMap((part) => part.split(/,|;|\/|·|&|또는|\bor\b|\band\b/))
        // "(한국어 표기: 케빈 리먼)"처럼 괄호 안 이름표는 떼고 이름만 본다.
        .map((part) => part.replace(/^[^:：]{0,12}[:：]/, ""))
        .map(normalizeAttributionName)
        .filter((x) => x.length >= 2)
    );
  const va = variants(a);
  for (const x of variants(b)) if (va.has(x)) return true;
  return false;
}
