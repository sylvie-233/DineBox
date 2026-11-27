import type {
  ApiResult,
  EscPosEncoding,
  JobDetail,
  JobSource,
  JobSummary,
  SampleInfo,
  ServerInfo,
} from '../types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof Uint8Array ? { 'Content-Type': 'application/octet-stream' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload: ApiResult<T> | null = null;
  try {
    payload = text ? (JSON.parse(text) as ApiResult<T>) : null;
  } catch {
    throw new Error(`服务返回了无法解析的数据（HTTP ${response.status}）`);
  }
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? `请求失败（HTTP ${response.status}）`);
  }
  return payload.data;
}

export const api = {
  info(): Promise<ServerInfo> {
    return request('/api/info');
  },
  samples(): Promise<SampleInfo[]> {
    return request('/api/samples');
  },
  jobs(): Promise<JobSummary[]> {
    return request('/api/jobs');
  },
  job(id: string): Promise<JobDetail> {
    return request(`/api/jobs/${encodeURIComponent(id)}`);
  },
  createJob(
    bytes: Uint8Array,
    options: { encoding: EscPosEncoding; source?: JobSource },
  ): Promise<JobSummary> {
    const params = new URLSearchParams({ encoding: options.encoding });
    if (options.source === 'http') {
      params.set('source', 'http');
    }
    return request(`/api/jobs?${params.toString()}`, {
      method: 'POST',
      body: bytes.slice().buffer,
    });
  },
  createText(text: string, encoding: EscPosEncoding): Promise<JobSummary> {
    return request('/api/jobs/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, encoding }),
    });
  },
  createSample(id: string): Promise<JobSummary> {
    return request(`/api/samples/${encodeURIComponent(id)}`, { method: 'POST' });
  },
  clearJobs(): Promise<{ cleared: boolean }> {
    return request('/api/jobs', { method: 'DELETE' });
  },
};

export function hexToBytes(input: string): Uint8Array {
  const cleaned = input
    .replace(/0x/gi, '')
    .replace(/\\x/gi, '')
    .replace(/[\s,;:._-]/g, '');
  if (!cleaned) {
    throw new Error('请输入十六进制内容');
  }
  if (!/^[0-9a-f]+$/i.test(cleaned)) {
    throw new Error('十六进制包含非法字符');
  }
  if (cleaned.length % 2 !== 0) {
    throw new Error('十六进制长度必须为偶数');
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(cleaned.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}
