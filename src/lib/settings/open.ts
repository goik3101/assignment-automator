export type SettingsTab = "general" | "account" | "personal" | "ai" | "feedback";

const EVENT = "studed:open-settings";

// 설정 모달은 레이아웃에 한 번만 붙어 있고, 어느 화면에서든 이 이벤트로 연다.
export function openSettings(tab: SettingsTab = "general") {
  window.dispatchEvent(new CustomEvent<SettingsTab>(EVENT, { detail: tab }));
}

export function onOpenSettings(handler: (tab: SettingsTab) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<SettingsTab>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
