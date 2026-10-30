// "@/…" → <저장소>/src/…, 확장자 없는 상대 import → .ts/.tsx/index.ts 로 풀어 준다.
// 저장소 위치는 이 파일 위치(scripts/qa/loader)에서 계산하므로 워크트리·다른 PC에서도 그대로 동작한다.
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SRC = path.join(REPO_ROOT, "src");

function tryFile(p) {
  for (const c of [p, p + ".ts", p + ".tsx", path.join(p, "index.ts")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  let base = null;
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    base = path.join(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (base) {
    const f = tryFile(base);
    if (f) return next(pathToFileURL(f).href, context);
  }
  return next(specifier, context);
}
