import test from "node:test";
import assert from "node:assert/strict";
import { noticeSignature, signatureSimilarity, normalizeNotice, MIN_NOTICE_CHARS } from "./signature.ts";

const A = "한국사 수행평가 안내 주제 고대사 문화유산 탐구 논술 및 제작 고구려 백제 신라 발해 4개 국가 중 자신이 소개하고 싶은 문화유산 유물 유적 모두 해당 2가지를 선정해 사진과 함께 설명하고 소개하는 문화유산 안내 포스터 제작하기 논술 작성 조건 필수 작성 양식 참고 준비물 확인 유물 2가지 사진 각 2장씩 준비 논술 양식에 붙일 사진과 제작 양식에 붙일 사진";
const B = "통합사회 수행평가 안내 주제 합리적 선택과 지속 가능한 사회 자신의 진로나 관심사가 들어간 지속 가능한 발전 관련 탐구 주제를 선정하고 관련 통계자료 정책자료 사례 뉴스를 찾아 정리하며 출처를 꼭 밝히고 문제점을 분석하여 대안 및 해결 방안과 결론 및 느낀점을 작성하세요";

test("같은 글(공백·기호·글자 몇 개만 다름)은 높고 다른 안내문은 낮다", () => {
  const a1 = noticeSignature(A)!;
  const a2 = noticeSignature(A.replace(/ /g, "  ").replace("고구려", "고구러") + " ? ___")!;
  const b = noticeSignature(B + B)!;
  assert.ok(signatureSimilarity(a1, a2) > 0.8);
  assert.ok(signatureSimilarity(a1, b) < 0.2);
});

test("너무 짧은 전사는 지문을 만들지 않는다", () => {
  assert.equal(noticeSignature("짧은 글"), null);
  assert.ok(MIN_NOTICE_CHARS >= 100);
  assert.equal(normalizeNotice("A b-1 ___ ?"), "ab1");
});
