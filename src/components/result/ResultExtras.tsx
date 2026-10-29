"use client";

import { Children } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { PencilLine } from "lucide-react";
import type { ClaimCheckSummary } from "@/types/task";
import { useT } from "@/lib/i18n";

// 모델이 "(학생 감상 초안 — …)"으로 표시한 줄은 본문처럼 읽히지 않게 작은 안내 표지로 바꿔 보여 준다 — 학생이 밝히지 않은 생각을 AI가 대신 쓴 부분이라는 뜻이다.
const DRAFT_MARK = "(학생 감상 초안";

function DraftBadge() {
  const t = useT();
  return (
    <span className="not-prose mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted">
      <PencilLine size={12} strokeWidth={1.8} />
      {t("AI가 쓴 초안이에요 — 본인 생각과 경험으로 고쳐 쓰세요")}
    </span>
  );
}

export const MD_COMPONENTS: Components = {
  p({ children }) {
    const parts = Children.toArray(children);
    const first = parts[0];
    if (typeof first === "string" && first.trimStart().startsWith(DRAFT_MARK)) {
      const rest = first.slice(first.indexOf(")") + 1).replace(/^\s+/, "");
      const tail = [rest, ...parts.slice(1)].filter((x) => x !== "");
      return (
        <>
          <DraftBadge />
          {tail.length > 0 && <p>{tail}</p>}
        </>
      );
    }
    return <p>{children}</p>;
  },
};

/** "### 제작 참고"로 떼어 둔, 제출 내용이 아닌 안내(직접 구해 넣을 사진·그림 등). */
export function ProductionNotes({ notes }: { notes: { label?: string; text: string }[] }) {
  const t = useT();
  if (notes.length === 0) return null;
  return (
    <details className="mt-6 rounded-2xl bg-background px-5 py-4">
      <summary className="cursor-pointer text-sm font-semibold">{t("제작 참고 — 제출하는 글이 아니에요")}</summary>
      <div className="mt-3 space-y-4">
        {notes.map((n, i) => (
          <div key={i}>
            {n.label && notes.length > 1 && <p className="mb-1 text-xs font-semibold text-faint">{n.label}</p>}
            <article className="prose prose-sm max-w-none prose-neutral dark:prose-invert prose-p:leading-[1.8] prose-li:leading-[1.8]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{n.text}</ReactMarkdown>
            </article>
          </div>
        ))}
      </div>
    </details>
  );
}

/**
 * 인용 문장이 인용한 페이지와 맞는지 코드로 대조한 결과. 연도·수치·영문 이름만 대조하므로
 * "문장이 맞다"가 아니라 "그 값이 페이지에 있다"는 뜻이다 — 그래서 한계를 함께 적는다.
 */
export function ClaimCheckNote({ checks }: { checks: ClaimCheckSummary[] }) {
  const t = useT();
  const total = checks.reduce(
    (a, c) => ({
      checked: a.checked + c.checked,
      supported: a.supported + c.supported,
      repointed: a.repointed + c.repointed,
      unverified: a.unverified + c.unverified,
      unsupported: [...a.unsupported, ...c.unsupported],
    }),
    { checked: 0, supported: 0, repointed: 0, unverified: 0, unsupported: [] as ClaimCheckSummary["unsupported"] }
  );
  if (total.checked === 0) return null;
  const confirmed = total.supported + total.repointed;
  return (
    <div className="mt-6 rounded-2xl bg-background px-5 py-4 text-xs leading-relaxed text-muted">
      <p className="text-sm font-semibold text-foreground">{t("출처 대조 결과")}</p>
      <p className="mt-1">
        {t("연도·수치·영문 이름이 들어 있는 인용 문장 {n}개를 인용한 페이지 본문과 맞춰 봤어요. {c}개에서 그 값이 확인됐고", {
          n: total.checked,
          c: confirmed,
        })}
        {total.repointed > 0 ? ` ${t("(그중 {n}개는 각주를 실제로 나온 출처로 바로잡았어요)", { n: total.repointed })}` : ""}
        {total.unverified > 0 ? `${t(", {n}개는 페이지를 읽지 못해 자동으로 확인하지 못했어요", { n: total.unverified })}` : ""}
        {t(". 한국어 서술의 뜻까지 맞는지는 판단하지 못하니 중요한 문장은 링크를 열어 확인하세요.")}
      </p>
      {total.unsupported.length > 0 && (
        <div className="mt-2">
          <p className="font-semibold text-danger">{t("읽은 출처 페이지에서 확인되지 않아 각주를 뺀 문장 {n}개", { n: total.unsupported.length })}</p>
          <ul className="mt-1 space-y-1">
            {total.unsupported.slice(0, 6).map((u, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden>·</span>
                <span>
                  {u.text} <span className="text-faint">{t("(찾지 못한 값: {v})", { v: u.tokens })}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1">{t("본문에서는 이 문장 끝에 [확인 필요]라고 표시했어요. 틀렸다는 뜻이 아니라, 읽은 페이지에서 그 값을 찾지 못했다는 뜻이에요.")}</p>
          <p className="mt-1">{t("제출 전에 이 문장들의 사실을 직접 검색해서 확인하거나 고쳐 주세요.")}</p>
        </div>
      )}
    </div>
  );
}
