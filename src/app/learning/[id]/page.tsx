import LearningWorkspace from "@/components/learning/LearningWorkspace";

export default async function LearningSessionPage({ params }: PageProps<"/learning/[id]">) {
  const { id } = await params;
  return (
    <div className="min-h-screen">
      <LearningWorkspace id={id} />
    </div>
  );
}
