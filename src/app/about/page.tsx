import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/lib/legal/info";
import { FAQ, FEATURES } from "@/lib/seo/about-content";
import { CONTACT_EMAIL, SITE_ALT_NAMES, SITE_DESCRIPTION, SITE_NAME, SITE_URL, SOCIAL_LINKS, jsonLdString, pageOpenGraph } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "수행평가 AI 서비스 소개와 자주 묻는 질문",
  description: "수행평가 AI 도우미 STUDED AI가 무엇이고 어떻게 쓰는지, 출처·다른 학생과 겹치는 문제·개인정보에 대한 질문에 답해요.",
  alternates: { canonical: "/about" },
  openGraph: pageOpenGraph("/about", { title: "수행평가 AI 서비스 소개와 자주 묻는 질문" }),
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    alternateName: SITE_ALT_NAMES,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    inLanguage: ["ko", "en"],
    audience: { "@type": "EducationalAudience", educationalRole: "student" },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-sm leading-7 text-foreground">
      {jsonLd.map((data, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />
      ))}
      <nav className="mb-6 flex gap-4 text-xs text-faint">
        <Link href="/" className="hover:text-foreground">홈</Link>
        <Link href="/guide" className="hover:text-foreground">수행평가 가이드</Link>
        <Link href="/terms" className="hover:text-foreground">이용약관</Link>
        <Link href="/privacy" className="hover:text-foreground">개인정보처리방침</Link>
      </nav>
      <h1 className="text-[24px] font-bold tracking-tight">STUDED AI(스터디드) — 수행평가 AI 도우미</h1>
      <p className="mt-3 text-muted">{SITE_DESCRIPTION}</p>

      <section className="mt-10 space-y-2">
        <h2 className="text-base font-semibold">이렇게 써요</h2>
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          <li>수행평가 안내문을 사진으로 찍어 올리거나 텍스트로 붙여넣어요.</li>
          <li>AI가 평가 기준, 분량, 형식 조건을 읽고 만들 결과물의 종류를 알려 줘요.</li>
          <li>AI가 만들어 주기와 직접 작성하기 중에서 고르면, 필요한 경우 몇 가지 질문을 한 뒤 결과물을 만들어요.</li>
          <li>결과물을 확인하고 고쳐 쓴 뒤, 요약·퀴즈·가상 시험으로 내용을 익혀요.</li>
        </ol>
      </section>

      <section className="mt-10 space-y-6">
        <h2 className="text-base font-semibold">주요 기능</h2>
        {FEATURES.map(({ name, text }) => (
          <div key={name} className="space-y-1">
            <h3 className="font-semibold">{name}</h3>
            <p className="text-muted">{text}</p>
          </div>
        ))}
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-base font-semibold">결과물은 이렇게 만들어져요</h2>
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          <li>AI(OpenAI의 언어 모델)가 올린 안내문 사진이나 텍스트를 읽어 평가 기준, 분량, 형식 조건을 정리해요.</li>
          <li>글에 쓸 사실은 웹 검색으로 찾은 자료를 바탕으로 하고, 근거가 되는 문장에는 출처 번호를 달아요.</li>
          <li>출처 링크가 열리는지 확인하고, 안내문 조건(분량, 문장 수, 필수 항목)을 지켰는지 다시 점검해요.</li>
          <li>같은 안내문으로 만든 다른 결과물과 소재가 겹치지 않게 조절해요.</li>
        </ol>
        <p className="text-muted">
          AI가 만든 글은 틀릴 수 있어요. 제출하기 전에 <strong className="text-foreground">출처 링크를 직접 열어 내용을 확인하고</strong>, 학교와 선생님의 AI 사용 규칙을 지키고,
          본인의 경험과 생각이 필요한 부분은 직접 채워 주세요. 개인 경험은 AI가 지어내지 않고 빈칸으로 남겨요.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-base font-semibold">올린 자료는 어떻게 다뤄지나요</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>안내문 사진은 분석을 위해 AI에 전달할 때만 쓰고, 운영자가 별도로 보관하지 않아요.</li>
          <li>로그인하면 만든 결과물이 내 계정에 저장되고, 결과물 삭제와 회원 탈퇴는 설정 화면에서 직접 할 수 있어요. 탈퇴하면 계정에 연결된 자료가 삭제돼요.</li>
          <li>운영자는 입력한 내용을 AI 학습용으로 제공하도록 설정하지 않았어요.</li>
          <li>광고·행태 분석용 쿠키는 쓰지 않아요.</li>
        </ul>
        <p className="text-muted">
          수집 항목, 보관 기간, 국외 이전 같은 자세한 내용은{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">개인정보처리방침</Link>과{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">이용약관</Link>에서 확인할 수 있어요.
        </p>
      </section>

      <section className="mt-10 space-y-2">
        <h2 className="text-base font-semibold">운영 정보</h2>
        <p className="text-muted">
          {SITE_NAME}는 {LEGAL.operator}이 운영하는 고등학생 대상 수행평가 AI 서비스예요. 현재 베타 버전으로 제공하고 있어요. 문의와 개인정보 관련 요청은 {CONTACT_EMAIL}로 보내 주세요.
        </p>
      </section>

      <section className="mt-10 space-y-6">
        <h2 className="text-base font-semibold">자주 묻는 질문</h2>
        {FAQ.map(({ q, a }) => (
          <div key={q} className="space-y-1">
            <h3 className="font-semibold">{q}</h3>
            <p className="text-muted">{a}</p>
          </div>
        ))}
      </section>

      <section className="mt-10 space-y-2">
        <h2 className="text-base font-semibold">문의와 공식 채널</h2>
        <ul className="space-y-1 text-muted">
          <li>
            이메일: <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2 hover:text-foreground">{CONTACT_EMAIL}</a>
          </li>
          {SOCIAL_LINKS.map((href) => (
            <li key={href}>
              {new URL(href).hostname.replace(/^www\./, "").split(".")[0]}:{" "}
              <a href={href} target="_blank" rel="noopener noreferrer me" className="underline underline-offset-2 hover:text-foreground">{href}</a>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-12 text-xs text-faint">STUDED AI는 베타 버전이에요. 이상한 결과를 발견하면 앱 안의 피드백으로 알려 주세요.</p>
    </div>
  );
}
