import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/lib/seo/guides";
import { SITE_NAME, SITE_URL, jsonLdString, pageOpenGraph } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "수행평가 가이드",
  description: "수행평가 안내문 읽는 법, 독서 감상문 구조, AI 활용 방법, 출처 다는 법, 발표 준비 순서를 정리한 수행평가 가이드예요.",
  alternates: { canonical: "/guide" },
  openGraph: pageOpenGraph("/guide", { title: "수행평가 가이드" }),
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: `${SITE_NAME} 수행평가 가이드`,
  url: `${SITE_URL}/guide`,
  inLanguage: "ko",
  hasPart: GUIDES.map((g) => ({ "@type": "Article", headline: g.title, url: `${SITE_URL}/guide/${g.slug}` })),
};

export default function GuideIndexPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-sm leading-7 text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <nav className="mb-6 flex gap-4 text-xs text-faint">
        <Link href="/" className="hover:text-foreground">홈</Link>
        <Link href="/about" className="hover:text-foreground">서비스 소개</Link>
      </nav>
      <h1 className="text-[24px] font-bold tracking-tight">수행평가 가이드</h1>
      <p className="mt-3 text-muted">수행평가를 준비하는 고등학생을 위한 글이에요. 안내문을 읽는 법부터 AI를 안전하게 쓰는 법까지 정리했어요.</p>
      <ul className="mt-8 space-y-5">
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <Link href={`/guide/${g.slug}`} className="block rounded-lg border border-border-strong p-4 transition-colors hover:bg-raised">
              <h2 className="text-base font-semibold">{g.title}</h2>
              <p className="mt-1 text-muted">{g.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
