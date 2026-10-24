import { AsyncLocalStorage } from "node:async_hooks";
import type { CoreTaskInfo } from "../../types/task.ts";

// 생성 요청 1건의 결과물 언어(화면 언어를 따른다 — 설정 > 화면 언어가 English면 원고·계획도 영어). 라우트가 withOutputLang으로 감싼다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.
export type OutputLang = "ko" | "en";

const storage = new AsyncLocalStorage<OutputLang>();

export function withOutputLang<T>(lang: OutputLang, fn: () => Promise<T>): Promise<T> {
  return storage.run(lang, fn);
}

export function currentOutputLang(): OutputLang {
  return process.env.OUTPUT_LANG_FOLLOW_UI === "off" ? "ko" : (storage.getStore() ?? "ko");
}

/** 같은 내용을 영어로 쓰면 글자 수가 한국어의 약 2.5배가 된다 — 안내문의 글자 수 기준(한국어)을 영어 글에 맞게 늘린다. 단어 수 기준은 그대로. */
export const ENGLISH_CHAR_RATIO = 2.5;

export function scaleLengthsForEnglish(info: CoreTaskInfo): CoreTaskInfo {
  return {
    ...info,
    task_elements: info.task_elements.map((el) =>
      el.target_length && (el.target_length.unit ?? "chars") === "chars"
        ? {
            ...el,
            target_length: {
              ...el.target_length,
              min: Math.round(el.target_length.min * ENGLISH_CHAR_RATIO),
              max: el.target_length.max > 0 ? Math.round(el.target_length.max * ENGLISH_CHAR_RATIO) : el.target_length.max,
              counts_spaces: true,
            },
          }
        : el
    ),
  };
}
