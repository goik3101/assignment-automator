import Link from "next/link";
import { FlaskConical } from "lucide-react";
import OpenSettingsButton from "@/components/settings/OpenSettingsButton";
import { getT } from "@/lib/i18n/server";

export default async function Footer() {
  const { t } = await getT();
  return (
    <footer className="border-t border-border px-6 py-3 text-xs text-faint md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <OpenSettingsButton className="flex items-center gap-1.5 text-left transition-colors hover:text-foreground">
          <FlaskConical size={13} strokeWidth={1.7} className="shrink-0" />
          <span>{t("베타 버전이에요. 이상한 결과를 발견하면 알려 주세요.")}</span>
        </OpenSettingsButton>
        <span className="flex items-center gap-3">
          <Link href="/terms" className="hover:text-foreground">이용약관</Link>
          <Link href="/privacy" className="hover:text-foreground">개인정보처리방침</Link>
          <span>studed</span>
        </span>
      </div>
    </footer>
  );
}
