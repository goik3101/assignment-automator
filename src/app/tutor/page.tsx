import type { Metadata } from "next";
import TutorApp from "@/components/tutor/TutorApp";

export const metadata: Metadata = { title: "AI 튜터" };

export default function TutorPage() {
  return <TutorApp />;
}
