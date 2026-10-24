import type { ReactNode } from "react";
import Link from "next/link";

export function LegalDoc({ title, effective, children }: { title: string; effective: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-sm leading-7 text-foreground">
      <nav className="mb-6 flex gap-4 text-xs text-faint">
        <Link href="/" className="hover:text-foreground">홈</Link>
        <Link href="/terms" className="hover:text-foreground">이용약관</Link>
        <Link href="/privacy" className="hover:text-foreground">개인정보처리방침</Link>
      </nav>
      <h1 className="text-[24px] font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-xs text-faint">시행일: {effective}</p>
      <div className="mt-8 space-y-8">{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="space-y-2 text-muted">{children}</div>
    </section>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-xs">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="border border-border-strong bg-raised px-3 py-2 font-semibold text-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="border border-border-strong px-3 py-2 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
