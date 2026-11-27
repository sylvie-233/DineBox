/**
 * 全局错误兜底：按异常类型映射 HTTP 状态与中文提示，
 * 始终返回统一响应结构，不向客户端泄露 SQL 或堆栈。
 */
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';

import type { AppEnv } from '../types/context.js';
import { failure, HttpError } from '../utils/http.js';
import { logger } from '../utils/logger.js';

interface ErrorWithCode {
  code?: string;
}

function zodMessage(error: ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || '参数'}: ${issue.message}`)
    .join('；');
}

export function errorHandler(error: Error, c: Context<AppEnv>): Response {
  let status: ContentfulStatusCode = 500;
  let message = '服务器内部错误';

  if (error instanceof HttpError) {
    status = error.status as ContentfulStatusCode;
    message = error.message;
  } else if (error instanceof ZodError) {
    status = 400;
    message = zodMessage(error);
  } else if (error instanceof HTTPException) {
    status = error.status;
    message = error.message || '请求处理失败';
  } else {
    const code = (error as ErrorWithCode).code;
    if (code === 'ER_DUP_ENTRY') {
      status = 409;
      message = '数据已存在，请检查名称或账号是否重复';
    } else if (code === 'ER_NO_SUCH_TABLE') {
      status = 500;
      message = '数据库表不存在，请先执行 scripts/init/01-schema.sql 初始化';
    } else if (code === 'ER_ROW_IS_REFERENCED_2') {
      status = 409;
      message = '该数据被其他记录引用，无法删除';
    } else if (code === 'ECONNREFUSED' || code === 'PROTOCOL_CONNECTION_LOST') {
      status = 503;
      message = '数据库连接不可用，请检查 MySQL 是否已启动';
    }
  }

  if (status >= 500) {
    (c.get('logger') ?? logger).error('未处理异常', error, { status });
  }

  return failure(c, status, message);
}
