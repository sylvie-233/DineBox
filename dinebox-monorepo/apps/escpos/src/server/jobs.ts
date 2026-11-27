/** 内存打印任务仓库：保存最近任务，向 SSE 订阅者广播。 */
import { randomUUID } from 'node:crypto';

import type {
  EscPosEncoding,
  JobDetail,
  JobSource,
  JobSummary,
  ParsedEscPos,
} from '../types';
import { parseEscPos, summarizeParsed } from '../parser/parser';

export const MAX_JOB_BYTES = 1_000_000;
const MAX_JOBS = 50;

interface StoredJob {
  summary: JobSummary;
  parsed: ParsedEscPos;
  raw: Buffer;
}

export class JobLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobLimitError';
  }
}

export class JobStore {
  private jobs: StoredJob[] = [];
  private listeners = new Set<(summary: JobSummary) => void>();

  add(
    bytes: Buffer,
    options: { source: JobSource; encoding: EscPosEncoding },
  ): JobSummary {
    if (bytes.length === 0) {
      throw new JobLimitError('打印任务为空');
    }
    if (bytes.length > MAX_JOB_BYTES) {
      throw new JobLimitError(`打印任务超过 ${Math.round(MAX_JOB_BYTES / 1024)} KB 上限`);
    }

    const parsed = parseEscPos(bytes, { encoding: options.encoding });
    const { title, preview } = summarizeParsed(parsed, bytes);
    const summary: JobSummary = {
      id: `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
      source: options.source,
      createdAt: new Date().toISOString(),
      bytes: bytes.length,
      encoding: options.encoding,
      title,
      preview,
      commandCount: parsed.stats.commands,
      textCount: parsed.stats.texts,
      unknownCount: parsed.stats.unknown,
      warnings: parsed.warnings.length,
    };

    this.jobs.unshift({ summary, parsed, raw: Buffer.from(bytes) });
    this.jobs = this.jobs.slice(0, MAX_JOBS);
    for (const listener of this.listeners) {
      try {
        listener(summary);
      } catch {
        // 单个订阅者异常不影响其他订阅者
      }
    }
    return summary;
  }

  list(): JobSummary[] {
    return this.jobs.map((job) => job.summary);
  }

  get(id: string): JobDetail | null {
    const job = this.jobs.find((item) => item.summary.id === id);
    if (!job) {
      return null;
    }
    return {
      ...job.summary,
      parsed: job.parsed,
      raw: job.raw.toString('base64'),
    };
  }

  clear(): void {
    this.jobs = [];
  }

  get size(): number {
    return this.jobs.length;
  }

  subscribe(listener: (summary: JobSummary) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const jobStore = new JobStore();
