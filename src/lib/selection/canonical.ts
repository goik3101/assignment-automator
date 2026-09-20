// 자동 선정 결과의 "같은 대상인지" 판별용 canonical identity.
// 화면에 보이는 이름(display)과 중복 계산에 쓰는 키(key)를 분리한다.
// 표기 차이("마틴 루서 킹"/"마틴 루터 킹 주니어")는 별칭 사전 + 모델이 준 canonical_id로 합치고,
// 사전에 없는 대상은 정규화한 이름 자체가 키다(다른 대상을 잘못 합치지 않는 쪽이 기본값).

export interface CanonicalEntity {
  key: string;
  display: string;
}

interface AliasEntry {
  key: string;
  display: string;
  /** 공백·부호를 뺀 소문자 표기들(한글/영문 모두). */
  variants: string[];
}

// 자주 반복 선정되는 인물 위주. 여기 없는 대상도 동작한다(정규화 이름이 키가 됨) — 사전은 "확실히 같은 사람"만 합치는 용도.
const PERSON_ALIASES: AliasEntry[] = [
  { key: "martin_luther_king_jr", display: "마틴 루터 킹 주니어", variants: ["마틴루터킹", "마틴루서킹", "마틴루터킹주니어", "마틴루서킹주니어", "마틴루터킹jr", "마틴루서킹jr", "martinlutherking", "martinlutherkingjr", "mlk", "킹목사"] },
  { key: "henry_dunant", display: "앙리 뒤낭", variants: ["앙리뒤낭", "장앙리뒤낭", "헨리뒤낭", "앙리뒤낭선생", "henrydunant", "jeanhenridunant", "henridunant"] },
  { key: "bang_jeong_hwan", display: "방정환", variants: ["방정환", "소파방정환", "소파"] },
  { key: "janusz_korczak", display: "야누시 코르차크", variants: ["야누시코르차크", "야누슈코르착", "야누쉬코르착", "야누시코르착", "코르차크", "januszkorczak", "henrykgoldszmit"] },
  { key: "mahatma_gandhi", display: "마하트마 간디", variants: ["간디", "마하트마간디", "모한다스간디", "gandhi", "mahatmagandhi", "mohandasgandhi"] },
  { key: "nelson_mandela", display: "넬슨 만델라", variants: ["넬슨만델라", "만델라", "nelsonmandela"] },
  { key: "eleanor_roosevelt", display: "엘리너 루스벨트", variants: ["엘리너루스벨트", "엘리너루즈벨트", "엘리노어루스벨트", "엘리너루스벨트여사", "eleanorroosevelt"] },
  { key: "rosa_parks", display: "로자 파크스", variants: ["로자파크스", "로자팍스", "rosaparks"] },
  { key: "malala_yousafzai", display: "말랄라 유사프자이", variants: ["말랄라유사프자이", "말랄라", "맬럴라유사프자이", "malalayousafzai", "malala"] },
  { key: "jeon_tae_il", display: "전태일", variants: ["전태일"] },
  { key: "helen_keller", display: "헬렌 켈러", variants: ["헬렌켈러", "helenkeller"] },
  { key: "edward_jenner", display: "에드워드 제너", variants: ["에드워드제너", "에드워드제너", "edwardjenner"] },
  { key: "william_wilberforce", display: "윌리엄 윌버포스", variants: ["윌리엄윌버포스", "윌버포스", "williamwilberforce"] },
  { key: "thomas_clarkson", display: "토머스 클라크슨", variants: ["토머스클라크슨", "토마스클락슨", "토머스클락슨", "토마스클라크슨", "thomasclarkson"] },
  { key: "thomas_paine", display: "토머스 페인", variants: ["토머스페인", "토마스페인", "thomaspaine"] },
  { key: "sophie_scholl", display: "소피 숄", variants: ["소피숄", "조피숄", "sophiescholl"] },
  { key: "john_locke", display: "존 로크", variants: ["존로크", "johnlocke"] },
  { key: "kim_gu", display: "김구", variants: ["김구", "백범김구", "백범"] },
  { key: "ahn_changho", display: "안창호", variants: ["안창호", "도산안창호", "도산"] },
  { key: "bartolome_de_las_casas", display: "바르톨로메 데 라스 카사스", variants: ["바르톨로메데라스카사스", "라스카사스", "bartolomedelascasas"] },
  { key: "rosa_luxemburg", display: "로자 룩셈부르크", variants: ["로자룩셈부르크", "rosaluxemburg"] },
  { key: "aung_san_suu_kyi", display: "아웅산 수치", variants: ["아웅산수치", "수치", "aungsansuukyi"] },
  { key: "susan_b_anthony", display: "수전 B. 앤서니", variants: ["수전b.앤서니", "수전b앤서니", "수잔b앤서니", "susanbanthony"] },
];

/** 이름에서 괄호 안 병기(원어 등)와 공백·부호를 떼고 소문자로 만든다. */
export function compactName(name: string): string {
  return name
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/\s*(선생님|선생|여사|박사|교수|씨)$/u, "")
    .replace(/[\s·・\-_'"‘’“”「」『』《》,.]/g, "")
    .toLowerCase();
}

function parenthetical(name: string): string | null {
  const m = /[（(]([^）)]+)[）)]/.exec(name);
  return m ? m[1].replace(/[\s·・\-_.]/g, "").toLowerCase() : null;
}

const VARIANT_INDEX: Map<string, AliasEntry> = new Map();
for (const e of PERSON_ALIASES) {
  VARIANT_INDEX.set(e.key.replace(/_/g, ""), e);
  for (const v of e.variants) VARIANT_INDEX.set(v.replace(/[\s.]/g, ""), e);
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * 표시 이름(+ 모델이 준 영문 canonical_id, 선택)으로 canonical identity를 만든다.
 * 우선순위: 별칭 사전(이름 → 괄호 병기 → canonical_id) → canonical_id 슬러그 → 정규화한 이름.
 */
export function canonicalize(name: string, canonicalId?: string | null): CanonicalEntity {
  const display = name.trim();
  const compact = compactName(display);
  const hit =
    VARIANT_INDEX.get(compact) ??
    (parenthetical(display) ? VARIANT_INDEX.get(parenthetical(display)!) : undefined) ??
    (canonicalId ? VARIANT_INDEX.get(canonicalId.toLowerCase().replace(/[^a-z0-9]/g, "")) : undefined);
  if (hit) return { key: hit.key, display: hit.display };
  const id = canonicalId ? slug(canonicalId) : "";
  // 모델의 canonical_id는 사전 밖 대상의 표기 변형을 합치는 데만 쓴다(너무 짧으면 오합병 위험이라 무시).
  return { key: id.length >= 6 ? id : compact || slug(display), display };
}

/** 예전 방식으로 저장된 item_name(공백 제거한 한글 등)을 canonical key로 승격한다. */
export function canonicalKeyFromLegacy(itemName: string): string {
  const hit = VARIANT_INDEX.get(itemName.replace(/[\s.]/g, "").toLowerCase());
  return hit ? hit.key : itemName;
}

/** 두 key가 같은 대상인지. 사전에 없는 대상끼리는 "한쪽이 다른 쪽에 포함(5자 이상)"까지만 같은 것으로 본다. */
export function sameEntity(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 5 && l.includes(s);
}

// ---- 의미 그룹 -------------------------------------------------------------------------

function bigrams(s: string): Set<string> {
  const t = s.replace(/[\s·・\-_/()]/g, "").toLowerCase();
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

export function bigramSimilarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// 문자열 유사도만으로는 "베르누이 정리"와 "비행기 날개의 양력"이 안 묶여서, 자주 겹치는 탐구 계열은 키워드로 보강한다.
// 사전에 없는 계열은 모델이 후보마다 준 group 라벨의 문자열 유사도로 잡는다.
const KEYWORD_GROUPS: { id: string; words: RegExp }[] = [
  { id: "fluid_bernoulli", words: /베르누이|양력|유체|날개|항력|벤투리|벤츄리|샤워커튼|파스칼|부력/ },
  { id: "digital_dependence", words: /스마트폰|과의존|디지털|미디어중독|sns|소셜미디어|숏폼|게임중독/ },
  { id: "aging_welfare", words: /고령|노인|저출생|저출산|인구절벽|연금|돌봄/ },
  { id: "climate_env", words: /기후|탄소|온난화|환경오염|플라스틱|재생에너지/ },
  { id: "school_violence", words: /학교폭력|사이버불링|왕따|따돌림/ },
];

export function keywordGroupOf(text: string): string | null {
  const t = text.replace(/\s+/g, "");
  return KEYWORD_GROUPS.find((g) => g.words.test(t))?.id ?? null;
}

/** 두 항목(이름+그룹 라벨)이 의미상 같은 계열인지. 임계값은 보수적으로(다른 주제를 묶는 것보다 놓치는 쪽이 낫다). */
export function sameSemanticGroup(a: { name: string; group?: string | null }, b: { name: string; group?: string | null }): boolean {
  const ka = keywordGroupOf(`${a.name} ${a.group ?? ""}`);
  const kb = keywordGroupOf(`${b.name} ${b.group ?? ""}`);
  if (ka && kb) return ka === kb;
  if (a.group && b.group && bigramSimilarity(a.group, b.group) >= 0.5) return true;
  return false;
}
