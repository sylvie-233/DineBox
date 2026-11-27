/** 文件代理：读取对象存储中的菜品图片（仅 dishes/ 前缀）。 */
import type { AppContext } from '../types/context.js';
import { failure } from '../utils/http.js';
import { getObject } from '../services/storage.service.js';
import { isProxyableKey } from '../services/admin/upload.service.js';

export async function proxy(c: AppContext, key: string) {
  if (!isProxyableKey(key)) {
    return failure(c, 404, '文件不存在');
  }
  let object;
  try {
    object = await getObject(key);
  } catch {
    return failure(c, 503, '对象存储暂不可用');
  }
  if (!object) {
    return failure(c, 404, '文件不存在');
  }

  const headers: Record<string, string> = {
    'Content-Type': object.contentType || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
  if (object.contentLength !== undefined) {
    headers['Content-Length'] = String(object.contentLength);
  }
  const body =
    object.body instanceof Uint8Array
      ? Buffer.from(object.body)
      : object.body;
  return new Response(body as never, { status: 200, headers });
}
