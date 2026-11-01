// 밑줄(<u>…</u>)을 화면에 실제 밑줄로 그린다.
//
// 왜 필요한가(실측 2026-11-01, 공통영어2 발명품 제안서): 안내문이 "수동태·It~that 강조·관계대명사를 각각 쓰고
// 그 표현에 밑줄"을 요구하는데 결과물은 굵게로 나왔다 — 그 항목은 0점이다. 원인이 두 군데였다.
//   ① 마크다운에 밑줄 문법이 없어 프롬프트가 "굵게 표시"를 직접 시켰다.
//   ② deliverable.ts가 모델이 쓴 <u>…</u>를 굵게로 **되돌려** 놓았다(화면이 HTML을 안 그려서 글자로 남았기 때문).
// 그래서 화면 쪽을 고친다. rehype-raw로 HTML을 통째로 그리게 하면 모델 출력이 곧 HTML이 되어
// 주입 위험이 생기므로 쓰지 않고, <u> 한 종류만 노드로 바꾼다(data.hName → remark-rehype가 <u> 요소로 만든다).
// alias import 없음 — node:test에서 바로 불러올 수 있게.

export interface Seg {
  text: string;
  underline: boolean;
}

const TAG = /<u>([\s\S]*?)<\/u>/gi;

/** "a <u>b</u> c" → [{a,false},{b,true},{ c,false}]. 짝이 안 맞는 태그는 글자 그대로 둔다. */
export function splitUnderline(text: string): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), underline: false });
    if (m[1]) out.push({ text: m[1], underline: true });
    last = at + m[0].length;
  }
  if (out.length === 0) return [{ text, underline: false }];
  if (last < text.length) out.push({ text: text.slice(last), underline: false });
  return out;
}

export function hasUnderline(text: string): boolean {
  return /<u>[\s\S]*?<\/u>/i.test(text);
}

interface Node {
  type: string;
  value?: string;
  children?: Node[];
  data?: { hName?: string };
}

const u = (children: Node[]): Node => ({ type: "underline", data: { hName: "u" }, children });
const OPEN = /^<u>$/i;
const CLOSE = /^<\/u>$/i;

/**
 * <u>…</u>를 밑줄 노드로 바꾼다(코드 블록·인라인 코드는 건드리지 않는다).
 *
 * remark-parse는 <u>를 **글자가 아니라 html 노드**로 떼어 놓는다 — 트리는
 * text("The bottle "), html("<u>"), text("is made"), html("</u>") … 가 된다.
 * 그래서 글자 노드만 보면 아무것도 안 걸린다(실측: 바꾼 글이 그대로 &lt;u&gt;로 나왔다).
 * 여는 html 노드부터 닫는 html 노드까지를 모아 한 노드로 감싼다. 짝이 없으면 손대지 않는다.
 */
export function underlineTree(node: Node): void {
  if (!node.children) return;
  const next: Node[] = [];
  let buf: Node[] | null = null;
  for (const child of node.children) {
    if (child.type === "code" || child.type === "inlineCode") {
      (buf ?? next).push(child);
      continue;
    }
    if (child.type === "html" && child.value) {
      if (OPEN.test(child.value.trim())) {
        if (buf) next.push({ type: "text", value: "<u>" }, ...buf);
        buf = [];
        continue;
      }
      if (CLOSE.test(child.value.trim())) {
        if (buf) {
          next.push(u(buf));
          buf = null;
        }
        continue;
      }
    }
    if (child.type === "text" && child.value && hasUnderline(child.value)) {
      for (const seg of splitUnderline(child.value)) {
        if (!seg.text) continue;
        (buf ?? next).push(seg.underline ? u([{ type: "text", value: seg.text }]) : { type: "text", value: seg.text });
      }
      continue;
    }
    underlineTree(child);
    (buf ?? next).push(child);
  }
  // 닫는 태그를 못 만났으면 모아 둔 것을 되돌린다(글이 깨지지 않게).
  if (buf) next.push({ type: "text", value: "<u>" }, ...buf);
  node.children = next;
}

/** react-markdown의 remarkPlugins에 넣는다. */
export function remarkUnderline() {
  return (tree: Node) => {
    underlineTree(tree);
  };
}
