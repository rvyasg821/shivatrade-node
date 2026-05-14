import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import { CategoryService } from './category.service';
import { CategoryRepository } from '../repository/repositories/category.repository';
import { ENUM_CATEGORY_STATUS } from '../enums/category.enum';

const EXCEL_HEADERS = ['name', 'description', 'status'];
const SHEET_NAME = 'Categories';

const SAMPLE_ROWS = [
    {
        name: 'Electronics',
        description: 'Electronic devices and accessories',
        status: 'active',
    },
    {
        name: 'Groceries',
        description: 'Daily grocery items',
        status: 'inactive',
    },
];

export interface CategoryImportRow {
    rowNum: number;
    data: {
        name: string;
        description: string;
        status: ENUM_CATEGORY_STATUS;
    };
    status: 'valid_new' | 'valid_update' | 'error';
    existingId?: string;
    errors: string[];
}

@Injectable()
export class CategoryImportExportService {
    private readonly logger = new Logger(CategoryImportExportService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly categoryService: CategoryService,
        private readonly categoryRepository: CategoryRepository,
    ) {}

    /** Sample Excel file with headers + example rows. */
    generateSampleExcel(): Buffer {
        return this.fileService.writeExcel([
            { data: SAMPLE_ROWS, sheetName: SHEET_NAME },
        ]);
    }

    /** Export all of a company's categories as an Excel buffer. */
    async exportCategories(companyId: string): Promise<Buffer> {
        const categories = await this.categoryRepository.findByCompanyId(
            companyId,
            { order: { name: 'asc' as any } },
        );

        const rows = categories.map((c) => ({
            name: c.name || '',
            description: c.description || '',
            status: c.is_active
                ? ENUM_CATEGORY_STATUS.ACTIVE
                : ENUM_CATEGORY_STATUS.INACTIVE,
        }));

        if (rows.length === 0) {
            return this.fileService.writeExcelFromArray([EXCEL_HEADERS]);
        }

        return this.fileService.writeExcel([
            { data: rows, sheetName: SHEET_NAME },
        ]);
    }

    /**
     * Parse + validate an uploaded file. Never throws on row-level problems —
     * those are collected into each row's `errors`. Only file-level problems
     * (unreadable / empty / missing header) throw a BadRequestException.
     */
    async parseAndValidate(
        fileBuffer: Buffer,
        companyId: string,
    ): Promise<{ summary: any; rows: CategoryImportRow[] }> {
        let sheets;
        try {
            sheets = this.fileService.readExcel(fileBuffer);
        } catch {
            throw new BadRequestException(
                'Unable to read the file. Please upload a valid Excel or CSV file.',
            );
        }

        const rawRows = (sheets?.[0]?.data || []) as Record<string, any>[];
        if (!rawRows.length) {
            throw new BadRequestException('The file contains no data rows.');
        }

        const headerKeys = Object.keys(rawRows[0]).map((k) =>
            k.trim().toLowerCase(),
        );
        if (!headerKeys.includes('name')) {
            throw new BadRequestException(
                `Missing required column "name". Expected columns: ${EXCEL_HEADERS.join(
                    ', ',
                )}.`,
            );
        }

        // Existing categories for this company — case-insensitive name lookup.
        const existing = await this.categoryRepository.findByCompanyId(
            companyId,
        );
        const existingByName = new Map<string, any>();
        for (const c of existing) {
            existingByName.set(c.name.trim().toLowerCase(), c);
        }

        const seenInFile = new Set<string>();
        const rows: CategoryImportRow[] = [];

        for (let i = 0; i < rawRows.length; i++) {
            const raw = rawRows[i];
            const rowNum = i + 2; // 1-indexed + header row
            const errors: string[] = [];

            // Case-insensitive column access.
            const get = (col: string): string => {
                const key = Object.keys(raw).find(
                    (k) => k.trim().toLowerCase() === col,
                );
                return key ? String(raw[key] ?? '').trim() : '';
            };

            const name = get('name');
            const description = get('description');
            const statusRaw = get('status').toLowerCase();

            if (!name) {
                errors.push('Name is required');
            } else if (name.length < 2) {
                errors.push('Name must be at least 2 characters');
            } else if (name.length > 150) {
                errors.push('Name must not exceed 150 characters');
            }

            let status = ENUM_CATEGORY_STATUS.ACTIVE;
            if (statusRaw) {
                if (statusRaw === 'active' || statusRaw === 'inactive') {
                    status = statusRaw as ENUM_CATEGORY_STATUS;
                } else {
                    errors.push("Status must be 'active' or 'inactive'");
                }
            }

            const nameKey = name.toLowerCase();
            if (name && seenInFile.has(nameKey)) {
                errors.push('Duplicate name in file');
            }
            if (name) seenInFile.add(nameKey);

            let rowStatus: 'valid_new' | 'valid_update' | 'error' = 'valid_new';
            let existingId: string | undefined;
            if (name && existingByName.has(nameKey)) {
                existingId = existingByName.get(nameKey)._id.toString();
                rowStatus = 'valid_update';
            }
            if (errors.length > 0) rowStatus = 'error';

            rows.push({
                rowNum,
                data: { name, description, status },
                status: rowStatus,
                existingId,
                errors,
            });
        }

        const summary = {
            total: rows.length,
            valid_new: rows.filter((r) => r.status === 'valid_new').length,
            valid_update: rows.filter((r) => r.status === 'valid_update')
                .length,
            errors: rows.filter((r) => r.status === 'error').length,
        };

        return { summary, rows };
    }

    /** Persist the validated rows. One bad row never aborts the batch. */
    async importCategories(
        rows: CategoryImportRow[],
        companyId: string,
        userId: string,
    ): Promise<{
        created: number;
        updated: number;
        errors: { row: number; message: string }[];
    }> {
        let created = 0;
        let updated = 0;
        const errors: { row: number; message: string }[] = [];

        for (const row of rows) {
            if (row.status === 'error') continue;

            try {
                const isActive =
                    row.data.status === ENUM_CATEGORY_STATUS.ACTIVE;

                if (row.status === 'valid_update' && row.existingId) {
                    const existing = await this.categoryService.findOneById(
                        row.existingId,
                    );
                    const updateData: any = {
                        name: row.data.name,
                        status: row.data.status,
                        is_active: isActive,
                    };
                    if (row.data.description) {
                        updateData.description = row.data.description;
                    }
                    await this.categoryService.update(existing, updateData);
                    updated++;
                } else {
                    await this.categoryService.create(
                        companyId,
                        {
                            name: row.data.name,
                            description: row.data.description || undefined,
                            status: row.data.status,
                            is_active: isActive,
                        },
                        userId,
                    );
                    created++;
                }
            } catch (err) {
                this.logger.error(
                    `Import row ${row.rowNum} failed: ${err.message}`,
                );
                errors.push({ row: row.rowNum, message: err.message });
            }
        }

        return { created, updated, errors };
    }
}
