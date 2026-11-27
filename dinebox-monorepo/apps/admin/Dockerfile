# syntax=docker/dockerfile:1

# ---------- 构建阶段 ----------
FROM node:24-alpine AS build

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmmirror.com

RUN npm config set registry "$NPM_REGISTRY" \
 && npm install -g pnpm@10.32.1 --no-fund --no-audit \
 && pnpm config set registry "$NPM_REGISTRY"

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/cache/package.json packages/cache/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/logger/package.json packages/logger/package.json
COPY packages/print/package.json packages/print/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/utils/package.json packages/utils/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @dinebox/admin... build

# ---------- 运行阶段：Nginx 托管 SPA 并代理 API ----------
FROM nginx:1.29 AS runner

ENV TZ=Asia/Shanghai

COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html

EXPOSE 80
