import type { NextConfig } from 'next';

/**
 * 顾客 H5 通过 Next rewrites 把 /api 代理到 Hono 服务：
 * - 本地开发：http://127.0.0.1:3100
 * - 容器部署：通过 API_BASE_URL 指向 API 容器
 */
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3100';

// Windows 本地构建 standalone 会因符号链接权限失败；容器构建时显式开启。
const standaloneOutput = process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined;

const nextConfig: NextConfig = {
  output: standaloneOutput,
  reactStrictMode: true,
  images: { unoptimized: true },
  transpilePackages: ['@dinebox/types', '@dinebox/utils'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiBaseUrl}/api/:path*` }];
  },
};

export default nextConfig;
