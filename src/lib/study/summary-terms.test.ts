import test from "node:test";
import assert from "node:assert/strict";
import { filterKeyTerms } from "./summary-terms.ts";

const MATERIAL = "해양에서는 식물성 플랑크톤이 생산자이고 동물성 플랑크톤은 1차 소비자다. 생물이 죽으면 분해자가 분해한다. 멸치 관찰 지침에는 눈, 뇌가 제시되어 있다.";

test("과제 진행·문서 구조 말과 자료에 없는 합성어를 걸러 낸다(멸치 요약)", () => {
  const terms = [
    { term: "관찰 지침", meaning: "x" },
    { term: "예상과 실제 관찰", meaning: "x" },
    { term: "영양단계의 연결", meaning: "x" },
    { term: "생산자", meaning: "스스로 양분을 만드는 생물" },
    { term: "1차 소비자", meaning: "생산자를 먹는 생물" },
    { term: "분해자", meaning: "사체를 분해하는 생물" },
  ];
  assert.deepEqual(filterKeyTerms(terms, MATERIAL).map((t) => t.term), ["생산자", "1차 소비자", "분해자"]);
});

test("'평가·계획·작성'이 들어간 진짜 개념은 지우지 않는다", () => {
  const material = "형성평가와 사업계획서, 자기평가, 기회비용, 평가 기준표를 다룬다.";
  const terms = ["형성평가", "사업계획서", "자기평가", "기회비용", "평가 기준표"].map((t) => ({ term: t, meaning: "x" }));
  assert.deepEqual(filterKeyTerms(terms, material).map((t) => t.term), ["형성평가", "사업계획서", "자기평가", "기회비용"]);
});

test("거의 다 걸러지면 모델 목록(진행 말만 뺀)을 쓴다", () => {
  const terms = [{ term: "항상성", meaning: "a" }, { term: "삼투", meaning: "b" }, { term: "작성 요령", meaning: "c" }];
  assert.deepEqual(filterKeyTerms(terms, "전혀 다른 자료").map((t) => t.term), ["항상성", "삼투"]);
});

test("영어 화면: 한국어 자료에 용어가 없어도 버리지 않는다", () => {
  const terms = [{ term: "Producer", meaning: "a" }, { term: "Decomposer", meaning: "b" }, { term: "Observation guide", meaning: "c" }];
  assert.deepEqual(filterKeyTerms(terms, MATERIAL, { skipMaterialCheck: true }).map((t) => t.term), ["Producer", "Decomposer", "Observation guide"]);
});
