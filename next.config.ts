import type { NextConfig } from "next";

// 브라우저가 연결할 Supabase 주소(로그인/매직링크)와 캡차·폰트 CDN만 허용 목록에 둔다.
const supabaseOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
  } catch {
    return "";
  }
})();

// CSP는 Report-Only로만 건다 — 막지 않고 브라우저 콘솔에 위반만 기록한다. 실제 화면에서 위반이 없는 걸 확인한 뒤
// 헤더 이름을 Content-Security-Policy로 바꿔 강제한다. Next.js가 넣는 인라인 스크립트와 layout.tsx의 테마 스크립트 때문에
// 지금은 script-src에 'unsafe-inline'이 필요하다(강제 전에 nonce 방식으로 바꾸면 더 안전).
const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace(/^https:/, "wss:")}`.trim(),
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 카메라는 파일 선택창(<input type=file>)으로만 쓰고 getUserMedia는 쓰지 않는다.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // includeSubDomains는 같은 도메인의 다른 서비스에 영향을 줄 수 있어 뺀다. https 응답에서만 효력이 있다.
  { key: "Strict-Transport-Security", value: "max-age=15552000" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Content-Security-Policy-Report-Only", value: cspReportOnly }]
    : []),
];

const nextConfig: NextConfig = {
  // C:\Users\a0104 안에 다른 프로젝트의 package-lock.json이 있어서 Turbopack이
  // 워크스페이스 루트를 착각하는 것을 방지 (경고 해결용, 기능과 무관)
  turbopack: {
    root: __dirname,
  },
  // 프레임워크 종류를 응답 헤더로 알려주지 않는다.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // 공유 링크(토큰이 곧 열쇠)와 관리자 화면은 검색에 잡히면 안 된다.
      { source: "/share/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
