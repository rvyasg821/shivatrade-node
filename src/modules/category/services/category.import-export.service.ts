import { Injectable, Logger } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import {
    assertRequiredHeader,
    cellReader,
    indexBy,
    MasterImportRow,
    readSheetRows,
    resolveMatch,
    runMasterImport,
    summarise,
} from '@common/import/master-import.helper';
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

export interface CategoryImportData {
    name: string;
    description: string;
    status: ENUM_CATEGORY_STATUS;
}

export type CategoryImportRow = MasterImportRow<CategoryImportData>;

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
        const rawRows = readSheetRows(this.fileService, fileBuffer, {
            headers: EXCEL_HEADERS,
        });
        assertRequiredHeader(rawRows, ['name'], EXCEL_HEADERS);

        // Existing categories for this company — case-insensitive name lookup.
        const existing = await this.categoryRepository.findByCompanyId(
            companyId,
        );
        const existingByName = indexBy(existing, (c: any) =>
            c.name.trim().toLowerCase(),
        );

        const seenInFile = new Set<string>();
        const rows: CategoryImportRow[] = [];

        for (let i = 0; i < rawRows.length; i++) {
            const rowNum = i + 2; // 1-indexed + header row
            const errors: string[] = [];
            const get = cellReader(rawRows[i]);

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

            let rowStatus: CategoryImportRow['status'] = 'valid_new';
            let existingId: string | undefined;
            if (name) {
                const match = resolveMatch(
                    nameKey,
                    existingByName,
                    `'${name}'`,
                );
                if (match.error) errors.push(match.error);
                else if (match.existingId) {
                    existingId = match.existingId;
                    rowStatus = 'valid_update';
                }
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

        return { summary: summarise(rows), rows };
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
        return runMasterImport(
            rows,
            {
                update: async (row, existingId) => {
                    const existing = await this.categoryService.findOneById(
                        existingId,
                    );
                    const updateData: any = {
                        name: row.data.name,
                        status: row.data.status,
                        is_active:
                            row.data.status === ENUM_CATEGORY_STATUS.ACTIVE,
                    };
                    if (row.data.description) {
                        updateData.description = row.data.description;
                    }
                    return this.categoryService.update(existing, updateData);
                },
                create: async (row) =>
                    this.categoryService.create(
                        companyId,
                        {
                            name: row.data.name,
                            description: row.data.description || undefined,
                            status: row.data.status,
                            is_active:
                                row.data.status === ENUM_CATEGORY_STATUS.ACTIVE,
                        },
                        userId,
                    ),
            },
            this.logger,
        );
    }
}
