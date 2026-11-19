import { createReadStream, mkdirSync, promises as fsPromises } from 'node:fs';
import type { ReadStream, Stats } from 'node:fs';
import { join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';

export const DOCUMENT_STORAGE_KEY_PATTERN = /^[0-9a-f-]{36}\.[a-z0-9]+$/i;

@Injectable()
export class DocumentStorageService {
  private readonly storageDir: string;

  constructor(private readonly config: ConfigService) {
    this.storageDir = resolve(
      process.cwd(),
      this.config.get<string>('DOCUMENT_STORAGE_DIR', './storage/private') ?? './storage/private',
    );
    mkdirSync(this.storageDir, { recursive: true });
  }

  async writeFile(storageKey: string, data: Buffer): Promise<void> {
    mkdirSync(this.storageDir, { recursive: true });
    await fsPromises.writeFile(this.resolvePath(storageKey), data, { flag: 'wx' });
  }

  async statFile(storageKey: string): Promise<Stats> {
    return fsPromises.stat(this.resolvePath(storageKey));
  }

  async fileExists(storageKey: string): Promise<boolean> {
    try {
      const stats = await this.statFile(storageKey);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  createReadStream(storageKey: string): ReadStream {
    return createReadStream(this.resolvePath(storageKey));
  }

  async deleteFile(storageKey: string): Promise<void> {
    try {
      await fsPromises.unlink(this.resolvePath(storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private resolvePath(storageKey: string): string {
    if (typeof storageKey !== 'string' || !DOCUMENT_STORAGE_KEY_PATTERN.test(storageKey)) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Clé de stockage invalide.');
    }
    return join(this.storageDir, storageKey);
  }
}
