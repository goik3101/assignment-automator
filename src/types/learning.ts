// 학습 모드 도메인 타입. 자동 작성 모드(types/task.ts의 EssayResult/PlanResult)와
// 의도적으로 분리했다 — 두 모드의 상태가 서로 섞이지 않게 하기 위함.
import type { AdministrativeInfo, CoreTaskInfo, SourceRef } from "./task";

export type LearningSectionStatus =
  | "not_started"
  | "researching"
  | "writing"
  | "feedback"
  | "revision"
  | "completed";

export type ResearchStatus = "pending" | "running" | "done" | "failed";
export type SubjectMode = "direct" | "ai" | "none";

export interface SectionResearch {
  /** 조사 자료 markdown — "### 핵심 설명" 등 소제목과 [n] 각주를 포함한다. */
  content: string;
  sources: SourceRef[];
}

export interface FeedbackIssue {
  /** 학생 글에서 문제가 된 부분(짧은 인용). */
  excerpt: string;
  problem: string;
  /** 고치는 방향을 알려주는 힌트 — 완성된 정답 문장이 아니다. */
  hint: string;
}

export interface RequirementCheck {
  requirement: string;
  met: boolean;
  note: string;
}

export interface LearningFeedback {
  summary: string;
  strengths: string[];
  missing: string[];
  factIssues: FeedbackIssue[];
  requirementCoverage: RequirementCheck[];
  languageIssues: FeedbackIssue[];
  nextSteps: string[];
  /** AI 판단상 이 항목을 완료해도 될 만큼 충분히 작성됐는지. 최종 결정은 학생이 한다. */
  readyToComplete: boolean;
  /** 학생이 표현·문법 등을 직접 질문했을 때만 채워지는 답변. */
  answer?: string;
  createdAt: string;
}

export interface LearningSection {
  id: string;
  session_id: string;
  position: number;
  label: string;
  element_label: string | null;
  research: SectionResearch | null;
  draft: string;
  feedback: LearningFeedback | null;
  feedback_history: LearningFeedback[];
  revision_count: number;
  status: LearningSectionStatus;
  updated_at: string;
}

export interface LearningSession {
  id: string;
  subject: string;
  title: string;
  core_task_info: CoreTaskInfo;
  admin_info: AdministrativeInfo | null;
  instructions: string | null;
  focus_subject: string | null;
  subject_mode: SubjectMode | null;
  research_status: ResearchStatus;
  status: "active" | "completed";
  created_at: string;
  updated_at: string;
}

export interface LearningUsage {
  used: number;
  limit: number;
  /** 관리자는 횟수 제한이 없다. */
  unlimited: boolean;
}

export interface SubjectCandidate {
  name: string;
  /** 과제의 대상 조건(예: 인권 선구자)을 왜 충족하는지. */
  reason: string;
  /** 조사 항목별 배경 단서(답안이 아니라 자료 조사의 출발점). */
  fieldNotes?: { field: string; note: string }[];
}

export const MAX_DRAFT_CHARS = 5000;
