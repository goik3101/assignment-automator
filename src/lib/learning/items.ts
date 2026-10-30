import { itemMatchesHeading } from "@/lib/research/research-items";
import { needsSubjectSelection as needsSubject } from "@/lib/selection/selection-need";
import type { CoreTaskInfo } from "@/types/task";

export interface LearningItemDef {
  label: string;
  elementLabel: string;
}

const MAX_ITEMS = 14;

/**
 * 분석된 과제(core_task_info)에서 학생이 작성해야 할 항목을 뽑는다. analyze.ts가
 * 이미 안내문에서 동적으로 뽑아둔 required_items를 그대로 쓰므로 항목이 하드코딩된
 * 곳은 없다. required_items가 없는 산출물은 산출물 이름 하나를 항목으로 쓴다.
 * 여러 산출물이 같은 항목을 요구하면(예: 자료 수집의 "활동 성과"와 신문 제작의
 * "활동의 성과") 학생이 같은 내용을 두 번 쓰지 않도록 하나로 합친다.
 */
export function deriveLearningItems(info: CoreTaskInfo): LearningItemDef[] {
  const items: LearningItemDef[] = [];
  const addUnique = (label: string, elementLabel: string) => {
    if (items.some((it) => itemMatchesHeading(it.label, label) && itemMatchesHeading(label, it.label))) return;
    if (items.length >= MAX_ITEMS) return;
    items.push({ label, elementLabel });
  };
  for (const el of info.task_elements) {
    if ((el.required_items?.length ?? 0) >= 2) {
      for (const it of el.required_items!) addUnique(it, el.label);
    } else {
      addUnique(el.label, el.label);
    }
  }
  return items;
}

/** 학생이 다룰 인물/대상을 스스로 골라야 하는 과제로 보이는지. 판정은 selection-need.ts(순수 함수)에 있다. */
export function needsSubjectSelection(info: CoreTaskInfo): boolean {
  return needsSubject(info);
}
