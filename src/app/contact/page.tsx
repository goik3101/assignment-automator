import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/lib/legal/info";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL, SOCIAL_LINKS, jsonLdString, pageOpenGraph } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "연락처와 문의 방법",
  description: "STUDED AI 서비스 이용 문의, 오류 신고, 개인정보 관련 요청을 보내는 방법과 공식 채널을 안내해요.",
  alternates: { canonical: "/contact" },
  openGraph: pageOpenGraph("/contact", { title: "STUDED AI 연락처와 문의 방법" }),
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: `${SITE_NAME} 연락처`,
  url: `${SITE_URL}/contact`,
  inLanguage: "ko",
  mainEntity: {
    "@type": "Organization",
    "@id": `${SITE_URL}#organization`,
    name: SITE_NAME,
    email: CONTACT_EMAIL,
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: CONTACT_EMAIL, availableLanguage: ["Korean", "English"] },
  },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-sm leading-7 text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <nav className="mb-6 flex gap-4 text-xs text-faint">
        <Link href="/" className="hover:text-foreground">홈</Link>
        <Link href="/about" className="hover:text-foreground">서비스 소개</Link>
        <Link href="/guide" className="hover:text-foreground">수행평가 가이드</Link>
      </nav>
      <h1 className="text-[24px] font-bold tracking-tight">연락처와 문의 방법</h1>
      <p className="mt-3 text-muted">
        {SITE_NAME}는 {LEGAL.operator}이 운영하는 고등학생 대상 수행평가 AI 서비스예요. 아래 방법으로 문의할 수 있어요.
      </p>

      <section className="mt-10 space-y-2">
        <h2 className="text-base font-semibold">이메일</h2>
        <p className="text-muted">
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2 hover:text-foreground">{CONTACT_EMAIL}</a>
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>서비스 이용 방법과 오류 문의</li>
          <li>
            개인정보 열람·삭제 등 개인정보 관련 요청(자세한 내용은{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">개인정보처리방침</Link> 참고)
          </li>
          <li>이용약관과 서비스 운영에 관한 문의</li>
        </ul>
      </section>

      <section className="mt-10 space-y-2">
        <h2 className="text-base font-semibold">서비스 안에서 보내기</h2>
        <p className="text-muted">서비스 화면 왼쪽 메뉴의 &quot;피드백/문의&quot;에서 불편한 점이나 바라는 기능을 바로 남길 수 있어요.</p>
      </section>

      {SOCIAL_LINKS.length > 0 && (
        <section className="mt-10 space-y-2">
          <h2 className="text-base font-semibold">공식 채널</h2>
          <ul className="space-y-1 text-muted">
            {SOCIAL_LINKS.map((href) => (
              <li key={href}>
                {new URL(href).hostname.replace(/^www\./, "").split(".")[0]}:{" "}
                <a href={href} target="_blank" rel="noopener noreferrer me" className="underline underline-offset-2 hover:text-foreground">{href}</a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
