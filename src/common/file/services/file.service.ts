import { Injectable } from '@nestjs/common';
import { IFileRows } from '@common/file/interfaces/file.interface';
import { IFileService } from '@common/file/interfaces/file.service.interface';
import { ENUM_HELPER_FILE_EXCEL_TYPE } from '@common/helper/enums/helper.enum';
import { utils, write, read } from 'xlsx';
import { promises as fs } from 'fs';
import path, { join } from 'path';

@Injectable()
export class FileService implements IFileService {
    writeCsv<T = Record<string, string | number | Date>>(
        rows: IFileRows<T>
    ): Buffer {
        const worksheet = utils.json_to_sheet(rows.data);
        const csv = utils.sheet_to_csv(worksheet, { FS: ';' });

        // create buffer
        const buff: Buffer = Buffer.from(csv, 'utf8');

        return buff;
    }

    writeCsvFromArray<T = Record<string, string | number | Date>>(
        rows: T[][]
    ): Buffer {
        const worksheet = utils.aoa_to_sheet(rows);
        const csv = utils.sheet_to_csv(worksheet, { FS: ';' });

        // create buffer
        const buff: Buffer = Buffer.from(csv, 'utf8');

        return buff;
    }

    writeExcel<T = Record<string, string | number | Date>>(
        rows: IFileRows<T>[]
    ): Buffer {
        // workbook
        const workbook = utils.book_new();

        for (const [index, row] of rows.entries()) {
            // worksheet
            const worksheet = utils.json_to_sheet(row.data);
            utils.book_append_sheet(
                workbook,
                worksheet,
                row.sheetName ?? `Sheet${index + 1}`
            );
        }

        // create buffer
        const buff: Buffer = write(workbook, {
            type: 'buffer',
            bookType: ENUM_HELPER_FILE_EXCEL_TYPE.XLSX,
        });

        return buff;
    }

    writeExcelFromArray<T = Record<string, string | number | Date>>(
        rows: T[][]
    ): Buffer {
        // workbook
        const workbook = utils.book_new();

        // worksheet
        const worksheet = utils.aoa_to_sheet(rows);
        utils.book_append_sheet(workbook, worksheet, `Sheet1`);

        // create buffer
        const buff: Buffer = write(workbook, {
            type: 'buffer',
            bookType: ENUM_HELPER_FILE_EXCEL_TYPE.XLSX,
        });

        return buff;
    }

    readCsv<T = Record<string, string | number | Date>>(
        file: Buffer
    ): IFileRows<T> {
        // workbook
        const workbook = read(file, {
            type: 'buffer',
        });

        // worksheet
        const worksheetsName: string = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[worksheetsName];
        const rows: T[] = utils.sheet_to_json(worksheet);

        return {
            data: rows,
            sheetName: worksheetsName,
        };
    }

    readCsvFromString<T = Record<string, string | number | Date>>(
        file: string
    ): IFileRows<T> {
        // workbook
        const workbook = read(file, {
            type: 'string',
        });

        // worksheet
        const worksheetsName: string = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[worksheetsName];
        const rows: T[] = utils.sheet_to_json(worksheet);

        return {
            data: rows,
            sheetName: worksheetsName,
        };
    }

    readExcel<T = Record<string, string | number | Date>>(
        file: Buffer
    ): IFileRows<T>[] {
        // workbook
        const workbook = read(file, {
            type: 'buffer',
        });

        // worksheet
        const worksheetsName: string[] = workbook.SheetNames;
        const sheets: IFileRows[] = [];

        for (let i = 0; i < worksheetsName.length; i++) {
            const worksheet = workbook.Sheets[worksheetsName[i]];

            // rows
            const rows: T[] = utils.sheet_to_json(worksheet);

            sheets.push({
                data: rows,
                sheetName: worksheetsName[i],
            });
        }

        return sheets;
    }

    isBase64(str: string | null | undefined): boolean {
        if (!str || typeof str !== 'string') {
            return false;
        }

        // Case 1: Data URL format → data:[<mime>][;charset=<charset>][;base64],
        const dataUrlRegex =
            /^data:([a-zA-Z0-9\/+.-]+);base64,([A-Za-z0-9+/=]+)$/;

        const dataUrlMatch = str.match(dataUrlRegex);
        if (dataUrlMatch) {
            const base64Part = dataUrlMatch[2];
            return this.isValidBase64String(base64Part);
        }

        // Case 2: Raw Base64 string (no data: prefix)
        // Allow optional whitespace and common prefixes like "base64:"
        const cleaned = str.trim().replace(/^base64[:\s]*/i, '');

        // Must be non-empty after cleaning
        if (!cleaned) return false;

        return this.isValidBase64String(cleaned);
    }

    private isValidBase64String(base64Str: string): boolean {
        // Must be multiple of 4 in length (after padding)
        if (base64Str.length === 0 || base64Str.length % 4 !== 0) {
            return false;
        }

        // Only allow valid Base64 chars + padding
        const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
        if (!base64Regex.test(base64Str)) {
            return false;
        }

        try {
            // atob will throw if invalid
            atob(base64Str);
            return true;
        } catch {
            return false;
        }
    }

    async uploadBase64Image(
        base64String: string,
        filename: string
    ): Promise<string> {
        if (!this.isBase64(base64String)) {
            throw new Error('Invalid base64 string provided');
        }

        let base64Data = base64String;
        const dataUriRegex = /^data:image\/\w+;base64,/;
        if (dataUriRegex.test(base64String)) {
            base64Data = base64String.replace(dataUriRegex, '');
        }

        const imagesDir = path.resolve(process.cwd(), 'public', 'images');
        try {
            await fs.access(imagesDir);
        } catch {
            await fs.mkdir(imagesDir, { recursive: true });
        }

        const imageBuffer = Buffer.from(base64Data, 'base64');
        const fileName = Date.now() + '_' + filename + '.' + this.getExtensionFromBase64(base64String);
        const filePath = join(imagesDir, fileName);
        await fs.writeFile(filePath, imageBuffer);

        return `/assets/images/${fileName}`;
    }

    getExtensionFromBase64(base64String: string): string | null {
        const match =
            base64String.match(/^data:[\w\/+-]+;base64,/) ||
            base64String.match(/^data:([a-zA-Z0-9\/+]+);/);

        if (!match) return null;

        const mimeType =
            match[1] || match[0].split(';')[0].replace('data:', '');

        // Common MIME → extension mapping
        const mimeToExt: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'image/svg+xml': 'svg',
            'application/pdf': 'pdf',
            'text/plain': 'txt',
            'text/csv': 'csv',
            'application/json': 'json',
            'application/vnd.ms-excel': 'xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                'xlsx',
            'application/msword': 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                'docx',
        };

        return mimeToExt[mimeType] || mimeType.split('/').pop() || null;
    }

    async deleteFile(filePath: string): Promise<boolean> {
        try {
            const resolvedPath = path.resolve(process.cwd(), filePath);

            await fs.unlink(resolvedPath);
            console.log(`File deleted successfully: ${resolvedPath}`);
            return true;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                console.warn(`File not found (already deleted?): ${filePath}`);
                return true;
            }

            return false;
        }
    }
}
