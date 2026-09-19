const STEPS = ["안내문 업로드 또는 주제 입력", "지침 작성 (선택)", "분석하기"];

/**
 * 입력 폼 진행 상태 체크리스트. 지금은 completed를 부모가 정적으로 넘기고 있고,
 * 실제 폼 상태(이미지/주제/분석 완료 여부)와 연동하는 건 별도 확인 후 진행하기로
 * 함 — 그 전까지는 장식이 아니라 "다음에 뭘 해야 하는지"를 보여주는 안내 용도.
 */
export default function OnboardingChecklist({ completed }: { completed: [boolean, boolean, boolean] }) {
  const doneCount = completed.filter(Boolean).length;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="mb-3 text-xs font-medium text-muted">시작하기 {doneCount}/3</p>
      <ol className="space-y-2.5">
        {STEPS.map((label, i) => {
          const done = completed[i];
          return (
            <li key={label} className="flex items-center gap-2.5 text-sm">
              <span
                className={
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium " +
                  (done ? "bg-accent text-accent-foreground" : "border border-border text-muted")
                }
              >
                {i + 1}
              </span>
              <span className={done ? "text-foreground" : "text-muted"}>{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
