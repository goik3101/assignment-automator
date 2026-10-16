import { FlaskConical } from "lucide-react";
import OpenSettingsButton from "@/components/settings/OpenSettingsButton";

export default function Footer() {
  return (
    <footer className="border-t border-border px-6 py-3 text-xs text-faint md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <OpenSettingsButton className="flex items-center gap-1.5 text-left transition-colors hover:text-foreground">
          <FlaskConical size={13} strokeWidth={1.7} className="shrink-0" />
          <span>베타 버전이에요. 이상한 결과를 발견하면 알려 주세요.</span>
        </OpenSettingsButton>
        <span>studed</span>
      </div>
    </footer>
  );
}
