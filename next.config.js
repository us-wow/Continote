/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Vercel serverless 빌드 시 lib/prompts/*.md 파일이 함수 번들에 누락되지 않도록 명시.
  // route.ts가 process.cwd() 기준으로 fs.readFileSync를 쓰는데, Next가 정적 분석으로
  // 잡지 못하는 경로의 파일을 빼먹을 수 있어 안전망으로 추가.
  outputFileTracingIncludes: {
    '/api/analyze': ['./lib/prompts/**/*.md'],
  },
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
