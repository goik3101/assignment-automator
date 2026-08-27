-- M8: 암기노트(F8, 9-2). 매번 다시 생성하지 않도록 한 번 만든 결과를 캐시해둔다.
alter table user_histories add column memo_note jsonb;
