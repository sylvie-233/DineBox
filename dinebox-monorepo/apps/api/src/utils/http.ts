/**
 * HTTP 响应辅助：统一 `{ code, message, data }` 结构，
 * 并提供由全局错误中间件消费的业务异常类型。
 */
import type { Context, TypedResponse } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { JSONParsed } from 'hono/utils/types';

/** 业务异常：由全局错误中间件转换为统一响应。 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export type ApiOk<T> = { code: 200; message: string; data: T };

export type SuccessResponse<T, S extends ContentfulStatusCode = 200> = Response &
  TypedResponse<JSONParsed<ApiOk<T>>, S, 'json'>;

/** 统一成功响应。 */
export function success<T, S extends ContentfulStatusCode = 200>(
  c: Context,
  data: T,
  message = '操作成功',
  status: S = 200 as S,
): SuccessResponse<T, S> {
  const body: ApiOk<T> = { code: 200, message, data };
  return c.json(body, status);
}

/** 统一失败响应（供中间件直接使用）。 */
export function failure(c: Context, status: number, message: string): Response {
  return c.body(JSON.stringify({ code: status, message, data: null }), status as ContentfulStatusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
}
