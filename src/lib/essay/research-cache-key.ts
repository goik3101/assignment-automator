// 조사 노트 재사용(캐시)의 순수 함수들. alias import 없음 — node:test에서 바로 불러올 수 있게.
// 캐시에는 공개 웹에서 모은 사실(문장 + 근거 페이지)만 들어가고, 학생·계정 정보는 키에도 값에도 넣지 않는다.
import { createHash } from "node:crypto";
import type { Fact } from "./research-notes";

/** 조사 프롬프트나 노트 형식을 바꾸면 올려서 예전 노트를 쓰지 않게 한다. */
export const RESEARCH_CACHE_VERSION = "v1";

export interface ResearchCacheParts {
  /** 같은 수행평가 식별자(cluster_id). 없으면 캐시를 쓰지 않는다 — 다른 과제의 노트를 섞지 않기 위해. */
  scopeKey: string | null | undefined;
  /** 학교 과목(같은 과제라도 과목이 다르면 조사 관점이 다르다). */
  subject: string;
  book?: { title: string; author?: string } | null;
  /** 이미 선정된 대상(인물·사건 등) 이름. */
  subjectName?: string | null;
  /** 학생이 따로 쓴 지침. 내용이 같을 때만 같은 노트를 쓴다(원문은 저장하지 않고 해시만 쓴다). */
  instructions?: string | null;
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[\s"'“”‘’『』《》「」.,·\-–—:;()]/g, "");

/** 캐시 키. 같은 수행평가 + 같은 책/대상 + 같은 지침이면 같다. 키를 만들 수 없으면 null(= 캐시 안 씀). */
export function researchCacheKey(p: ResearchCacheParts): string | null {
  if (!p.scopeKey) return null;
  const body = JSON.stringify({
    v: RESEARCH_CACHE_VERSION,
    scope: p.scopeKey,
    subject: norm(p.subject),
    book: p.book ? [norm(p.book.title), norm(p.book.author)] : null,
    target: norm(p.subjectName),
    ins: norm(p.instructions),
  });
  return createHash("sha256").update(body).digest("hex");
}

/** 여러 학생이 같은 노트를 쓰게 되므로 저장 기준을 일회용 조사보다 높게 둔다: 사실이 충분하고, 책이면 서지(제목·저자 표기)를 담은 사실이 있어야 한다. */
export const CACHE_MIN_FACTS = 8;
export function worthCaching(n: { facts: Fact[]; book?: unknown }): boolean {
  if (n.facts.length < CACHE_MIN_FACTS) return false;
  if (n.book && !n.facts.some((f) => f.printedTitle && f.printedAuthor)) return false;
  return true;
}

export function isFresh(createdAt: string | number | Date, ttlDays: number, now = Date.now()): boolean {
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) && now - t < ttlDays * 86_400_000;
}

export interface CachedNotes {
  facts: Fact[];
  queries: string[];
  book?: { title: string; author?: string };
}

/** DB에서 읽은 값이 쓸 수 있는 노트 모양인지 확인한다(깨졌거나 사실이 너무 적으면 null — 새로 조사한다). */
export function validateCachedNotes(raw: unknown, minFacts: number): CachedNotes | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { facts?: unknown; queries?: unknown; book?: unknown };
  if (!Array.isArray(o.facts)) return null;
  const facts: Fact[] = [];
  for (const x of o.facts) {
    const f = x as Partial<Fact>;
    if (typeof f?.id !== "string" || typeof f.fact !== "string" || typeof f.url !== "string" || !/^https?:\/\//i.test(f.url)) return null;
    facts.push({
      id: f.id,
      fact: f.fact,
      url: f.url,
      title: typeof f.title === "string" ? f.title : "",
      printedTitle: typeof f.printedTitle === "string" ? f.printedTitle : undefined,
      printedAuthor: typeof f.printedAuthor === "string" ? f.printedAuthor : undefined,
    });
  }
  if (facts.length < minFacts) return null;
  const queries = Array.isArray(o.queries) ? o.queries.filter((q): q is string => typeof q === "string") : [];
  const b = o.book as { title?: unknown; author?: unknown } | undefined;
  const book = b && typeof b.title === "string" && b.title ? { title: b.title, author: typeof b.author === "string" && b.author ? b.author : undefined } : undefined;
  return { facts, queries, book };
}
