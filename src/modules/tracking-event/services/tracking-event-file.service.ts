import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Saves tracking-event attachments to `public/files/tracking/<filename>`.
 * Returns the relative storage path (no host, no `/assets` prefix); the
 * frontend joins it with REACT_APP_BACKEND_REST_API_URL_PDF for display.
 */
@Injectable()
export class TrackingEventFileService {
    private readonly uploadDir = path.resolve(
        process.cwd(),
        'public',
        'files',
        'tracking'
    );

    async ensureUploadDir(): Promise<void> {
        try {
            await fs.access(this.uploadDir);
        } catch {
            await fs.mkdir(this.uploadDir, { recursive: true });
        }
    }

    async saveFile(
        buffer: Buffer,
        originalName: string,
        companyId: string
    ): Promise<string> {
        await this.ensureUploadDir();
        const ext = path.extname(originalName);
        const safe = path
            .basename(originalName, ext)
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .slice(0, 40);
        const unique = `${Date.now()}_${companyId.slice(0, 8)}_${safe}${ext}`;
        await fs.writeFile(path.join(this.uploadDir, unique), buffer);
        return `files/tracking/${unique}`;
    }
}
