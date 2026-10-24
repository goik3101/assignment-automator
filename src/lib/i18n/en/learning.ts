// learning 영역 영어 사전 (키 = 화면에 보이는 한국어 원문 그대로).
export const learning: Record<string, string> = {
  // 항목 상태 (STATUS_LABEL)
  "시작 전": "Not started",
  "자료 조사 중": "Researching",
  "작성 중": "Writing",
  "피드백 받음": "Feedback received",
  "수정 중": "Revising",
  "완료": "Done",

  // 출처 신뢰도 등급 (SOURCE_TIER_LABEL)
  "공식·공공·학술": "Official / public / academic",
  "신뢰 매체": "Trusted media",
  "백과·위키": "Encyclopedia / wiki",
  "일반 사이트": "General site",
  "블로그·개인": "Blog / personal",

  // 피드백 패널
  "AI 피드백": "AI feedback",
  "완료해도 좋아요": "Ready to mark as done",
  "조금 더 다듬어봐요": "Needs a bit more polish",
  "질문에 대한 답": "Answer to your question",
  "잘 쓴 부분": "What you did well",
  "빠진 내용": "Missing content",
  "사실관계 확인": "Fact check",
  "과제 요구사항 충족": "Assignment requirements",
  "충족": "Met",
  "미충족": "Not met",
  "문장·문법": "Sentences & grammar",
  "다음에 할 일": "Next steps",
  "힌트:": "Hint:",

  // 대상 정하기
  "다룰 인물/대상 정하기": "Choose a person/subject to cover",
  "이 과제는 다룰 대상을 직접 정해야 해요. 정한 대상을 기준으로 자료를 조사해 드려요.":
    "You need to choose the subject for this assignment. We'll research material based on your choice.",
  "AI 추천": "AI suggestions",
  "직접 선택하기": "Choose myself",
  "이 과제는 {type}을(를) 고르는 과제예요": "This assignment asks you to choose: {type}",
  "조건:": "Conditions:",
  "후보를 찾고 있어요...": "Finding candidates...",
  "후보 3개 추천받기": "Get 3 suggestions",
  "다시 찾는 중...": "Searching again...",
  "다른 후보 보기": "See other candidates",
  "인물/대상 이름": "Name of person/subject",
  "예: 앙리 뒤낭": "e.g. Henry Dunant",
  "정하기": "Confirm",
  "대상을 직접 정해서 입력해 주세요.": "Please enter a subject yourself.",
  "정해진 대상이 없는 과제예요 (건너뛰기)": "This assignment has no set subject (skip)",
  "안내문에서 어떤 대상을 고르라는 건지 확인되지 않아요.": "We couldn't tell from the brief what subject to choose.",

  // 워크스페이스
  "불러오는 중...": "Loading...",
  "학습 모드는 로그인 후에 이용할 수 있어요. 왼쪽 아래에서 로그인해주세요.":
    "Study mode is available after logging in. Please log in from the bottom left.",
  "내 창작물로": "Back to my creations",
  "학습 과제를 불러오는 중...": "Loading study assignment...",
  "다루는 대상:": "Subject:",
  "변경": "Change",
  "자료 조사와 피드백을 합쳐 하루에 쓸 수 있는 횟수": "Daily limit for research and feedback combined",
  "AI 사용 무제한(관리자)": "Unlimited AI use (admin)",
  "오늘 AI {used}/{limit}회 사용": "AI used today: {used}/{limit}",
  "작성 화면으로": "Back to writing",
  "내가 쓴 내용 모아보기": "View everything I wrote",

  // 자료 조사 카드
  "자료 조사": "Research",
  "과제에서 작성할 항목 {n}개에 필요한 자료를 한 번에 조사해서 항목별로 나눠 보여드려요.":
    "We'll research material for all {n} items in this assignment at once and split it up by item.",
  "자료를 읽고 답변은 직접 작성하게 돼요.": "You read the material and write the answers yourself.",
  "AI 사용 횟수를 1회 써요. 조사에 실패하면 차감되지 않아요.": "Uses 1 AI request. It isn't counted if the research fails.",
  "자료를 조사하고 있어요... (최대 1분)": "Researching... (up to 1 min)",
  "다시 조사하기": "Research again",
  "자료 조사 시작": "Start research",
  "오늘 사용할 수 있는 횟수를 모두 썼어요.": "You've used all of today's requests.",
  "자료 없이 바로 작성을 시작해도 돼요. 아래 항목별 칸에 써 내려가면 자동으로 저장돼요.":
    "You can start writing without any material. Write in each item's box below; it saves automatically.",

  // 모아보기
  "내가 쓴 내용": "What I wrote",
  "전체 복사": "Copy all",
  "복사했어요.": "Copied.",

  // 항목 편집
  "작성 항목": "Items to write",
  "{done}/{total} 항목 완료": "{done}/{total} items done",
  "모든 항목을 완료했어요. 위의 “내가 쓴 내용 모아보기”에서 한 번에 확인하고 복사할 수 있어요.":
    "All items are done. Use “View everything I wrote” above to review and copy it all at once.",
  "완료됨": "Done",
  "이 항목 완료": "Mark item done",
  "자료": "Material",
  "작성": "Write",
  "조사 자료": "Research material",
  "자료 읽기": "Read the material",
  "출처": "Sources",
  "“연결 확인됨”은 주소가 열린다는 뜻일 뿐, 그 페이지가 내용을 뒷받침한다는 뜻은 아니에요.":
    "“Link verified” only means the address opens, not that the page supports the content.",
  "중요한 사실은 링크를 열어 직접 확인하세요.": "Open the link and check important facts yourself.",
  "(없는 페이지)": "(page not found)",
  "(연결 확인됨)": "(link verified)",
  "(자동 확인 불가 — 직접 열어 보세요)": "(can't be checked automatically — open it yourself)",
  "이 항목의 자료는 찾지 못했어요. 과제 안내문과 다른 항목의 자료를 참고해서 써보세요.":
    "We couldn't find material for this item. Try using the assignment brief and the material for other items.",
  "아직 자료를 조사하지 않았어요. 위에서 “자료 조사 시작”을 누르면 이 항목의 자료가 여기 나타나요.":
    "You haven't researched yet. Press “Start research” above and the material for this item will appear here.",
  "내 답변": "My answer",
  "저장 중...": "Saving...",
  "저장됨": "Saved",
  "저장 대기 중...": "Waiting to save...",
  "저장 실패 · 다시 저장": "Save failed · Save again",
  "자료를 읽고 내 말로 직접 써보세요. 쓰는 대로 자동 저장돼요.": "Read the material and write in your own words. It saves automatically as you type.",
  "{n} / {max}자": "{n} / {max} characters",
  "완료한 항목이에요. 고치면 “수정 중”으로 바뀌어요.": "This item is done. If you edit it, it changes to “Revising”.",
  "표현·문법이 궁금하면 질문을 적어주세요 (피드백과 함께 답해요)":
    "Ask about wording or grammar if you're unsure (answered along with the feedback)",
  "예: 이 문장에서 ‘which’를 써도 되나요?": "e.g. Can I use ‘which’ in this sentence?",
  "살펴보는 중...": "Reviewing...",
  "AI 피드백 받기": "Get AI feedback",
  "질문 닫기": "Close question",
  "표현/문법 질문하기": "Ask about wording/grammar",
  "10자 이상 직접 쓰면 피드백을 받을 수 있어요.": "Write at least 10 characters to get feedback.",
  "10자 이상 직접 쓰면 항목마다 피드백을 받을 수 있어요.": "Write at least 10 characters in an item to get feedback on it.",
  "오늘 사용할 수 있는 AI 횟수를 모두 썼어요. 작성한 내용은 그대로 저장돼요.":
    "You've used all of today's AI requests. What you wrote is still saved.",
  "이전 항목": "Previous item",
  "다음 항목": "Next item",

  // 오류 메시지 (클라이언트에서 만든 것)
  "저장하지 못했어요.": "Couldn't save.",
  "추천을 불러오지 못했어요.": "Couldn't load suggestions.",
  "불러오지 못했어요.": "Couldn't load.",
  "자료를 조사하지 못했어요.": "Couldn't research the material.",
  "작성한 내용을 먼저 저장하지 못했어요. 잠시 후 다시 시도해주세요.": "Couldn't save what you wrote first. Please try again in a moment.",
  "작성한 내용을 먼저 저장하지 못했어요.": "Couldn't save what you wrote first.",
  "피드백을 받지 못했어요.": "Couldn't get feedback.",
  "완료 처리하지 못했어요.": "Couldn't mark it as done.",
  "네트워크 연결을 확인해주세요.": "Please check your network connection.",
  "요청에 실패했어요.": "The request failed.",
};
