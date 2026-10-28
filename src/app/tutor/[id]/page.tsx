import type { Metadata } from "next";
import TutorApp from "@/components/tutor/TutorApp";

export const metadata: Metadata = { title: "AI 튜터" };

// key로 대화마다 화면 상태를 새로 만든다(대화 A에서 B로 옮길 때 이전 대화가 남지 않게).
export default async function TutorConversationPage(props: PageProps<"/tutor/[id]">) {
  const { id } = await props.params;
  return <TutorApp key={id} initialId={id} />;
}
