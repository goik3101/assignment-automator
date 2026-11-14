// 비용 0: 저장된 결과물(out/gc-*.md)의 **구조 이상**을 전수로 센다. 사람이 읽기 전에 어디부터 볼지 정하려는 것.
//   중복 소제목(같은 소제목이 두 번) · 소제목 아래 본문이 한 줄에 이어 붙음 · 참고문헌이 둘 이상 · 프롬프트 표기 누출(『『·(저자:) ·
//   거절문·말 거는 문장 · 우리 작업 용어(AI·프롬프트·조사 노트) · 남은 대괄호 표시 · 문장 중간 끊김(마침표 없이 끝나는 문단)
// 사용: node scripts/measure/structure-audit.ts   (node 24 타입 제거로 바로 실행)
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "scratchpad", "measure", "out");
const files = fs.readdirSync(dir).filter((f) => /^gc-.*\.md$/.test(f)).sort();
const flag: Record<string, string[]> = {};
const add = (id: string, msg: string) => (flag[id] ??= []).push(msg);

for (const f of files) {
  const id = f.replace(/^gc-/, "").replace(/\.md$/, "");
  const body = fs.readFileSync(path.join(dir, f), "utf8").replace(/\n## 출처[\s\S]*$/, "");
  const lines = body.split("\n");
  const heads = lines.filter((l) => /^#{2,4}\s/.test(l)).map((l) => l.replace(/^#+\s*/, "").trim());
  const seen = new Map<string, number>();
  for (const h of heads) seen.set(h, (seen.get(h) ?? 0) + 1);
  for (const [h, n] of seen) if (n > 1 && !/^(?:장면|칸|문항|\d)/.test(h)) add(id, `소제목 중복: "${h}" ×${n}`);
  const refs = heads.filter((h) => /^참고\s*문헌$|^참고\s*자료$/.test(h)).length;
  if (refs > 1) add(id, `참고문헌 ${refs}개`);
  const inline = lines.filter((l) => /^[^#|\-*\d\s][^:：]{1,30}[:：]\s+\S.{25,}$/.test(l) && !/^(?:제목|이름|학번|출처|예시|주의|참고|예)[:：]/.test(l));
  if (inline.length >= 3) add(id, `라벨: 본문 한 줄 ${inline.length}곳 예) ${inline[0].slice(0, 40)}`);
  if (/『『|』』|\(저자\s*[:：]/.test(body)) add(id, "프롬프트 표기 누출(『『·(저자:)");
  if (/죄송|알려\s*주시면|보내\s*주시면|자료가\s*없어|도와\s*드릴|요청하신/.test(body)) add(id, "거절·말 거는 문장");
  if (/프롬프트|조사\s*노트|사실\s*노트|모델이|AI가\s*(?:생성|작성)/.test(body)) add(id, "우리 작업 용어가 글에 섞임");
  const marks = body.match(/\[(?:확인\s*필요|TODO|여기|작성\s*예정)[^\]]*\]/g);
  if (marks) add(id, `남은 표시 ${marks.length}: ${marks[0]}`);
  const paras = body.split(/\n{2,}/).filter((p) => p.trim().length > 60 && !/^\s*(?:#|\||[-*]|\d+[.)]|>|```)/.test(p));
  const cut = paras.filter((p) => !/[.!?。)\]”"』」…~]\s*(?:\[\d+\])*\s*$/.test(p.trim()));
  if (cut.length) add(id, `끝맺지 않은 문단 ${cut.length}: …${cut[0].trim().slice(-25)}`);
}
for (const f of files) {
  const id = f.replace(/^gc-/, "").replace(/\.md$/, "");
  console.log(`${id}\t${flag[id]?.length ? flag[id].join(" | ") : "-"}`);
}
