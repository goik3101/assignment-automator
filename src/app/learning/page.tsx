import { redirect } from "next/navigation";

// 학습 과제 목록은 홈("내 창작물")에 합쳐졌다 — 예전 주소로 들어오면 홈으로 보낸다.
export default function LearningPage() {
  redirect("/");
}
