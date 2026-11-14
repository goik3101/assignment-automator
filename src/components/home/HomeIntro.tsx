import Link from "next/link";
import { SITE_NAME } from "@/lib/seo/site";

// 홈 화면 맨 아래의 소개 글. 대시보드 화면은 글이 거의 없어서 검색엔진·AI가 "이 사이트가 무엇인지" 읽어 갈 문장이 따로 필요하다.
// 서버 컴포넌트라 첫 HTML에 글이 그대로 들어간다.
const FEATURES: { name: string; text: string }[] = [
  { name: "안내문 분석", text: "수행평가 안내문 사진이나 텍스트를 올리면 평가 기준, 분량, 형식 조건을 읽어 어떤 결과물을 만들어야 하는지 정리해요." },
  { name: "완성 원고와 실행 계획", text: "글로 제출하는 과제는 완성 원고를, PPT처럼 외부 도구로 만드는 과제는 실행 계획을 만들어요." },
  { name: "실제 검색 출처", text: "글을 쓰는 시점에 검색해서 찾은 자료를 출처로 달고, 링크가 열리는지도 확인해요." },
  { name: "겹치지 않는 결과물", text: "같은 안내문으로 요청한 다른 학생의 결과물과 소재가 쏠리지 않게 조절하고, AI 특유의 말투를 다듬어요." },
  { name: "요약·플래시카드·퀴즈·가상 시험", text: "만든 결과물로 공부할 수 있는 요약, 플래시카드, 퀴즈, 가상 시험을 만들어요." },
  { name: "AI 튜터와 AI 채팅", text: "직접 쓰고 싶을 때는 튜터가 필요한 것만 물어보며 근거와 개요를 같이 짜고, 궁금한 점은 AI 채팅으로 물어볼 수 있어요." },
];

export default function HomeIntro() {
  return (
    <section aria-labelledby="home-intro-title" className="mx-auto w-full max-w-[1200px] border-t border-border px-6 py-12 text-sm leading-7 md:px-10">
      <h2 id="home-intro-title" className="text-lg font-semibold tracking-tight">{SITE_NAME}는 무엇인가요?</h2>
      <p className="mt-2 max-w-3xl text-muted">
        {SITE_NAME}(스터디드)는 고등학생을 위한 수행평가 AI 서비스예요. 수행평가 안내문 사진만 올리면 AI가 원고나 실행 계획을 만들어 주고, 요약·퀴즈·플래시카드로 공부까지 이어 줘요.
      </p>
      <div className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.name}>
            <h3 className="font-semibold">{f.name}</h3>
            <p className="mt-1 text-muted">{f.text}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 flex flex-wrap gap-x-5 gap-y-1 text-xs text-faint">
        <Link href="/about" className="hover:text-foreground">서비스 소개와 자주 묻는 질문</Link>
        <Link href="/guide" className="hover:text-foreground">수행평가 가이드</Link>
      </p>
    </section>
  );
}
