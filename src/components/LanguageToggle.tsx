"use client";

import { Languages } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { LANGS } from "@/lib/i18n/core";

/** 화면 언어(한국어/English) 선택. variant="row"는 설정 창, "compact"는 사이드바용. */
export default function LanguageToggle({ variant = "row" }: { variant?: "row" | "compact" }) {
  const { lang, setLang, t } = useLang();
  const group = (
    <div role="radiogroup" aria-label={t("화면 언어")} className="flex shrink-0 gap-0.5 rounded-full bg-raised p-1">
      {LANGS.map((l) => (
        <button
          key={l.id}
          role="radio"
          aria-checked={lang === l.id}
          onClick={() => setLang(l.id)}
          className={[
            "h-8 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors",
            lang === l.id ? "bg-background text-foreground shadow-sm" : "text-muted hover:text-foreground",
          ].join(" ")}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
  if (variant === "compact") return group;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Languages size={18} strokeWidth={1.7} className="text-muted" />
        <div>
          <p className="text-sm font-medium">{t("화면 언어")}</p>
          <p className="text-xs text-muted">{t("버튼과 안내 문구의 언어예요. AI가 만드는 자료도 이 언어를 따라요.")}</p>
        </div>
      </div>
      {group}
    </div>
  );
}
