import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

export type StorageProviderMode = 'SUPABASE_STORAGE' | 'LOCAL_DISK';
export type StorageCategory = 'avatar' | 'leave-attachment';

export interface UploadFileInput {
  tenantId: string;
  category: StorageCategory;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

export interface UploadedFileResult {
  key: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  provider: StorageProviderMode;
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const EXT_MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

const CATEGORY_RULES: Record<
  StorageCategory,
  { maxBytes: number; allowedMimes: Set<string>; prefix: (tenantId: string) => string }
> = {
  avatar: {
    maxBytes: 2 * 1024 * 1024,
    allowedMimes: new Set(['image/jpeg', 'image/png', 'image/webp']),
    prefix: (tenantId) => `public/${tenantId}/avatars`,
  },
  'leave-attachment': {
    maxBytes: 5 * 1024 * 1024,
    allowedMimes: new Set([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]),
    prefix: (tenantId) => `tenants/${tenantId}/leave-attachments`,
  },
};

function matchesMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }
  if (mimeType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (mimeType === 'application/pdf') {
    return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  return false;
}

/**
 * Provides tenant-scoped file storage backed by Supabase Storage REST API
 * with an automatic local-disk fallback when cloud env vars are omitted.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  private getSupabaseConfig() {
    const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();

    if (!url || !key || !bucket) {
      return null;
    }
    return { url, key, bucket };
  }

  private getLocalRootDir(): string {
    const configured = process.env.LOCAL_UPLOAD_DIR?.trim();
    if (configured) {
      return path.resolve(configured);
    }
    return path.resolve(process.cwd(), 'uploads');
  }

  getProviderMode(): StorageProviderMode {
    return this.getSupabaseConfig() ? 'SUPABASE_STORAGE' : 'LOCAL_DISK';
  }

  private assertSafeKey(rawKey: string): string {
    const normalized = rawKey.trim().replaceAll('\\', '/');
    if (
      !normalized ||
      normalized.startsWith('/') ||
      normalized.includes('\0') ||
      normalized.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')
    ) {
      throw new BadRequestException('Invalid storage object key');
    }
    return normalized;
  }

  private resolveLocalPath(key: string): string {
    const safeKey = this.assertSafeKey(key);
    const root = this.getLocalRootDir();
    const target = path.resolve(root, safeKey);
    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new BadRequestException('Invalid storage path');
    }
    return target;
  }

  async uploadFile(input: UploadFileInput): Promise<UploadedFileResult> {
    const rule = CATEGORY_RULES[input.category];
    const mimeType = input.mimeType.trim().toLowerCase();

    if (!rule.allowedMimes.has(mimeType)) {
      throw new BadRequestException(`Unsupported file type: ${mimeType}`);
    }
    if (!input.buffer || input.buffer.length === 0) {
      throw new BadRequestException('Uploaded file is empty');
    }
    if (input.buffer.length > rule.maxBytes) {
      const maxMb = Math.round(rule.maxBytes / (1024 * 1024));
      throw new BadRequestException(`File exceeds maximum size of ${maxMb}MB`);
    }
    if (!matchesMagicBytes(input.buffer, mimeType)) {
      throw new BadRequestException(
        'File contents do not match the declared file type',
      );
    }

    const ext = MIME_EXTENSIONS[mimeType];
    const key = `${rule.prefix(input.tenantId)}/${crypto.randomUUID()}.${ext}`;
    const supa = this.getSupabaseConfig();

    if (supa) {
      await this.uploadToSupabase(supa, key, input.buffer, mimeType);
      const url =
        input.category === 'avatar'
          ? `${supa.url}/storage/v1/object/public/${supa.bucket}/${key}`
          : `/api/storage/download?key=${encodeURIComponent(key)}`;

      return {
        key,
        url,
        mimeType,
        sizeBytes: input.buffer.length,
        provider: 'SUPABASE_STORAGE',
      };
    }

    const filePath = this.resolveLocalPath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.buffer);

    const url =
      input.category === 'avatar'
        ? `/storage/${key}`
        : `/api/storage/download?key=${encodeURIComponent(key)}`;

    return {
      key,
      url,
      mimeType,
      sizeBytes: input.buffer.length,
      provider: 'LOCAL_DISK',
    };
  }

  async readObject(
    rawKey: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const key = this.assertSafeKey(rawKey);
    const supa = this.getSupabaseConfig();

    if (supa) {
      return this.readFromSupabase(supa, key);
    }

    const filePath = this.resolveLocalPath(key);
    try {
      const buffer = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      return {
        buffer,
        contentType: EXT_MIME_TYPES[ext] || 'application/octet-stream',
      };
    } catch {
      throw new NotFoundException('Stored file not found');
    }
  }

  async deleteObject(rawKey?: string | null): Promise<void> {
    if (!rawKey) return;
    const key = this.assertSafeKey(rawKey);
    const supa = this.getSupabaseConfig();

    if (supa) {
      await this.deleteFromSupabase(supa, key);
      return;
    }

    const filePath = this.resolveLocalPath(key);
    await fs.rm(filePath, { force: true });
  }

  private buildSupabaseHeaders(
    key: string,
    extra: Record<string, string> = {},
  ): Record<string, string> {
    // Modern sb_secret_ keys are opaque non-JWT keys and must use `apikey` only.
    if (key.startsWith('sb_secret_')) {
      return { apikey: key, ...extra };
    }
    return {
      Authorization: `Bearer ${key}`,
      apikey: key,
      ...extra,
    };
  }

  private async uploadToSupabase(
    supa: { url: string; key: string; bucket: string },
    objectKey: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<void> {
    const endpoint = `${supa.url}/storage/v1/object/${supa.bucket}/${objectKey}`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.buildSupabaseHeaders(supa.key, {
          'Content-Type': mimeType,
          'x-upsert': 'false',
        }),
        body: new Uint8Array(buffer),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new BadGatewayException(
          `Supabase Storage upload failed (HTTP ${response.status}): ${errText}`,
        );
      }
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      const reason = error instanceof Error ? error.message : 'Network error';
      throw new BadGatewayException(`Supabase Storage upload failed: ${reason}`);
    }
  }

  private async readFromSupabase(
    supa: { url: string; key: string; bucket: string },
    objectKey: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const endpoint = `${supa.url}/storage/v1/object/${supa.bucket}/${objectKey}`;
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: this.buildSupabaseHeaders(supa.key),
        signal: AbortSignal.timeout(10000),
      });

      if (response.status === 404 || response.status === 400) {
        throw new NotFoundException('Stored file not found');
      }
      if (!response.ok) {
        throw new BadGatewayException(
          `Supabase Storage read failed (HTTP ${response.status})`,
        );
      }

      const arrayBuf = await response.arrayBuffer();
      const contentType =
        response.headers.get('content-type') || 'application/octet-stream';
      return { buffer: Buffer.from(arrayBuf), contentType };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadGatewayException) {
        throw error;
      }
      const reason = error instanceof Error ? error.message : 'Network error';
      throw new BadGatewayException(`Supabase Storage read failed: ${reason}`);
    }
  }

  private async deleteFromSupabase(
    supa: { url: string; key: string; bucket: string },
    objectKey: string,
  ): Promise<void> {
    const endpoint = `${supa.url}/storage/v1/object/${supa.bucket}/${objectKey}`;
    try {
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: this.buildSupabaseHeaders(supa.key),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok && response.status !== 404) {
        this.logger.warn(
          `Supabase Storage delete returned HTTP ${response.status} for ${objectKey}`,
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Network error';
      this.logger.warn(`Supabase Storage delete failed for ${objectKey}: ${reason}`);
    }
  }
}
