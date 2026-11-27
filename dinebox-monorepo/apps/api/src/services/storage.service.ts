/**
 * 应用级对象存储服务（RustFS / S3）：菜品图片上传、读取与健康检查。
 * 图片压缩等业务处理不在本层；未配置公网地址时通过 `/api/files/:key` 代理读取。
 */
import { createStorage, type PutResult, type StoredObject } from '@dinebox/storage';

import { env } from '../config/env.js';
import { moduleLogger } from '../utils/logger.js';

const log = moduleLogger('storage');

export const storage = createStorage({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  accessKeyId: env.S3_ACCESS_KEY,
  secretAccessKey: env.S3_SECRET_KEY,
  bucket: env.S3_BUCKET,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  publicBaseUrl: env.S3_PUBLIC_URL || undefined,
  urlBuilder: env.S3_PUBLIC_URL ? undefined : (key) => `/api/files/${key}`,
});

export async function ensureBucket(): Promise<void> {
  const created = await storage.ensureBucket();
  if (created) {
    log.info('已创建对象存储桶', { bucket: env.S3_BUCKET });
  }
}

export function storageHealthy(): Promise<boolean> {
  return storage.isHealthy();
}

export type UploadResult = PutResult;
export type StoredObjectResult = StoredObject;

export function uploadObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<UploadResult> {
  return storage.put(key, body, contentType);
}

export function getObject(key: string): Promise<StoredObjectResult | null> {
  return storage.get(key);
}

/** 解析对象访问地址（默认 `/api/files/{key}`）。 */
export function resolveObjectUrl(key: string): string {
  return storage.resolveUrl(key);
}
