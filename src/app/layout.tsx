import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { LangProvider } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "studed",
  description: "겹치지 않는, 출처 있는 과제 도우미",
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
