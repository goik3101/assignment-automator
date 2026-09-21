import { embedText } from "@/lib/llm";

// ⚠️ 이 프로젝트에서 가장 중요한 규칙: 아래 두 함수를 절대 섞어 쓰지 말 것.
// (배경: docs/planning.md 6-0, 10, 19번 챕터 / CLAUDE.md 코딩 컨벤션)
//
// embedForClustering — "과제 임베딩". 안내문(core_task_info)을 넣어서 만들고,
//   clusters.centroid_vector와 비교하는 "이 과제가 어느 클러스터인지 판정"에만 쓴다.
//   판정이 끝나면 버리고, DB 컬럼에 영구 저장하지 않는다.
//
// embedForDiversity — "결과물 임베딩" (content_embedding). 학생이 실제로 받은
//   완성원고/실행계획 텍스트를 넣어서 만들고, task_embeddings.content_embedding에
//   영구 저장한다. 겹침 방지 비율 계산(M3)·MMR 선별(M9)에 쓰인다.
//
// 같은 텍스트라도 반드시 용도에 맞는 함수를 호출할 것 — 함수를 잘못 고르면
// "이 안내문을 받은 학생들은 전부 똑같이 비슷하다"는 식으로 억제 로직 전체가
// 무의미해진다.

/** 과제 임베딩. core_task_info만 넣을 것 — administrative_info나 학생 개인정보는 절대 섞지 않는다. */
export function embedForClustering(coreTaskInfoText: string): Promise<number[]> {
  return embedText(coreTaskInfoText, "clustering");
}

/** 결과물 임베딩. 학생이 실제로 받은 완성원고/실행계획 전체 텍스트를 넣는다. */
export function embedForDiversity(resultText: string): Promise<number[]> {
  return embedText(resultText, "diversity");
}
