"use client";

import { Fragment, useEffect, useRef, useState } from "react";
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

/**
 * 메인 화면 맨 위에 놓이는 공지 배너 — 관리자가 올린 최신 글 하나를 보여 준다.
 * 구석에 떠 있다 사라지는 토스트가 아니라, 화면 흐름 안에 머물며 닫기 버튼으로만 닫는 배너다
 * (여러 디자인 시스템이 "전체 공지는 머리 영역 바로 아래에 두고 닫을 수 있게 하라"고 권한다).
 * 글이 길면 네 줄까지만 보이고 "더 보기"로 펼친다. 삭제하면 다음 로드부터 사라진다.
 */
export default function AnnouncementBanner() {
  const { lang, t } = useLang();
  const [latest, setLatest] = useState<Latest | null>(null);
  const [hidden, setHidden] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

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

  // 네 줄을 넘겨 잘렸는지 확인해서 "더 보기"를 보여 줄지 정한다.
  useEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [latest, expanded, hidden]);

  if (!latest || hidden) return null;

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISSED_KEY, latest!.id);
    } catch {
      // 저장하지 못해도 이번 방문에는 닫힌 채로 둔다.
    }
  }

  const date = new Date(latest.created_at).toLocaleDateString(lang === "en" ? "en-US" : "ko-KR", { month: "long", day: "numeric" });

  return (
    <section aria-label={t("공지")} className="px-5 pt-4 md:px-14">
      <div className="mx-auto flex w-full max-w-[1200px] items-start gap-3.5 rounded-2xl border border-border-strong bg-surface py-4 pl-4 pr-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground text-background">
          <Megaphone size={17} strokeWidth={1.9} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="text-[14px] font-bold">{t("공지")}</span>
            <span className="text-xs text-faint">{date}</span>
          </p>
          <p
            ref={textRef}
            className={["mt-1 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-foreground/90", expanded ? "" : "line-clamp-4"].join(" ")}
          >
            {linkify(latest.message)}
          </p>
          {(clamped || expanded) && (
            <button onClick={() => setExpanded((v) => !v)} className="mt-1.5 text-[13px] font-medium text-muted transition-colors hover:text-foreground">
              {expanded ? t("접기") : t("더 보기")}
            </button>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label={t("공지 닫기")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-foreground"
        >
          <X size={17} strokeWidth={1.8} />
        </button>
      </div>
    </section>
  );
}
