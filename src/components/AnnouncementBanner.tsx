"use client";

import { Fragment, useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { useLang } from "@/lib/i18n";

interface Latest {
  id: string;
  created_at: string;
  message: string;
}

// 닫은 공지의 id를 브라우저에 기억한다 — 같은 공지는 다시 띄우지 않고, 새 공지가 올라오면(id가 바뀌면) 다시 보인다.
const DISMISSED_KEY = "studed-announcement-dismissed";

/** 글 속 http(s) 주소만 링크로 바꾼다(HTML을 그대로 그리지 않고 React 노드로만 만든다). */
function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/** 공지 첫 줄 앞의 이모지는 떼고 보여 준다(이 앱은 아이콘을 이모지가 아니라 lucide로만 쓴다). */
function stripLeadingEmoji(line: string) {
  return line.replace(/^[\s\p{Extended_Pictographic}‍️]+/u, "");
}

/** 첫 줄은 제목, 나머지는 본문. */
function splitNotice(message: string) {
  const lines = message.trim().split("\n");
  const title = stripLeadingEmoji(lines[0] ?? "").trim();
  const body = lines.slice(1).join("\n").trim();
  return { title, body };
}

/**
 * 메인 화면 맨 위에 놓이는 공지 띠 — 관리자가 올린 최신 글 하나를 한 줄로 보여 준다.
 * 구석에 떠 있다 사라지는 토스트가 아니라 화면 흐름 안에 머물며, 닫기 버튼으로만 닫는다.
 * 본문이 있으면 "자세히"로 펼친다(첫 화면을 큰 상자가 차지하지 않게 접어 둔다). 삭제하면 다음 로드부터 사라진다.
 */
export default function AnnouncementBanner() {
  const { lang, t } = useLang();
  const [latest, setLatest] = useState<Latest | null>(null);
  const [hidden, setHidden] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/announcements/latest")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const a = (data.announcement ?? null) as Latest | null;
        setLatest(a);
        let dismissed: string | null = null;
        try {
          dismissed = localStorage.getItem(DISMISSED_KEY);
        } catch {
          // 저장소를 못 쓰는 환경에서는 매번 보여 준다.
        }
        setHidden(!a || dismissed === a.id);
      })
      .catch(() => {
        if (!cancelled) setLatest(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!latest || hidden) return null;

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISSED_KEY, latest!.id);
    } catch {
      // 저장하지 못해도 이번 방문에는 닫힌 채로 둔다.
    }
  }

  const { title, body } = splitNotice(latest.message);
  const date = new Date(latest.created_at).toLocaleDateString(lang === "en" ? "en-US" : "ko-KR", { month: "long", day: "numeric" });

  return (
    <section aria-label={t("공지")} className="px-5 pt-4 md:px-14">
      <div className="mx-auto w-full max-w-[1200px] rounded-xl bg-surface px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Megaphone size={15} strokeWidth={1.8} className="shrink-0 text-muted" aria-hidden />
          <p className={["min-w-0 flex-1 text-[13.5px] font-medium", expanded ? "" : "truncate"].join(" ")}>{title}</p>
          <span className="hidden shrink-0 text-xs text-faint sm:inline">{date}</span>
          {body && (
            <button
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="shrink-0 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
            >
              {expanded ? t("접기") : t("자세히")}
            </button>
          )}
          <button
            onClick={dismiss}
            aria-label={t("공지 닫기")}
            className="-mr-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-raised hover:text-foreground"
          >
            <X size={15} strokeWidth={1.8} />
          </button>
        </div>
        {body && expanded && (
          <p className="mt-2 whitespace-pre-wrap break-words border-t border-border pt-2.5 pl-[27px] text-[13.5px] leading-relaxed text-foreground/85">
            {linkify(body)}
          </p>
        )}
      </div>
    </section>
  );
}
