// 영어 사전: 영역별 파일(en/*.ts)을 하나로 합친다. 새 영역을 추가하면 여기에 import만 더한다.
import { common } from "./en/common.ts";
import { shell } from "./en/shell.ts";
import { home } from "./en/home.ts";
import { results } from "./en/results.ts";
import { learning } from "./en/learning.ts";
export const EN: Record<string, string> = { ...common, ...shell, ...home, ...results, ...learning };
