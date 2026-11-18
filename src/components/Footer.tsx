import Link from "next/link";
import OpenSettingsButton from "@/components/settings/OpenSettingsButton";
import { getT } from "@/lib/i18n/server";

export default async function Footer() {
  const { t } = await getT();
  const link = "transition-colors hover:text-foreground";
  return (
    <footer className="border-t border-border px-6 py-4 text-[12.5px] text-muted md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5">
        {/* "알려 주세요"를 누르면 바로 피드백 창이 열린다 */}
        <OpenSettingsButton tab="feedback" className={`flex items-center gap-2 text-left ${link}`}>
          <span className="rounded-full border border-border-strong px-2 py-0.5 text-[11px] font-semibold leading-none text-foreground">Beta</span>
          <span>{t("베타 버전이에요. 이상한 결과를 발견하면 알려 주세요.")}</span>
        </OpenSettingsButton>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/guide" className={link}>
            {t("수행평가 가이드")}
          </Link>
          <Link href="/about" className={link}>
            {t("서비스 소개")}
          </Link>
          <Link href="/terms" className={link}>
            {t("이용약관")}
          </Link>
          <Link href="/privacy" className={link}>
            {t("개인정보 처리방침")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
