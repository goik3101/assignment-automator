-- M2: 클러스터 매칭용 RPC 함수.
-- "과제 임베딩"(안내문 core_task_info 기반)을 넣으면, 가장 가까운 기존 클러스터
-- 하나와 코사인 유사도를 반환한다. clusters.centroid_vector 하고만 비교한다 —
-- task_embeddings.content_embedding(결과물 임베딩)은 이 함수에서 절대 쓰지 않는다.
--
-- centroid_vector 자체의 갱신(이동평균 계산)은 SQL이 아니라 애플리케이션 코드
-- (src/lib/clusters/identify-cluster.ts)에서 한다 — pgvector가 벡터 간
-- 요소별(element-wise) 연산(+, -, *)은 지원하지만 벡터×스칼라 연산은 공식적으로
-- 지원하지 않아서, 가중 평균 계산은 JS에서 배열로 직접 하는 편이 더 명확하고 안전하다.
create or replace function match_cluster(
  query_embedding vector(768),
  min_similarity float default 0.0
)
returns table (id uuid, similarity float, match_count integer)
language sql stable
as $$
  select
    clusters.id,
    1 - (clusters.centroid_vector <=> query_embedding) as similarity,
    clusters.match_count
  from clusters
  where 1 - (clusters.centroid_vector <=> query_embedding) >= min_similarity
  order by clusters.centroid_vector <=> query_embedding asc
  limit 1;
$$;
