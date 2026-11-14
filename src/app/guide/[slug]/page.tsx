import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL } from "@/lib/legal/info";
import { GUIDES, getGuide } from "@/lib/seo/guides";
import { SITE_NAME, SITE_URL, jsonLdString, pageOpenGraph } from "@/lib/seo/site";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = getGuide((await params).slug);
  if (!guide) return {};
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/guide/${guide.slug}` },
    openGraph: pageOpenGraph(`/guide/${guide.slug}`, { type: "article", title: guide.title, description: guide.description, publishedTime: guide.datePublished, modifiedTime: guide.dateModified }),
  };
}

export default async function GuidePage({ params }: Props) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();

  const url = `${SITE_URL}/guide/${guide.slug}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: guide.title,
      description: guide.description,
      datePublished: guide.datePublished,
      dateModified: guide.dateModified,
      inLanguage: "ko",
      mainEntityOfPage: url,
      ...(guide.references && { citation: guide.references.map((r) => r.url) }),
      author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "수행평가 가이드", item: `${SITE_URL}/guide` },
        { "@type": "ListItem", position: 3, name: guide.title, item: url },
      ],
    },
  ];
  const related = guide.related.map(getGuide).filter((g) => g !== undefined);

  return (
    <article className="mx-auto max-w-3xl px-6 py-12 text-sm leading-7 text-foreground">
      {jsonLd.map((data, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />
      ))}
      <nav className="mb-6 flex gap-4 text-xs text-faint">
        <Link href="/" className="hover:text-foreground">홈</Link>
        <Link href="/guide" className="hover:text-foreground">수행평가 가이드</Link>
      </nav>
      <h1 className="text-[24px] font-bold leading-snug tracking-tight">{guide.title}</h1>
      <p className="mt-1 text-xs text-faint">
        작성: <Link href="/about" className="hover:text-foreground">{LEGAL.operator}</Link> · 게시 <time dateTime={guide.datePublished}>{guide.datePublished}</time> · 업데이트{" "}
        <time dateTime={guide.dateModified}>{guide.dateModified}</time>
      </p>
      <p className="mt-6 text-muted">{guide.intro}</p>

      <div className="mt-8 space-y-8">
        {guide.sections.map((s) => (
          <section key={s.heading} className="space-y-2">
            <h2 className="text-base font-semibold">{s.heading}</h2>
            <div className="space-y-2 text-muted">
              {s.paragraphs?.map((p) => <p key={p}>{p}</p>)}
              {s.list && (
                <ul className="list-disc space-y-1 pl-5">
                  {s.list.map((li) => <li key={li}>{li}</li>)}
                </ul>
              )}
            </div>
          </section>
        ))}
      </div>

      {guide.references && (
        <section className="mt-12 space-y-2">
          <h2 className="text-base font-semibold">참고 자료</h2>
          <ul className="list-disc space-y-2 pl-5 text-muted">
            {guide.references.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">{r.title}</a>
                <span className="block text-xs text-faint">{r.note}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-12 space-y-2">
          <h2 className="text-base font-semibold">함께 보면 좋은 글</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            {related.map((g) => (
              <li key={g.slug}>
                <Link href={`/guide/${g.slug}`} className="underline underline-offset-2 hover:text-foreground">{g.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-12 rounded-lg border border-border-strong p-4 text-xs text-muted">
        수행평가 안내문 사진을 올리면 조건을 분석해 원고나 실행 계획을 만들어 주는 서비스가 궁금하다면{" "}
        <Link href="/about" className="underline underline-offset-2 hover:text-foreground">{SITE_NAME} 소개</Link>를 확인해 보세요.
      </p>
    </article>
  );
}
