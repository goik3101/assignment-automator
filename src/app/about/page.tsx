import type { Metadata } from "next";
import Link from "next/link";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, jsonLdString } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "서비스 소개와 자주 묻는 질문",
  description: "STUDED AI가 무엇이고 어떻게 쓰는지, 출처·다른 학생과 겹치는 문제·개인정보에 대한 질문에 답해요.",
  alternates: { canonical: "/about" },
};

// 화면에 보이는 문장과 FAQPage 구조화 데이터가 같은 배열에서 나오게 해서 둘이 어긋나지 않게 한다.
const FAQ: { q: string; a: string }[] = [
  {
    q: "STUDED AI는 무엇인가요?",
    a: "수행평가 안내문 사진이나 텍스트를 올리면 AI가 안내문을 분석해서, 글로 제출하는 과제는 완성 원고를, 외부 도구로 만들어야 하는 과제(PPT 등)는 실행 계획을 만들어 주는 서비스예요. 만든 결과물을 바탕으로 요약, 플래시카드, 퀴즈, 가상 시험, AI 채팅 같은 공부 도구도 쓸 수 있어요.",
  },
  {
    q: "어떤 수행평가에 쓸 수 있나요?",
    a: "독서 감상문, 과학 탐구 보고서, 영어 발표, 진로 발표 PPT처럼 안내문이 있는 수행평가라면 사진이나 텍스트로 올려서 시작할 수 있어요. 안내문의 평가 기준과 분량, 형식 조건을 읽고 거기에 맞춰 결과물을 만들어요.",
  },
  {
    q: "출처는 진짜인가요?",
    a: "AI가 기억에서 지어내지 않고, 글을 쓰는 시점에 실제로 검색해서 찾은 자료를 출처로 달아요. 출처 링크는 열리는지도 따로 확인해요. 그래도 AI가 자료를 잘못 요약할 수 있으니, 제출 전에 출처를 직접 열어 확인하는 걸 권해요.",
  },
  {
    q: "다른 학생과 결과물이 똑같아지지 않나요?",
    a: "같은 안내문으로 여러 학생이 요청하면 소재와 구성이 한쪽으로 쏠리지 않도록 이미 만들어진 결과물과 겹치는 정도를 비교해서 다른 방향으로 쓰게 해요. 또 AI 특유의 말투가 티 나지 않도록 문체도 다듬어요.",
  },
  {
    q: "만들어진 결과물을 그대로 제출해도 되나요?",
    a: "학교와 과목마다 AI 사용 규칙이 달라요. 먼저 선생님이나 학교의 규칙을 확인하세요. 결과물은 초안으로 보고 본인의 경험과 생각이 들어가도록 직접 고쳐 쓰는 걸 권해요. 개인 경험은 AI가 지어내지 않고 빈칸으로 남겨 두는 방식도 지원해요.",
  },
  {
    q: "AI가 대신 써 주지 않고 직접 쓸 수도 있나요?",
    a: "네. 직접 작성하는 학습 모드에서는 자료 조사와 피드백을 받으면서 본인이 글을 써요. 요약, 플래시카드, 퀴즈, 가상 시험, 암기노트, 예상 질문, AI 채팅 같은 공부 도구도 같이 쓸 수 있어요.",
  },
  {
    q: "로그인해야 하나요? 올린 안내문은 어떻게 다뤄지나요?",
    a: "로그인하면 만든 결과물이 계정에 모여 나중에 다시 볼 수 있어요. 올린 안내문과 결과물의 보관·삭제 방식은 개인정보처리방침에서 자세히 확인할 수 있어요.",
  },
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
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
        <Link href="/terms" className="hover:text-foreground">이용약관</Link>
        <Link href="/privacy" className="hover:text-foreground">개인정보처리방침</Link>
      </nav>
      <h1 className="text-[24px] font-bold tracking-tight">STUDED AI 소개</h1>
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
        <h2 className="text-base font-semibold">자주 묻는 질문</h2>
        {FAQ.map(({ q, a }) => (
          <div key={q} className="space-y-1">
            <h3 className="font-semibold">{q}</h3>
            <p className="text-muted">{a}</p>
          </div>
        ))}
      </section>

      <p className="mt-12 text-xs text-faint">STUDED AI는 베타 버전이에요. 이상한 결과를 발견하면 앱 안의 피드백으로 알려 주세요.</p>
    </div>
  );
}
