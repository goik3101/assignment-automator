"use client";

import { Children, cloneElement, createContext, isValidElement, useContext, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CircleCheck, Pencil, PencilLine, TriangleAlert } from "lucide-react";
import { useStudyAsk } from "@/components/study/StudyTools";
import type { ChecklistRow } from "@/lib/essay/submit-checklist";
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

// 표: 컴퓨터에서는 표 모양 그대로(글 영역보다 넓게), 폰에서는 한 행이 카드 하나가 된다(globals.css의 .md-table).
// 폰에서는 칸 이름을 각 칸 앞에 붙여야 하므로, 머리글 이름을 표에서 뽑아 행(tr)에 내려 준다.
const TableHeaders = createContext<string[]>([]);

interface HastNode {
  type?: string;
  tagName?: string;
  value?: string;
  children?: HastNode[];
}

function hastText(n: HastNode): string {
  if (n.type === "text") return n.value ?? "";
  return (n.children ?? []).map(hastText).join("");
}

function tableHeaders(table: HastNode | undefined): string[] {
  const thead = table?.children?.find((c) => c.tagName === "thead");
  const row = thead?.children?.find((c) => c.tagName === "tr");
  return (row?.children ?? []).filter((c) => c.tagName === "th" || c.tagName === "td").map((c) => hastText(c).trim());
}

function MdTable({ node, children }: { node?: HastNode; children?: ReactNode }) {
  return (
    <div className="md-table not-prose">
      <TableHeaders.Provider value={tableHeaders(node)}>
        <table>{children}</table>
      </TableHeaders.Provider>
    </div>
  );
}

function MdRow({ children }: { children?: ReactNode }) {
  const headers = useContext(TableHeaders);
  let col = 0;
  return (
    <tr>
      {Children.map(children, (child) =>
        isValidElement(child) ? cloneElement(child as ReactElement<{ "data-label"?: string }>, { "data-label": headers[col++] ?? "" }) : child
      )}
    </tr>
  );
}

// 폰에서 칸 제목 옆에 붙는 "고치기" 버튼: 누르면 채팅이 열리고 그 칸을 고쳐 달라는 말이 입력칸에 채워진다.
// 결과물이 저장되지 않았거나(잠김) 공부 도구 제공자가 없는 화면(공유 페이지 등)에서는 그리지 않는다. 넓은 화면에서는 숨긴다(lg:hidden).
function EditChip({ title }: { title: string }) {
  const t = useT();
  const ask = useStudyAsk();
  const name = title.trim();
  if (!ask || !name) return null;
  return (
    <button
      type="button"
      onClick={() => ask(t("‘{title}’ 칸을 이렇게 고쳐줘: ", { title: name }))}
      aria-label={t("이 칸 고치기")}
      className="ml-2 inline-flex h-6 items-center gap-1 rounded-full border border-border-strong px-2 align-middle text-[11px] font-medium text-muted transition-colors hover:bg-raised hover:text-foreground lg:hidden"
    >
      <Pencil size={11} strokeWidth={1.9} aria-hidden />
      {t("고치기")}
    </button>
  );
}

export const MD_COMPONENTS: Components = {
  table: MdTable as Components["table"],
  h2({ children, node }) {
    return (
      <h2>
        {children}
        <EditChip title={hastText(node as HastNode)} />
      </h2>
    );
  },
  tr: MdRow as Components["tr"],
  // 안내문이 밑줄을 요구한 표현(영어 어법 3종 등). 눈에 확실히 보이게 두껍게 긋는다 — 학생이 그대로 밑줄을 그으면 된다.
  u({ children }) {
    return <u className="underline decoration-2 underline-offset-[3px]">{children}</u>;
  },
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
 * 제출 전 확인 목록. 코드가 이미 센 값만 보여 준다(submit-checklist.ts) — 긴 설명 대신 한 줄씩.
 * 문제가 있는 행(todo)은 표시를 달리하고, 확인하지 못한 것은 아예 행이 없다.
 */
export function SubmitChecklist({ rows }: { rows: ChecklistRow[] }) {
  const t = useT();
  if (rows.length === 0) return null;
  const text = (r: ChecklistRow): string => {
    switch (r.kind) {
      case "blanks":
        return t("직접 채워야 하는 빈칸 {n}개", { n: r.n });
      case "length":
        return t("글자 수 약 {n}자 (공백 포함)", { n: r.chars });
      case "lengthWarning":
      case "structureWarning":
      case "authorWarning":
        return r.message;
      case "noSources":
        return t("검색 출처가 없어요 — 책·인용구·통계는 직접 확인하세요");
      case "sourcesOpen":
        return t("출처 {n}개 모두 링크가 열려요", { n: r.n });
      case "sourcesBroken":
        return t("출처 {n}개는 링크가 열리지 않았어요", { n: r.n });
      case "claimsOk":
        return t("연도·수치가 든 문장 {n}개를 출처 페이지에서 확인했어요", { n: r.n });
      case "claimsUnsupported":
        return t("출처 페이지에서 값을 찾지 못한 문장 {n}개", { n: r.items.length });
      case "claimsUnread":
        return t("페이지를 읽지 못해 확인하지 못한 문장 {n}개", { n: r.n });
    }
  };
  return (
    <div className="mt-6 rounded-2xl bg-background px-5 py-4">
      <p className="text-sm font-semibold">{t("제출 전 확인")}</p>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed">
        {rows.map((r, i) => (
          <li key={i} className="flex gap-2">
            {r.status === "ok" ? (
              <CircleCheck size={14} strokeWidth={1.8} className="mt-0.5 shrink-0 text-muted" aria-label={t("확인됨")} />
            ) : r.status === "todo" ? (
              <TriangleAlert size={14} strokeWidth={1.8} className="mt-0.5 shrink-0 text-danger" aria-label={t("확인 필요")} />
            ) : (
              <span aria-hidden className="mt-0.5 w-3.5 shrink-0 text-center text-faint">·</span>
            )}
            <div className="min-w-0">
              <p className={r.status === "todo" ? "text-foreground" : "text-muted"}>{text(r)}</p>
              {r.kind === "claimsUnsupported" && (
                <>
                  <ul className="mt-1 space-y-1 text-muted">
                    {r.items.slice(0, 6).map((u, j) => (
                      <li key={j}>
                        {u.text} <span className="text-faint">{t("(찾지 못한 값: {v})", { v: u.tokens })}</span>
                      </li>
                    ))}
                  </ul>
                  {r.marked && <p className="mt-1 text-faint">{t("본문 문장 끝에 [확인 필요]라고 표시했어요")}</p>}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
