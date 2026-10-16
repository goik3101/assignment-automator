// "새 창작물" 모달은 홈 화면(AssignmentFlow)에 붙어 있다. 사이드바 등 어디서든 이 함수로 연다 —
// 이미 홈이면 이벤트로 바로, 다른 화면이면 홈으로 이동한 뒤 열리게 표시만 남긴다.
const EVENT = "studed:open-new-creation";
const FLAG = "studed-open-new";

export function openNewCreation(navigate: (href: string) => void, onHome: boolean) {
  if (onHome) {
    window.dispatchEvent(new Event(EVENT));
    return;
  }
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {
    // 저장소를 못 쓰면 홈으로만 이동한다.
  }
  navigate("/");
}

/** 홈 마운트 시 한 번 호출: 다른 화면에서 "새 창작물"을 눌러 넘어왔으면 true. */
export function consumeOpenNewFlag(): boolean {
  try {
    if (sessionStorage.getItem(FLAG) === "1") {
      sessionStorage.removeItem(FLAG);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function onOpenNewCreation(handler: () => void) {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
