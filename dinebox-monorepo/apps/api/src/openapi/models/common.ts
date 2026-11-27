/**
 * OpenAPI 公共模型：统一响应包装、分页、路径参数与错误响应。
 */
import { z } from '@hono/zod-openapi';

/** 统一失败响应。 */
export const ErrorResponseSchema = z
  .object({
    code: z.number().int().openapi({ example: 400 }),
    message: z.string().openapi({ example: '请求参数错误' }),
    data: z.null(),
  })
  .openapi('ErrorResponse');

export function jsonContent<T extends z.ZodTypeAny>(schema: T) {
  return { 'application/json': { schema } };
}

function ok<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    code: z.literal(200).openapi({ example: 200, description: '业务状态码，成功恒为 200' }),
    message: z.string().openapi({ example: '操作成功' }),
    data,
  });
}

/** 声明一个成功响应。 */
export function successResponse<T extends z.ZodTypeAny>(data: T, description = '操作成功') {
  return { description, content: jsonContent(ok(data)) };
}

/** 声明 JSON 请求体。 */
export function jsonBody<T extends z.ZodTypeAny>(schema: T) {
  return { content: jsonContent(schema), required: true as const };
}

/** 声明二进制响应。 */
export function binaryResponse(contentType: string, description: string) {
  return {
    description,
    content: {
      [contentType]: {
        schema: z.string().openapi({ type: 'string', format: 'binary' }),
      },
    },
  };
}

export const errorResponses = {
  400: { content: jsonContent(ErrorResponseSchema), description: '参数错误' },
  401: { content: jsonContent(ErrorResponseSchema), description: '未登录或登录已失效' },
  403: { content: jsonContent(ErrorResponseSchema), description: '没有操作权限' },
  404: { content: jsonContent(ErrorResponseSchema), description: '资源不存在' },
  409: { content: jsonContent(ErrorResponseSchema), description: '数据冲突或重复操作' },
} as const;

/** 统一分页结构。 */
export function pageResult<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    list: z.array(item),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
  });
}

const pathIdSchema = (name: string, description: string, example: number) =>
  z.coerce.number().int().positive().openapi({
    param: { name, in: 'path' },
    description,
    example,
  });

export const idParamsSchema = z.object({
  id: pathIdSchema('id', '资源 ID', 1),
});

/** 复杂响应体：保留字段结构由 TypeScript DTO 约束，OpenAPI 以对象展示。 */
export const dataSchema = z.any().openapi('Data');

/** 通用空结果。 */
export const nullSchema = z.null();
