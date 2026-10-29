import { Type, type Schema } from "@google/genai";
import { generate, type LlmPart } from "@/lib/llm";
import { normalizeSubject } from "./normalize-subject";
import { parseLengthConstraint, distributeSharedLength } from "./length-parse";
import { dropNonSubmissionActivities, dropNote, fallbackSubject, forceTextSubmissionIfNoExternalHint } from "./analysis-normalize";
import { splitAnalysisItems } from "./analysis-items";
import { formRequirementsOn, qualityFixesOn } from "@/lib/essay/quality-flags";
import type { AnalyzeResult } from "@/types/task";

// 기획서 6-0 1단계: 안내문에서 administrative_info(제출기한 등)와
// core_task_info(주제·요구사항 등)를 "물리적으로 분리"해서 추출한다.
// 이 스키마 강제는 그라운딩 없는 이미지 분석 단계에 적용되는 것으로,
// 검색+생성 단계(5-1)의 그라운딩+JSON 이슈와는 별개다.
export const ANALYZE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    subject: {
      type: Type.STRING,
      description:
        "과목명 (예: 국어, 과학). 안내문에 과목명이 직접 적혀 있지 않아도, 과제 내용으로 보아 " +
        "가장 그럴듯한 과목을 추론해서 채울 것(예: 신조어 만들기→국어, 앱 기획→정보, 민주화 운동 카드뉴스→역사). " +
        "머리글(〈한국사2 …〉 등)의 과목명이 있으면 그것이 최우선이고, 없으면 만드는 형식(카드뉴스·포스터·PPT)이 아니라 다루는 내용으로 정할 것. " +
        "이 필드는 뒤 단계에서 프롬프트에 그대로 쓰이므로 빈 문자열로 두면 안 된다 — " +
        "다른 필드(행정정보 등)의 '모르면 빈 문자열' 규칙과 달리 이 필드만은 예외로 항상 채울 것.",
    },
    insufficient_data: {
      type: Type.BOOLEAN,
      description:
        "사진이 흐릿하거나 정보가 부족해 신뢰할 수 있는 분석이 불가능하면 true",
    },
    insufficient_reason: {
      type: Type.STRING,
      description: "insufficient_data가 true일 때 그 이유. 아니면 빈 문자열.",
    },
    administrative_info: {
      type: Type.OBJECT,
      properties: {
        due_date: { type: Type.STRING, description: "제출기한. 모르면 빈 문자열." },
        submission_method: { type: Type.STRING, description: "제출 방법. 모르면 빈 문자열." },
        grading_criteria: { type: Type.STRING, description: "감점/채점 기준. 모르면 빈 문자열." },
        other_notes: { type: Type.STRING, description: "기타 행정 안내사항. 모르면 빈 문자열." },
      },
      required: ["due_date", "submission_method", "grading_criteria", "other_notes"],
    },
    core_task_info: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING, description: "과제의 핵심 주제" },
        requirements: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            "구체적으로 요구되는 조건들 (분량, 형식 등). 채점 기준표에 있는 내용·형식·개수 조건(예: '스토리보드 8장면', '5문장 이내', '10줄')도 " +
            "숫자를 바꾸지 말고 안내문 표현 그대로 옮길 것(배점·날짜는 제외).",
        },
        task_elements: {
          type: Type.ARRAY,
          description:
            "이 과제가 요구하는 산출물 요소들. 한 과제에 여러 개가 섞일 수 있음 (예: 감상문+PPT)",
          items: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                enum: ["text_submission", "external_production"],
                description:
                  "text_submission = 글로 그대로 제출 가능 (감상문/서술/대본 등). " +
                  "external_production = 캔바·감마 등 외부 툴이나 물리적 제작이 필요 (PPT/포스터/모형 등)",
              },
              label: { type: Type.STRING, description: "짧은 이름 (예: 독서감상문, 발표 PPT)" },
              description: { type: Type.STRING, description: "이 요소에 대한 구체적 설명" },
              target_length_text: {
                type: Type.STRING,
                description:
                  "이 단계에 분량(글자수·단어수·발표 시간) 제약이 안내문에 명시되어 있으면, 그 표현을 최대한 " +
                  "안내문에 적힌 그대로 옮겨 적을 것(숫자를 계산하거나 바꾸지 말고 원문 그대로) — " +
                  "예: '800자 내외 (±50자 허용)', '500자 이내', '200자 내외', '120~150 words', '약 3분 분량'. 분량 제약이 전혀 " +
                  "없으면 빈 문자열.",
              },
              target_length_counts_spaces: {
                type: Type.BOOLEAN,
                description: "분량 기준이 공백 포함인지 여부. 안내문에 명시가 없으면 true(공백 포함)로 할 것.",
              },
              required_items: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "안내문이 이 요소에서 '반드시 조사/작성하라'고 명시적으로 나열한 세부 항목들을, 안내문에 " +
                  "나온 순서대로, 짧은 항목명(명사구)만 적은 배열. 예: 인권 선구자 탐구 자료 수집 → " +
                  "['인물 선정 이유','인물 배경','주요 활동','활동의 성과','인권 발달에 미친 영향'], " +
                  "과학 실험 설계 → ['탐구 주제','가설','준비물','실험 방법','예상 결과','결론']. " +
                  "안내문에 세부 항목이 2개 이상 명시적으로 나열되어 있을 때만 채울 것 — 안내문에 없는 항목을 " +
                  "추측해서 만들지 말 것. 자유 서술형 과제(신조어 만들기, 글쓰기 등)나 항목 나열이 없으면 빈 배열.",
              },
              items_format: {
                type: Type.STRING,
                enum: ["sections", "flowing"],
                description:
                  "required_items가 있을 때만 의미가 있다. 'sections' = 조사·탐구·자료수집·보고서·실험 설계·" +
                  "계획서·토론 개요·기획서처럼 항목별로 나눠 적는 산출물. 'flowing' = 편지·일기·시·소설·" +
                  "감상문·비평문·발표 대본·책처방전 카드처럼 하나의 글로 이어 쓰는 산출물(항목이 나열돼 있어도 " +
                  "소제목으로 쪼개면 어색한 글). required_items가 비어 있으면 'flowing'.",
              },
            },
            required: ["type", "label", "description"],
          },
        },
        writing_guide: {
          type: Type.STRING,
          description:
            "안내문(채점 기준표·양식·예시 답안)에서 '글을 어떻게 써야 점수를 받는지'만 700자 이내로, 아래 순서대로 정리: " +
            "(1) 학생이 채울 양식의 칸 구성 — 단계(요소)마다 칸 이름·순서·개수(예: '최종 글: Product / Purposes / Features(Benefits) / Limits / Suggestions 칸', '6칸, 칸마다 그림 + 아래 「들어갈 말」 한 줄', '인터뷰: 질문1·답변1·질문2·답변2'). " +
            "(2) 예시 답안(파란 글씨 등 이미 채워진 견본)이 있으면 단계마다 그 형식과 대략 분량(칸마다 몇 문장, 전체 몇 자·몇 단어) — 예시의 소재·이름은 쓰지 말고 '예시 내용은 베끼지 말 것'이라고 적을 것. " +
            "(3) 채점 기준의 내용·형식 기준(예: '기사는 누가·언제·어디서·무엇을·어떻게·왜가 드러나게', '인터뷰는 1945~1948년 주요 사건을 소재로', '만평 또는 광고 중 하나', '수동태·It~that 강조·관계대명사를 쓰고 밑줄'). " +
            "사진 준비 방법·AI 사용 주의·배점·날짜·감점·준비물 같은 행정 정보는 쓰지 말 것. 해당 내용이 없으면 빈 문자열.",
        },
      },
      required: ["topic", "requirements", "task_elements", "writing_guide"],
    },
  },
  required: [
    "subject",
    "insufficient_data",
    "insufficient_reason",
    "administrative_info",
    "core_task_info",
  ],
};

const BASE_SYSTEM_INSTRUCTION = `
너는 한국 고등학교 수행평가 안내문을 분석하는 도우미다.
입력으로 안내문 사진 또는 학생이 직접 입력한 주제 텍스트, 그리고 선택적으로 학생이 추가한 지침을 받는다.
아래 스키마에 맞춰 정확히 JSON으로만 응답하라.

규칙:
- administrative_info(제출기한, 제출방법, 채점기준 등 "행정정보")와
  core_task_info(주제, 요구사항, 산출물 요소 등 "핵심정보")를 절대 섞지 말고 분리해서 채울 것.
- 사진 속 글씨가 흐릿하거나 손글씨라 읽기 어렵거나, **core_task_info(주제·산출물 요소)를 채울 수 없을 만큼**
  핵심 정보가 부족하면 추측해서 채우지 말고 insufficient_data를 true로, insufficient_reason에 이유를 한 문장으로
  적을 것. **administrative_info(제출기한·제출방법·채점기준)가 안내문에 없는 것은 정상이다 — 학생이 주제 텍스트만
  입력했거나 안내문에 그 정보가 원래 없는 경우가 흔하다. administrative_info가 비어 있다는 이유만으로
  insufficient_data를 true로 하지 말 것** — administrative_info는 화면에 참고로 보여줄 뿐이고, 없으면 그냥
  각 필드를 빈 문자열로 두면 된다.
- task_elements는 과제가 실제로 요구하는 만큼 빠짐없이 나열할 것. 여러 차시에
  걸쳐 진행되는 과제라면(예: 1차시 A쓰기 → 2차시 B분석 → 3차시 C작성 → 4차시
  D쓰기), 개수를 임의로 줄이거나 비슷해 보이는 차시를 하나로 합치지 말고
  안내문에 적힌 차시 수만큼 각각 별도의 task_element로 나열할 것. 대부분의
  과제는 1~2개지만, 그건 결과일 뿐 목표가 아니다 — 안내문에 몇 개가 적혀
  있는지가 유일한 기준이다.
- **하나의 글 안에 들어갈 "항목/구성 요소" 목록을 별개의 task_element로 쪼개지 말 것 — 매우 중요.**
  판단 기준: 그 항목들이 학생 입장에서 서로 독립적으로 완성되는 별개의 결과물(예: 신문의
  기사 5편 각각, 발표 자료와 보고서처럼 형식 자체가 다른 산출물)이면 각각 별도의
  task_element로 나열한다. 반대로 그 항목들이 전부 합쳐져야 "한 편의 글"이 완성되는
  구성요소(예: "문제 설정, 변수, 계산 과정, 수식, 표, 결과, 실생활 의미를 포함하시오"처럼
  한 보고서 안의 절 제목들)면 그건 task_element를 여러 개로 쪼개는 게 아니라, **하나의
  task_element**로 두고 그 항목들을 required_items 배열에 넣을 것(items_format은
  "sections"). 예를 들어 "문제 설정, 변수, 계산 과정, 수식, 표, 그래프 계획, 결과, 실생활
  의미를 포함한 탐구 보고서를 작성하시오"는 task_elements가 8개가 아니라 **1개**
  (label: "탐구 보고서", required_items: 8개 항목)여야 한다. 반면 "헤드라인 기사, 배경
  기사, 인터뷰 기사, 사설, 독자 칼럼 5편을 작성하시오"는 각 기사가 독립된 완성 원고이므로
  task_elements를 5개로 나열하는 게 맞다(신문 한 지면에 실린다는 것은 형식일 뿐, 기사
  하나하나가 별개로 완결된 글이기 때문).
- 알 수 없는 필드는 빈 문자열이나 빈 배열로 둘 것 (추측 금지).
- task_elements[].description에는 **안내문 자체에 적힌 그 단계의 활동 내용/형식
  설명만** 담을 것. [이번 과제 한정 지침]에 학생이 적은 구체적 사실(예: 특정
  친구의 이름, 실제로 뽑은 고민 원문, 특정 인용문 등)을 요약해서 다른(또는 여러)
  단계의 description에 끼워 넣지 말 것 — 그 지침은 원본 그대로 별도로 이미
  전달되고 있으니, 여기서 다시 요약해서 섞으면 안 되는 특정 단계의 내용이 엉뚱한
  단계에도 새어 들어가는 문제가 생긴다.
- target_length_text는 그 단계에 **분량(글자수·단어수·발표 시간) 제약이 명시된 경우에만**
  채울 것 — "800자 내외", "500자 이내", "1000자 이상", "120~150 words", "약 3분" 처럼 숫자로 된 분량
  기준이 안내문에 실제로 적혀 있을 때만 그 표현을 원문 그대로 옮겨 적고,
  그런 언급이 전혀 없으면 빈 문자열로 둘 것(추측 금지, 숫자를 계산하거나
  바꿔 쓰지 말 것 — 그대로 베끼기만 할 것). 분량 기준이 특정 단계(예: "2차시
  본문")에만 적용되는 게 명확하면 그 단계에만 채우고, 다른 단계(예: "1차시
  개요")에 별도로 다른 분량 기준이 있으면 그 단계에는 그 표현을 따로 채울
  것 — 안내문 전체에 적용되는 공통 분량이면 해당하는 모든 단계에 같은
  표현을 채울 것.
- required_items는 그 단계에 대해 안내문이 "이 항목들을 조사/작성하라"고 **직접
  나열한 세부 항목**만 안내문 순서대로 짧은 항목명으로 담을 것. 안내문 문장에
  "A, B, C, D에 대한 자료를 수집", "가설·준비물·방법을 쓰고"처럼 항목이 실제로
  적혀 있어야 하며, 없는 항목을 과제 유형으로부터 추측해서 만들지 말 것. 학생이
  고르거나 정하는 것 자체가 요구되면(예: "인물을 선정하고 이유를 작성") 그것도
  항목으로 넣을 것(예: "인물 선정 이유"). 항목이 2개 미만이거나 자유 서술형
  (신조어 만들기, 자유 글쓰기 등)이면 빈 배열. items_format은 조사·탐구·보고서·
  계획서처럼 항목별로 나눠 쓰는 산출물이면 "sections", 편지·감상문·비평문·발표
  대본처럼 한 편의 글로 이어 쓰는 산출물이면 "flowing" — 애매하면 "flowing".
- subject는 안내문 머리글·제목에 적힌 과목명(예: "〈한국사2 현대사 독후 활동〉" → 역사, "공통영어2" → 영어, "통합과학" → 과학)을
  가장 먼저 따를 것. 산출물 형식(카드뉴스·포스터 등)으로 과목을 추측하지 말 것.
  머리글이 잘 안 보이면 다루는 내용으로 정할 것(민주화 운동·4·19혁명·독립운동·전쟁·현대사 → 역사, 책 독후 활동이면 그 책이 다루는 내용 기준).
  미술·정보·체육은 그림 실력·코딩·운동 자체를 평가할 때만 고를 것 — 카드뉴스·포스터·PPT를 만든다는 이유만으로 미술이나 정보로 정하지 말 것.
- 사진이 여러 장이면 모두 한 과제의 안내문이다(안내·채점 기준표·양식·예시 답안이 나뉘어 있을 수 있다). 장마다 따로 분석하지 말고 합쳐서 하나로 분석할 것.
- 학생이 채워 넣는 빈 양식(번호가 붙은 칸들)이면, 칸 하나하나를 required_items의 항목으로 빠짐없이 나열하고(예: ①~⑥이면 6개),
  칸 안의 구성(그림 칸 + 그 아래 "들어갈 말" 칸 등)은 그 요소의 description과 writing_guide에 적을 것. 같은 칸을 그림 칸과 글 칸으로 나눠 다른 항목으로 세지 말 것.
  양식 안에 적힌 영역 이름표("<내용>", "<들어갈 말>")는 칸의 구성 요소 이름이지 별도 항목이 아니다 — 항목은 번호 칸(①, ② …)과 양식 위쪽의 기입란(책 제목·제목·메시지 등)이다.
- 채점 기준표의 최고 점수 칸에 "(A, B, C …)를 모두 정확하게 서술함"처럼 내용 항목이 나열되어 있으면, 그 평가 요소에 해당하는 단계의
  required_items로 그 항목들을 빠짐없이 넣을 것(안내문 본문에 "작성하라"는 문장이 따로 없어도). 실험·관찰 단계의 채점 항목(예: 리트머스 색 변화, 전기 전도성)도 같다.
  보고서 단계가 실험 내용을 쓰는 것이면 실험 단계의 관찰 항목도 보고서의 writing_guide에 "보고서에 담을 관찰 결과: …"로 적을 것.
- 학생이 시험처럼 자료 없이 그 자리에서 써야 하는 단계("교과서 등 자료를 볼 수 없음", "개별 작성")면 writing_guide에 "시험장에서 외워 쓰는 글: 외워서 다시 쓸 수 있게 핵심 위주로 간결하게"라고 적을 것.
- required_items에는 "써야 할 내용 항목"만 넣을 것. 분량(120단어 이상 등)·어법 조건(수동태 사용 등)·밑줄 표시·사진 부착 여부 같은 채점 조건은
  항목이 아니다 — writing_guide에 적을 것.
- 채점 기준과 예시 답안을 구분할 것. 예시 답안(파란 글씨, 이미 채워진 예시 칸)은 "이런 형식으로 쓰라"는 견본이지 써야 할 내용이 아니다 —
  예시의 소재(발명품 이름 등)를 topic·requirements·description에 옮기지 말 것.
  예시 답안이 있으면 writing_guide에 단계마다 "예시 형식: 칸 이름들 / 예시 분량: 칸마다 약 N문장, 전체 약 N자(또는 N단어)"를 반드시 적을 것
  (예시에 "총 ( ) 단어"처럼 분량이 적혀 있으면 그 숫자를 쓰고, 없으면 대략 세어서).
- 활동 시간·수업 시간("약 25분 가량", "30분간 진행")은 분량이 아니다. target_length_text에는 글자수·단어수, 또는 발표·말하기의 시간("발표 시간 5분")만 넣을 것.
`.trim();

// 개수·시험지 조건과 수업 중 기록지 처리(FORM_REQUIREMENTS=off면 넣지 않는다). 개수는 뒤 단계에서 코드가 세므로 숫자를 그대로 적는 것이 핵심이다.
const FORM_REQUIREMENTS_INSTRUCTION = `
- 수업 중 다른 사람의 발표·활동을 듣거나 보면서 그 자리에서 적는 기록지(청중 기록지, 동료·상호 평가지, 듣기 활동지)는 학생이 미리 만들어 제출하는 결과물이 아니다.
  task_elements에 넣지 말 것(그것밖에 만들 결과물이 없는 과제만 예외). 안내문에 있으면 requirements에 "수업 중 직접 작성: 청중 기록지"처럼 한 줄로만 남길 것.
- 발표·말하기를 "대본 없이" 하라고 한 경우, 그 발표 자체는 학생이 말로 수행하는 것이라 task_elements에 넣지 말고 requirements에 "대본 없이 발표(시간 …)"로 남길 것. 발표 준비로 만드는 개요·스토리보드·발표 자료는 별도 단계로 둔다.
- "8장면", "5문장 이내", "10줄", "3문단"처럼 개수가 정해진 조건은 해당 단계의 description과 requirements에 숫자 그대로 적을 것(채점 기준표에만 있어도 옮길 것). 개수를 세어 바꾸거나 빼지 말 것.
- 그림 자료의 종류 제한("그림·그래프·표만 가능"), 제목 형식 조건("제목에는 명사형 키워드 1~2개"), 근거·출처 개수 조건은 안내문에 적힌 그대로 해당 결과물의 description이나 requirements에 남길 것. "만 가능"을 "활용할 수 있다"로 완화하거나 표현을 바꾸지 말 것.
`;
function systemInstruction(): string {
  return formRequirementsOn() ? `${BASE_SYSTEM_INSTRUCTION}
${FORM_REQUIREMENTS_INSTRUCTION.trim()}` : BASE_SYSTEM_INSTRUCTION;
}

const FLOWING_LABEL_PATTERN = /대본|발표문|연설|비평문|감상문|독후감|서평|편지|일기|소설|에세이|칼럼|소감/;

// required_items 후처리: 모델이 채운 값을 그대로 믿지 않고 코드가 정리한다 —
// 공백/중복 제거, 지나치게 긴 항목 제거(항목명이 아니라 문장이면 제외), 최대 10개,
// 2개 미만이면 "항목 나열 없음"으로 취급해서 통째로 버린다(항목 1개짜리 구조화는
// 의미가 없고 오히려 자유 서술을 해친다).
function normalizeRequiredItems(items: string[] | undefined): string[] | undefined {
  if (!items) return undefined;
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of items) {
    const item = raw.replace(/\s+/g, " ").trim();
    if (!item || item.length > 40) continue;
    const key = item.replace(/\s/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(item);
    // 칸 양식(①~⑥ + 제목·메시지 등)은 10개를 넘는다 — 실측: 카드뉴스 6칸 중 ⑥이 잘려 나갔다.
    if (cleaned.length >= 14) break;
  }
  return cleaned.length >= 2 ? cleaned : undefined;
}

// 말하기 산출물만 "N분"을 분량으로 본다(발표·대본·연설·낭독). 그 밖의 "25분 가량"은 활동 시간이다(실측: 고민 쓰기 목표가 6,750~8,250자가 됨).
const SPEECH_LABEL = /발표|대본|스피치|연설|말하기|낭독|구술|speech|presentation/i;

// 처음엔 모델에게 min/max 정수 두 개를 직접 계산해서 채우게 했는데, 실제
// 테스트 중 flashLite가 드물게 토큰 반복 루프에 빠져 정수 필드에 자릿수
// 수백~수천 개짜리 값을 뱉는 사고가 3~5회 테스트 중 2번 발생했다(JS Number로
// 파싱하면 Infinity가 되고, 심한 경우엔 JSON 구문 자체가 깨져서 요청이 통째로
// 실패했다). 그래서 모델에게는 안내문에 적힌 분량 표현을 "그대로 베끼기"만
// 시키고(target_length_text — 자유 텍스트라 아무리 길어도 파싱이 깨지지
// 않는다), 실제 숫자 범위 계산은 여기서 정규식으로 코드가 직접 한다 —
// 정수 계산을 모델에게 맡기지 않는 게 핵심 방어다.
export interface AnalyzeInput {
  /** base64 인코딩된 이미지 데이터 (data URL 접두사 제외) */
  imageBase64?: string;
  imageMimeType?: string;
  /** 안내문이 여러 장일 때 나머지 사진(채점 기준표·예시 답안지 등). 첫 장은 imageBase64. */
  extraImages?: { base64: string; mimeType: string }[];
  /** 이미지 대신 주제를 텍스트로 직접 입력한 경우 (F1) */
  topicText?: string;
  /** 이번 과제 한정 지침 (F2) */
  instructions?: string;
}

export async function analyzeAssignment(
  input: AnalyzeInput
): Promise<AnalyzeResult> {
  if (!input.imageBase64 && !input.topicText) {
    throw new Error("imageBase64 또는 topicText 중 하나는 반드시 있어야 합니다.");
  }

  const parts: LlmPart[] = [];

  if (input.imageBase64 && input.imageMimeType) {
    parts.push({ image: { base64: input.imageBase64, mimeType: input.imageMimeType } });
  }
  for (const img of (input.extraImages ?? []).slice(0, 3)) parts.push({ image: { base64: img.base64, mimeType: img.mimeType } });

  const userTextLines = [
    input.topicText ? `[학생이 입력한 주제]\n${input.topicText}` : null,
    input.instructions ? `[이번 과제 한정 지침]\n${input.instructions}` : null,
    !input.imageBase64 && !input.topicText ? null : "위 내용을 분석해서 JSON으로 응답해줘.",
  ].filter(Boolean);
  parts.push({ text: userTextLines.join("\n\n") });

  const runAnalyze = () =>
    generate({
      label: "analyze",
      role: "analyze",
      prompt: parts,
      system: systemInstruction(),
      schema: ANALYZE_SCHEMA,
      ...(process.env.ANALYZE_EFFORT ? { effort: process.env.ANALYZE_EFFORT as "minimal" | "low" | "medium" } : {}),
    });
  let response = await runAnalyze();
  // 실측(같은 안내문 4회 분석 중 1회): 항목 나열이 통째로 8~9개의 별개 "단계"로 쪼개지는 오분석. 이런 모양(5개 이상, 항목 나열 없음)이면 한 번만 다시 분석하고 단계가 더 적은 쪽을 쓴다.
  try {
    const first = JSON.parse(response.text || "{}") as { core_task_info?: { task_elements?: { required_items?: string[] }[] } };
    const els = first.core_task_info?.task_elements ?? [];
    if (els.length >= 5 && els.every((e) => (e.required_items?.length ?? 0) < 2)) {
      console.warn(`[analyzeAssignment] 단계가 ${els.length}개로 쪼개진 것으로 의심되어 한 번 더 분석함`);
      const second = await runAnalyze();
      const n2 = (JSON.parse(second.text || "{}") as typeof first).core_task_info?.task_elements?.length ?? Infinity;
      if (n2 < els.length) response = second;
    }
  } catch {
    // 재분석은 보조 수단 — 실패해도 첫 결과를 그대로 쓴다
  }

  const raw = response.text;
  if (!raw) {
    throw new Error("Gemini 분석 응답이 비어 있습니다.");
  }
  if (process.env.LOG_PROMPTS === "1") console.log("[analyzeAssignment] raw response:\n" + raw);

  interface RawTaskElement {
    type: "text_submission" | "external_production";
    label: string;
    description: string;
    target_length_text?: string;
    target_length_counts_spaces?: boolean;
    required_items?: string[];
    items_format?: "sections" | "flowing";
  }
  const parsed = JSON.parse(raw) as Omit<AnalyzeResult, "core_task_info"> & {
    insufficient_reason: string;
    core_task_info: Omit<AnalyzeResult["core_task_info"], "task_elements"> & {
      task_elements: RawTaskElement[];
    };
  };

  // 스키마는 min/max/counts_spaces를 평평한 필드로 받는다(Gemini 구조화
  // 출력은 중첩 optional보다 이런 형태가 더 안정적으로 채워짐) — 둘 다 0이면
  // "분량 제약 없음"이므로 target_length 자체를 생략해서, generate-essay.ts가
  // 이 필드의 존재 여부만으로 검사 대상인지 바로 판단할 수 있게 한다.
  const fixes = qualityFixesOn();
  const guideExtras: string[] = [];
  const task_elements_raw = parsed.core_task_info.task_elements.map((e) => {
    const { target_length_text, target_length_counts_spaces, required_items, items_format, ...rest } = e;
    const speech = !fixes || SPEECH_LABEL.test(`${e.label} ${e.description} ${target_length_text ?? ""}`);
    const range = target_length_text ? parseLengthConstraint(target_length_text, { english: /영어|English/i.test(`${parsed.subject} ${e.label}`), minutesAllowed: speech }) : null;
    // 채점 조건(분량·어법·밑줄·사진 부착)은 써야 할 내용 항목이 아니다 — writing_guide로 옮긴다(analysis-items.ts).
    const split = fixes ? splitAnalysisItems(required_items) : null;
    if (split && (split.conditions.length || split.visuals.length)) {
      guideExtras.push(
        `"${e.label}" 채점 조건: ${[...split.conditions, ...split.visuals.map((v) => `${v}(사진·그림은 학생이 직접 준비 — 글로 "제시함" 등을 쓰지 말 것)`)].join(" / ")}`
      );
    }
    const items = normalizeRequiredItems(split ? split.content : required_items);
    // 모델이 분류한 items_format을 그대로 믿지 않는다 — 실제 테스트에서 "영어 발표
    // 대본"·"독서 비평문"이 sections로 분류돼 말하는 대본/한 편의 비평문이 "### 항목"
    // 소제목으로 쪼개졌다. 한 편의 글로 이어 읽히는 산출물(라벨 기준)은 코드가
    // flowing으로 강제한다(항목은 빠짐없이 다루되 소제목은 강제하지 않음).
    const forcedFlowing = FLOWING_LABEL_PATTERN.test(e.label);
    return {
      ...rest,
      target_length: range ? { ...range, counts_spaces: target_length_counts_spaces ?? true } : undefined,
      _lengthText: target_length_text || undefined,
      required_items: items,
      items_format: items
        ? items_format === "sections" && !forcedFlowing
          ? ("sections" as const)
          : ("flowing" as const)
        : undefined,
    };
  });

  const distributed = distributeSharedLength(task_elements_raw).map((e) => forceTextSubmissionIfNoExternalHint(e, parsed.core_task_info.topic));
  // 수업 중 작성하는 기록지는 만들 결과물에서 빼고, 왜 없는지 학생이 볼 수 있게 요구사항에 한 줄 남긴다.
  const { kept: task_elements, dropped: droppedSheets } = formRequirementsOn() ? dropNonSubmissionActivities(distributed, [...parsed.core_task_info.requirements, parsed.core_task_info.writing_guide ?? "", parsed.administrative_info?.other_notes ?? ""]) : { kept: distributed, dropped: [] };
  if (droppedSheets.length > 0) console.warn(`[analyzeAssignment] 수업 중 작성 기록지·대본 없는 발표는 만들 결과물에서 제외: ${droppedSheets.map((d) => d.label).join(", ")}`);

  // 최종 안전장치: 프롬프트로 "빈 문자열 금지"를 지시해도(위 스키마 설명 참고)
  // 실제로 빈 문자열이 돌아올 수 있다는 게 이 프로젝트에서 반복 확인된
  // 패턴이다. subject는 다른 행정정보 필드와 달리 뒤에서 essay/plan
  // 생성 라우트가 "필수값 없음"으로 보고 요청 자체를 거부해버리는 값이라
  // (10종 수행평가 교차 테스트에서 실제로 신조어/앱 기획/포스터 3건이
  // 이렇게 생성 실패했다), 빈 문자열로 남기지 않고 코드가 결정론적으로
  // 채워 넣는다.
  const subject =
    fallbackSubject(
      normalizeSubject(parsed.subject),
      parsed.core_task_info.topic,
      ...parsed.core_task_info.requirements,
      ...task_elements.flatMap((e) => [e.label, e.description])
    ) || "과제";
  if (!parsed.subject.trim()) {
    // topic(학생 입력이 섞인 텍스트)은 기본 로그에 남기지 않는다 — 필요하면 LOG_PROMPTS=1로 별도 확인.
    console.warn("[analyzeAssignment] 최종 안전장치: 모델이 과목을 못 채워서 기본값으로 대체함");
    if (process.env.LOG_PROMPTS === "1") console.warn(`  topic="${parsed.core_task_info.topic}"`);
  }

  const writingGuide = fixes ? [parsed.core_task_info.writing_guide?.trim(), ...guideExtras].filter(Boolean).join("\n").slice(0, 1500) : "";
  const { writing_guide: _rawGuide, ...coreRest } = parsed.core_task_info;
  void _rawGuide;

  return {
    ...parsed,
    subject,
    core_task_info: { ...coreRest, requirements: [...coreRest.requirements, ...droppedSheets.map((d) => dropNote(d))], task_elements, ...(writingGuide ? { writing_guide: writingGuide } : {}) },
    insufficient_reason: parsed.insufficient_reason || null,
  };
}
