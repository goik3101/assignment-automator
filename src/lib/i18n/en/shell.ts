// shell 영역 영어 사전 (키 = 화면에 보이는 한국어 원문 그대로).
export const shell: Record<string, string> = {
  // 사이드바
  "studed 홈": "studed home",
  "메뉴 닫기": "Close menu",
  "메뉴 열기": "Open menu",
  "사이드바 펼치기": "Expand sidebar",
  "사이드바 접기": "Collapse sidebar",
  "주 메뉴": "Main menu",
  "내 창작물 관리": "My creations",
  "히스토리": "History",
  "관리자 대시보드": "Admin dashboard",
  "작업 목록": "Recent work",
  "학습 모드": "Study mode",
  "AI 모드": "AI mode",
  "창작·작성형": "Writing",
  "자료조사·분석형": "Research & analysis",
  "암기·정답형": "Memorization & quiz",
  "복합형": "Mixed",
  "휴지통": "Trash",
  "피드백/문의": "Feedback",
  "테마 변경": "Change theme",
  "설정": "Settings",

  // 로그인 영역
  "전송에 실패했어요. 이메일 주소를 확인해 주세요.": "Couldn't send it. Please check your email address.",
  "관리자": "Admin",
  "사용자": "User",
  "로그아웃": "Sign out",
  "{email}로 로그인 링크를 보냈어요. 메일함을 확인해 주세요.": "We sent a sign-in link to {email}. Check your inbox.",
  "로그인하면 작업이 저장돼요": "Sign in to save your work",
  "이메일 주소": "Email address",
  "보내는 중...": "Sending...",
  "로그인 링크 받기": "Get sign-in link",

  // 테마
  "화면 테마": "Theme",
  "다크 모드": "Dark mode",
  "라이트 모드": "Light mode",
  "라이트 모드로 전환": "Switch to light mode",
  "다크 모드로 전환": "Switch to dark mode",

  // 푸터·공지·체크리스트
  "베타 버전이에요. 이상한 결과를 발견하면 알려 주세요.": "This is a beta. If you spot odd results, please let us know.",
  "공지": "Notice",
  "안내문 업로드 또는 주제 입력": "Upload a brief or enter a topic",
  "지침 작성 (선택)": "Add instructions (optional)",
  "분석하기": "Analyze",
  "시작하기 {done}/3": "Getting started {done}/3",

  // 삭제
  "정말 삭제하시겠습니까? 삭제하면 되돌릴 수 없어요.": "Delete this? This can't be undone.",
  "삭제에 실패했습니다.": "Couldn't delete it.",
  "삭제 중 오류가 발생했습니다.": "Something went wrong while deleting.",
  "히스토리 삭제": "Delete from history",
  "삭제": "Delete",

  // 공통 UI
  "닫기": "Close",
  "다시 시도": "Try again",
  "다시 만들기": "Regenerate",
  "방금 만들었어요": "Just created",
  "{time}에 만든 내용이에요": "Created {time}",

  // 설정 탭
  "일반 설정": "General",
  "계정": "Account",
  "개인화 설정": "Personalization",
  "AI 설정": "AI",

  // 설정: 일반
  "문의·피드백": "Feedback",
  "불편한 점이나 제안해주실 내용을 적어주세요": "Tell us what's frustrating or what you'd suggest",
  "제출": "Submit",
  "전달했어요. 감사합니다!": "Sent. Thank you!",
  "이용약관 · 개인정보처리방침 (준비 중)": "Terms of Service · Privacy Policy (coming soon)",

  // 설정: 계정
  "로그인 전": "Not signed in",
  "왼쪽 아래에서 이메일로 로그인할 수 있어요.": "You can sign in with your email at the bottom left.",
  "계정 정보": "Account details",
  "관리자 (예약 계정)": "Admin (reserved account)",
  "코드로 로그인하기": "Sign in with a code",
  "계정 탈퇴": "Delete account",
  "탈퇴하면 히스토리를 포함한 모든 개인 데이터가 삭제되며 되돌릴 수 없습니다.": "Deleting your account removes all your personal data, including History, and can't be undone.",
  "삭제 중...": "Deleting...",
  "정말 삭제할게요": "Yes, delete it",
  "취소": "Cancel",

  // 설정: 개인화
  "개인화 정보 설정은 로그인 후 이용할 수 있어요.": "Personalization is available after you sign in.",
  "개인화 정보 (선택)": "Personalization (optional)",
  "결과물에 자연스럽게 녹아들어요. 학교명은 받지 않습니다.": "It's woven naturally into your results. We don't collect your school name.",
  "관심사·경험": "Interests and experiences",
  "예: 축구를 좋아함, 반려동물을 키움": "e.g. Loves soccer, has a pet",
  "교과서 출판사": "Textbook publisher",
  "예: 미래엔, 천재교육": "e.g. Mirae-N, Chunjae Education",
  "학교 유형": "School type",
  "선택 안 함": "Not specified",
  "일반고": "General high school",
  "특성화고": "Vocational high school",
  "특목고": "Specialized high school",
  "자율고": "Autonomous high school",
  "기타": "Other",
  "저장 중...": "Saving...",
  "저장됨": "Saved",
  "저장": "Save",

  // 설정: AI
  "만드는 방식": "How to create",
  "AI가 결과물을 만들기 전에 몇 가지를 물어볼 수 있어요. 질문은 결과물에 실제로 영향을 주는 것만 하고, 필요 없으면 묻지 않아요.":
    "The AI may ask a few questions before creating your result. It only asks things that really affect the result, and skips them if they're not needed.",
  "빠르게 만들기": "Quick",
  "꼭 필요한 질문만(최대 2개) 하고 바로 만들어요.": "Asks only what's essential (up to 2 questions), then makes it right away.",
  "나에게 맞추기": "Personalized",
  "내 선택과 경험을 더 물어보고(최대 4개) 나에게 맞춰 만들어요.": "Asks more about your choices and experiences (up to 4 questions) and tailors it to you.",
  "기본값이에요.": "This is the default.",
  "AI 사용 안내": "AI usage limits",
  "· 완성 원고·실행 계획 만들기: 로그인 시 하루 2회": "· Creating drafts and action plans: 2 per day when signed in",
  "· 결과 수정 요청(다시 만들기): 하루 1회": "· Revision requests (regenerate): 1 per day",
  "· 학습 모드(자료 조사 + 피드백): 하루 5회": "· Study mode (research + feedback): 5 per day",
  "· 요약·플래시카드·퀴즈·가상 시험·AI 채팅: 종류별로 하루 횟수 제한이 있어요":
    "· Summary, flashcards, quiz, mock exam, AI chat: each has its own daily limit",
};
