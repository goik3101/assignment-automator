// 책 구절 검증(verifyExcerpt)이 어디서 막히는지 책별로 본다 — 검색 호출이 있어 건당 약 $0.04~0.10.
// 왜: 사용자가 "ChatGPT는 구절을 잘 찾아 주는데 우리는 못 찾는다"고 했다. 막히는 이유를 추측하지 않고, 검색된 사이트·거절 사유·최종 판정을 책마다 찍는다.
// 사용: [OPENAI_SEARCH_CONTEXT_SIZE=high] node --import ./scripts/measure/loader/register.mjs scripts/measure/excerpt-diagnose.ts "콰이어트=수전 케인" "완득이=김려령"
import path from "node:path";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));
process.env.SOURCE_STATS_LOG = "off";
const { verifyExcerpt } = await import("@/lib/verification/excerpt-verification");
const { withLlmTrace } = await import("@/lib/llm");
const { summarizeTrace } = await import("@/lib/llm/usage");

const keep: string[] = [];
for (const k of ["log", "warn"] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => {
    const line = a.map(String).join(" ");
    if (line.startsWith("[verifyExcerpt]")) keep.push(line);
    else if (!line.startsWith("[llm]")) orig(...a);
  };
}

for (const arg of process.argv.slice(2)) {
  const [name, attribution] = arg.split("=");
  keep.length = 0;
  const t0 = Date.now();
  const { r, usage } = await withLlmTrace(`diag:${name}`, async (trace) => {
    const r = await verifyExcerpt({ name, attribution }, undefined, 0);
    return { r, usage: summarizeTrace(trace) };
  });
  process.stdout.write(`\n■ ${name} (${attribution}) — ${r.verified ? "검증됨" : "검증 못 함"} · ${((Date.now() - t0) / 1000).toFixed(1)}초 · $${usage.estimatedCostUsd.toFixed(3)} · 검색 ${usage.searchCalls}회 · 컨텍스트 ${process.env.OPENAI_SEARCH_CONTEXT_SIZE ?? "low"}\n`);
  if (r.verified) process.stdout.write(`   구절: ${r.confirmedExcerpt}\n   출처: ${r.source?.title} <${r.source?.url}>\n`);
  for (const l of keep) process.stdout.write(`   ${l.slice(0, 520)}\n`);
}
