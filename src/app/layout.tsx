import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { LangProvider } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";

const SITE_TITLE = "STUDED AI";
const SITE_DESCRIPTION =
  "수행평가 안내문 사진만 올리면 AI가 원고나 실행 계획을 만들어 줘요. 실제 검색 출처를 달고, 다른 학생과 겹치지 않게 써 주고, 요약·퀴즈·플래시카드로 공부까지 이어가요.";

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
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  return (
    <html lang={lang} className="h-full antialiased" suppressHydrationWarning>
      <head>
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
