-- M3: 비율 기반 억제(6-2)에 쓰이는 "클러스터 쏠림도" 계산 RPC.
--
-- 아직 생성하지 않은 새 결과물과는 비교할 게 없으므로, 대신 "이 클러스터에 이미
-- 쌓인 결과물들이 서로 얼마나 비슷한지"를 측정한다: 최근(3개월 롤링) 결과물
-- 임베딩들의 평균 벡터를 구하고, 그 평균과 threshold 이상 가까운 것의 비율을 낸다.
-- 비율이 높다 = 다들 비슷한 소재/관점으로 수렴했다는 뜻 (기획서 6-2 "확률 쏠림 방지").
--
-- content_embedding("결과물 임베딩")만 쓴다 — clusters.centroid_vector("과제 임베딩")는
-- 절대 여기 섞이지 않는다.
create or replace function cluster_saturation(
  p_cluster_id uuid,
  p_similarity_threshold float,
  p_window_start timestamptz,
  p_exclude_submission_id uuid default null
)
returns table (total_count integer, similar_count integer)
language sql stable
as $$
  with recent as (
    select content_embedding
    from task_embeddings
    where cluster_id = p_cluster_id
      and is_current = true
      and created_at > p_window_start
      and (p_exclude_submission_id is null or submission_id <> p_exclude_submission_id)
  ),
  mean_vec as (
    select avg(content_embedding) as center from recent
  )
  select
    (select count(*)::integer from recent) as total_count,
    (
      select count(*)::integer
      from recent, mean_vec
      where mean_vec.center is not null
        and 1 - (recent.content_embedding <=> mean_vec.center) >= p_similarity_threshold
    ) as similar_count;
$$;
