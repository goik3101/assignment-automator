import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { LangProvider } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import { SITE_DESCRIPTION, SITE_NAME as SITE_TITLE, SITE_URL, jsonLdString } from "@/lib/seo/site";

// 검색엔진·AI 검색이 사이트가 무엇인지 확실히 알도록 사이트와 운영 주체를 알린다.
const SITE_JSON_LD = [
  { "@context": "https://schema.org", "@type": "WebSite", name: SITE_TITLE, url: SITE_URL, inLanguage: "ko", description: SITE_DESCRIPTION },
  { "@context": "https://schema.org", "@type": "Organization", name: SITE_TITLE, url: SITE_URL, logo: `${SITE_URL}/icon.png` },
];

export const metadata: Metadata = {
  // 링크 미리보기 이미지 주소가 이 도메인 기준으로 만들어진다. 비우면 Vercel 배포 주소로 떨어진다.
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  title: { default: SITE_TITLE, template: "%s | STUDED AI" },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_TITLE,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "ko_KR",
  },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  // 네이버 서치어드바이저 / 구글 서치 콘솔 사이트 소유확인 (<head>에 meta 태그로 출력됨)
  verification: {
    google: "CH2alcvPbpUkFMOpS67XBidPHfqQCNry2juLFDHJIBE",
    other: { "naver-site-verification": "86760b577ad975637f9cffd259517205b99619c9" },
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  return (
    <html lang={lang} className="h-full antialiased" suppressHydrationWarning>
      <head>
        {SITE_JSON_LD.map((data, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />
        ))}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        {/* 한글 UI 서체: Pretendard Variable(필요한 글자만 내려받는 dynamic subset). */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {/* 라이트/다크 선택을 hydration 전에 미리 반영해서 깜빡임(FOUC)을 막는다. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{" +
              "var t=localStorage.getItem('studed-theme');" +
              "if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}" +
              "document.documentElement.setAttribute('data-theme',t);" +
              "}catch(e){}})();",
          }}
        />
      </head>
      <body className="min-h-full bg-background text-foreground md:flex">
        <LangProvider initial={lang}>
          <Sidebar />
          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </LangProvider>
      </body>
    </html>
  );
}
