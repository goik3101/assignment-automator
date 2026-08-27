import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // C:\Users\a0104 안에 다른 프로젝트의 package-lock.json이 있어서 Turbopack이
  // 워크스페이스 루트를 착각하는 것을 방지 (경고 해결용, 기능과 무관)
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
