/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    config.resolve.alias.canvas = false;
    // pptxgenjs가 node:fs / node:https를 참조하는데 클라이언트 번들에서는 필요 없으므로 무시.
    // (PPT 생성은 브라우저에서 동적 import + 다운로드 처리)
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        https: false,
        http: false,
        path: false,
        stream: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
