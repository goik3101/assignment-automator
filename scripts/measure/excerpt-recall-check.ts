// "기억으로 쓴 책 구절"이 실제 페이지에 있는 문장인지 확인한다(검색 도구 없이 한 번 쓰게 한 뒤, 같은 문장을 검증기에 넣는다) — 건당 약 $0.05.
// 왜: 사용자가 "ChatGPT는 구절을 잘 찾아 주는데 우리는 못 찾는다"고 했다. 그 차이가 검색 능력이 아니라 **기억에서 꺼낸 문장**이면, 그럴듯해도 책의 글자와 다를 수 있다.
// ChatGPT 자체를 재는 것이 아니라 같은 계열 모델을 "검색 없이" 쓰게 한 대리 실험이다.
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/excerpt-recall-check.ts "콰이어트=수전 케인" ...
import path from "node:path";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));
process.env.SOURCE_STATS_LOG = "off";
const { generate, withLlmTrace } = await import("@/lib/llm");
const { verifyExcerpt } = await import("@/lib/verification/excerpt-verification");

for (const k of ["log", "warn"] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => { const l = a.map(String).join(" "); if (!l.startsWith("[verifyExcerpt]") && !l.startsWith("[llm]") && !l.startsWith("[script-ledger]")) orig(...a); };
}
const norm = (s: string) => s.replace(/[^가-힣A-Za-z0-9]/g, "");

for (const arg of process.argv.slice(2)) {
  const [name, attribution] = arg.split("=");
  await withLlmTrace(`recall:${name}`, async () => {
    const r = await generate({
      label: "recall",
      role: "main",
      effort: "low",
      prompt: `${attribution}의 『${name}』 한국어판에서 인상 깊은 구절 한 문장을 **원문 그대로** 따옴표 없이 한 줄로만 써 줘. 정확히 기억나지 않으면 "모름"이라고만 써.`,
    });
    const candidate = (r.text ?? "").trim().split("\n")[0].replace(/^["“'‘]|["”'’]$/g, "");
    if (!candidate || /^모름/.test(candidate)) { process.stdout.write(`\n■ ${name}: 기억으로는 "모름"이라고 답함\n`); return; }
    const v = await verifyExcerpt({ name, attribution, excerptCandidate: candidate }, undefined, 0);
    const same = v.verified && v.confirmedExcerpt ? norm(v.confirmedExcerpt).includes(norm(candidate)) || norm(candidate).includes(norm(v.confirmedExcerpt)) : false;
    process.stdout.write(`\n■ ${name}\n   기억으로 쓴 문장: ${candidate}\n   검증기 결과: ${v.verified ? "페이지에서 확인됨" : "확인 못 함"}${v.verified ? ` · 확인된 문장: ${v.confirmedExcerpt}` : ""}\n   기억 문장 = 페이지 문장 ? ${same ? "같음" : v.verified ? "**다름**(기억과 실제 글자가 다르다)" : "페이지에서 못 찾음"}\n`);
  });
}
