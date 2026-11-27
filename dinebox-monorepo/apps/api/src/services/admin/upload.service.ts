/** 菜品图片上传：写入 RustFS 并登记 sys_file，返回代理访问地址。 */
import { randomBytes } from 'node:crypto';

import { dbClient, schema } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { uploadObject } from '../storage.service.js';

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export interface DishImageUploadResult {
  id: number;
  key: string;
  url: string;
  name: string;
  size: number;
}

/** 上传菜品图片（≤8MB，jpg/png/webp/gif）。 */
export async function handleDishImageUpload(
  file: File,
  uploadedBy: number | null,
): Promise<DishImageUploadResult> {
  const ext = MIME_EXT[file.type];
  if (!ext) {
    throw new HttpError(400, '仅支持 JPG / PNG / WebP / GIF 图片');
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new HttpError(413, '图片不能超过 8MB');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const now = new Date();
  const folder = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const key = `dishes/${folder}/${randomBytes(8).toString('hex')}.${ext}`;

  const stored = await uploadObject(key, bytes, file.type);
  const [result] = await dbClient.db.insert(schema.sysFile).values({
    fileName: file.name.slice(0, 128),
    filePath: key,
    fileSize: file.size,
    mimeType: file.type,
    bizType: 'DISH_IMAGE',
    uploadedBy,
  });

  return {
    id: result.insertId,
    key,
    url: stored.url,
    name: file.name,
    size: file.size,
  };
}

/** 文件代理允许的 key 前缀。 */
export function isProxyableKey(key: string): boolean {
  return key.startsWith('dishes/');
}
