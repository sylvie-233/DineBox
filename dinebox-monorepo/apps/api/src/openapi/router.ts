/**
 * OpenAPI 路由工具：创建带统一校验错误响应的路由实例，
 * 并提供放宽控制器返回类型的处理器绑定辅助函数。
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import type { RouteConfig, RouteHandler } from '@hono/zod-openapi';

import type { AppEnv } from '../types/context.js';

/** 创建带统一校验错误响应的 OpenAPI 路由实例。 */
export function createApiRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const message = result.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.') || '参数'}: ${issue.message}`)
          .join('；');
        return c.body(
          JSON.stringify({ code: 400, message, data: null }),
          400,
          { 'Content-Type': 'application/json; charset=utf-8' },
        );
      }
    },
  });
}

/** 把控制器绑定到路由，并保留 `RouteHandler` 的返回类型约束。 */
export function routeHandler<R extends RouteConfig>(
  _route: R,
  handler: RouteHandler<R, AppEnv>,
): RouteHandler<R, AppEnv> {
  return handler;
}
