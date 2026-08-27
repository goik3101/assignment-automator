import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-border px-6 py-4 text-xs text-muted">
      <div className="mx-auto flex max-w-2xl items-center justify-between">
        <span>studed — 겹치지 않는, 출처 있는 수행평가 도우미</span>
        <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">
          문의하기
        </Link>
      </div>
    </footer>
  );
}
