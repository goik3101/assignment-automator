// AI 튜터 화면에서 대화가 만들어지거나 새 답이 저장되면, 사이드바의 대화 목록이 다시 읽도록 알린다.
const EVENT = "studed:tutor-updated";

export function notifyTutorUpdated() {
  window.dispatchEvent(new Event(EVENT));
}

export function onTutorUpdated(handler: () => void) {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
