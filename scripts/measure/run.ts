// 근거 다양성 A/B 측정: 고정된 분석 결과로 완성 원고만 반복 생성한다(분석은 돌리지 않는다).
// 사용: node --import ./scripts/measure/loader/register.mjs scratchpad/measure/run.ts <off|on> <반복횟수> [태그]
// 모델·검색 호출이 실제로 일어나므로 비용이 든다. 결과·로그는 scratchpad/measure/out/에 남긴다(저장소에 커밋하지 않는다).
import fs from "node:fs";
import path from "node:path";
import { CORE_TASK_INFO, INSTRUCTIONS, SUBJECT } from "./fixture.ts";

const REPO = process.cwd();
const OUT = path.join(REPO, "scratchpad", "measure", "out");

const arm = (process.argv[2] ?? "on") as "off" | "on";
const times = Number(process.argv[3] ?? 1);
const tag = process.argv[4] ?? new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

process.loadEnvFile(path.join(REPO, ".env.local"));
// 링크 확인 통계(source_validations)에 테스트 기록을 남기지 않는다(CLAUDE.md).
process.env.SOURCE_STATS_LOG = "off";
// 이번 비교에서 켜고 끌 스위치 이름(기본: 근거 슬롯). 나머지 스위치는 .env.local·기본값 그대로 둔다.
const FLAG = process.env.MEASURE_FLAG ?? "ESSAY_EVIDENCE_SLOTS";
if (arm === "off") process.env[FLAG] = "off";
else delete process.env[FLAG];

const { generateEssay } = await import("@/lib/gemini/generate-essay");
const { withLlmTrace } = await import("@/lib/llm");
const { summarizeTrace } = await import("@/lib/llm/usage");

fs.mkdirSync(OUT, { recursive: true });

/** console 출력을 가로채 파일로도 남긴다(생성 경로의 진단 로그가 측정의 근거다). */
function captureConsole(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  const tee = (level: string, fn: (...a: unknown[]) => void) => (...args: unknown[]) => {
    logs.push(`[${level}] ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`);
    fn(...args);
  };
  console.log = tee("log", orig.log);
  console.warn = tee("warn", orig.warn);
  console.error = tee("error", orig.error);
  return { logs, restore: () => Object.assign(console, orig) };
}

for (let i = 1; i <= times; i++) {
  const id = `${tag}-${arm}-${i}`;
  const cap = captureConsole();
  const t0 = Date.now();
  try {
    const { result, usage } = await withLlmTrace(id, async (trace) => {
      const r = await generateEssay({ subject: SUBJECT, coreTaskInfo: CORE_TASK_INFO, instructions: INSTRUCTIONS });
      return { result: r, usage: summarizeTrace(trace) };
    });
    cap.restore();
    const record = {
      id,
      arm,
      flag: `${FLAG}=${process.env[FLAG] ?? "(기본 켜짐)"}`,
      wallMs: Date.now() - t0,
      usage,
      result,
      logs: cap.logs,
    };
    fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(record, null, 2), "utf8");
    if (result.type === "essay") {
      fs.writeFileSync(path.join(OUT, `${id}.md`), result.markdown, "utf8");
      console.log(
        `[측정] ${id}: ${((Date.now() - t0) / 1000).toFixed(1)}초 · 출처 ${result.sources.length}개 · $${usage.estimatedCostUsd.toFixed(4)} · 검색 ${usage.searchCalls}회`
      );
    } else {
      console.log(`[측정] ${id}: 생성 실패(${result.reason})`);
    }
  } catch (err) {
    cap.restore();
    console.error(`[측정] ${id} 실패`, err);
    fs.writeFileSync(path.join(OUT, `${id}.error.txt`), String(err) + "\n\n" + cap.logs.join("\n"), "utf8");
  }
}
