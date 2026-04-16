import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

@Injectable()
export class DocumentFileService {
    private readonly uploadDir = path.resolve(process.cwd(), 'public', 'files', 'documents');

    async ensureUploadDir(): Promise<void> {
        try {
            await fs.access(this.uploadDir);
        } catch {
            await fs.mkdir(this.uploadDir, { recursive: true });
        }
    }

    /**
     * Save a multer file buffer to disk.
     * Returns the relative URL path: /assets/files/documents/<filename>
     */
    async saveFile(
        buffer: Buffer,
        originalName: string,
        companyId: string
    ): Promise<{ file_path: string; file_name: string; file_type: string }> {
        await this.ensureUploadDir();

        const ext = path.extname(originalName);
        const safeName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        const uniqueName = `${Date.now()}_${companyId.slice(0, 8)}_${safeName}${ext}`;
        const fullPath = path.join(this.uploadDir, uniqueName);

        await fs.writeFile(fullPath, buffer);

        return {
            file_path: `/assets/files/documents/${uniqueName}`,
            file_name: originalName,
            file_type: ext.replace('.', '').toLowerCase(),
        };
    }

    async deleteFile(filePath: string): Promise<void> {
        try {
            // Convert /assets/files/documents/xxx to public/files/documents/xxx
            const relativePath = filePath.replace('/assets/', 'public/');
            const fullPath = path.resolve(process.cwd(), relativePath);
            await fs.unlink(fullPath);
        } catch (err: any) {
            if (err.code !== 'ENOENT') {
                console.warn(`Failed to delete file ${filePath}:`, err.message);
            }
        }
    }
}
