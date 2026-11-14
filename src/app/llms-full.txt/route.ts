import { FAQ, FEATURES } from "@/lib/seo/about-content";
import { GUIDES } from "@/lib/seo/guides";
import { CONTACT_EMAIL, SITE_DESCRIPTION, SITE_NAME, SITE_URL, SOCIAL_LINKS } from "@/lib/seo/site";

// llms.txt의 전체판: 공개 글을 한 파일의 Markdown으로 내보낸다. 소개·FAQ·가이드 글과 같은 원본(lib/seo)에서 만들어서 따로 고칠 곳이 없다.
export const dynamic = "force-static";

export function GET() {
  const lines: string[] = [`# ${SITE_NAME}`, "", `> ${SITE_DESCRIPTION}`, "", "## 주요 기능", ""];
  for (const f of FEATURES) lines.push(`### ${f.name}`, f.text, "");
  lines.push("## 자주 묻는 질문", "");
  for (const f of FAQ) lines.push(`### ${f.q}`, f.a, "");
  lines.push("## 수행평가 가이드", "");
  for (const g of GUIDES) {
    lines.push(`### ${g.title}`, `(${SITE_URL}/guide/${g.slug})`, "", g.intro, "");
    for (const s of g.sections) {
      lines.push(`#### ${s.heading}`, "");
      for (const p of s.paragraphs ?? []) lines.push(p, "");
      for (const li of s.list ?? []) lines.push(`- ${li}`);
      if (s.list) lines.push("");
    }
  }
  lines.push("## 문의와 공식 채널", "", `- 이메일: ${CONTACT_EMAIL}`, ...SOCIAL_LINKS.map((l) => `- ${l}`), "");
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
