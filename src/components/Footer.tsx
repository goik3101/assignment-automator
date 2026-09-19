import OpenSettingsButton from "@/components/settings/OpenSettingsButton";

export default function Footer() {
  return (
    <footer className="border-t border-border px-6 py-4 text-xs text-muted">
      <div className="mx-auto max-w-2xl space-y-2">
        <OpenSettingsButton className="block text-left text-[11px] leading-snug text-muted underline-offset-2 hover:text-foreground hover:underline">
          🚧 studed는 아직 테스트(베타) 버전이에요. 이상하거나 잘못된 결과를 발견하시면
          알려주세요 — 더 나은 서비스를 만드는 데 큰 도움이 됩니다.
        </OpenSettingsButton>
        <div className="flex items-center justify-between">
          <span>studed — 겹치지 않는, 출처 있는 수행평가 도우미</span>
          <OpenSettingsButton className="underline underline-offset-2 hover:text-foreground">문의하기</OpenSettingsButton>
        </div>
      </div>
    </footer>
  );
}
