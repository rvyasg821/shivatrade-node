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
import { VendorCategoryService } from './vendor-category.service';
import { VendorCategoryMasterRepository } from '../repository/repositories/vendor-category.repository';
import { ENUM_VENDOR_CATEGORY_STATUS } from '../enums/vendor-category.enum';

const EXCEL_HEADERS = ['code', 'name', 'description', 'status'];
const SHEET_NAME = 'VendorCategories';

const SAMPLE_ROWS = [
    {
        code: 'RAW',
        name: 'Raw Material',
        description: 'Suppliers of raw materials',
        status: 'active',
    },
    {
        code: 'LOG',
        name: 'Logistics',
        description: 'Freight and transport vendors',
        status: 'inactive',
    },
];

export interface VendorCategoryImportData {
    code: string;
    name: string;
    description: string;
    status: ENUM_VENDOR_CATEGORY_STATUS;
}

export type VendorCategoryImportRow = MasterImportRow<VendorCategoryImportData>;

@Injectable()
export class VendorCategoryImportExportService {
    private readonly logger = new Logger(VendorCategoryImportExportService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly vendorCategoryService: VendorCategoryService,
        private readonly vendorCategoryRepository: VendorCategoryMasterRepository
    ) {}

    /** Sample Excel file with headers + example rows. */
    generateSampleExcel(): Buffer {
        return this.fileService.writeExcel([
            { data: SAMPLE_ROWS, sheetName: SHEET_NAME },
        ]);
    }

    /** Export all of a company's vendor categories as an Excel buffer. */
    async exportVendorCategories(companyId: string): Promise<Buffer> {
        const vendorCategories =
            await this.vendorCategoryRepository.findByCompanyId(companyId, {
                order: { name: 'asc' as any },
            });

        const rows = vendorCategories.map((c) => ({
            code: c.code || '',
            name: c.name || '',
            description: c.description || '',
            status: c.is_active
                ? ENUM_VENDOR_CATEGORY_STATUS.ACTIVE
                : ENUM_VENDOR_CATEGORY_STATUS.INACTIVE,
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
     *
     * Rows are matched (upsert) against existing records by `code`.
     */
    async parseAndValidate(
        fileBuffer: Buffer,
        companyId: string
    ): Promise<{ summary: any; rows: VendorCategoryImportRow[] }> {
        const rawRows = readSheetRows(this.fileService, fileBuffer, {
            headers: EXCEL_HEADERS,
        });
        assertRequiredHeader(rawRows, ['code', 'name'], EXCEL_HEADERS);

        // Existing vendor categories for this company — case-insensitive code
        // lookup.
        const existing = await this.vendorCategoryRepository.findByCompanyId(
            companyId
        );
        const existingByCode = indexBy(
            existing.filter((c: any) => c.code),
            (c: any) => c.code.trim().toLowerCase()
        );

        const seenInFile = new Set<string>();
        const rows: VendorCategoryImportRow[] = [];

        for (let i = 0; i < rawRows.length; i++) {
            const rowNum = i + 2; // 1-indexed + header row
            const errors: string[] = [];
            const get = cellReader(rawRows[i]);

            const code = get('code');
            const name = get('name');
            const description = get('description');
            const statusRaw = get('status').toLowerCase();

            if (!code) {
                errors.push('Code is required');
            } else if (code.length > 50) {
                errors.push('Code must not exceed 50 characters');
            }

            if (!name) {
                errors.push('Name is required');
            } else if (name.length < 2) {
                errors.push('Name must be at least 2 characters');
            } else if (name.length > 150) {
                errors.push('Name must not exceed 150 characters');
            }

            let status = ENUM_VENDOR_CATEGORY_STATUS.ACTIVE;
            if (statusRaw) {
                if (statusRaw === 'active' || statusRaw === 'inactive') {
                    status = statusRaw as ENUM_VENDOR_CATEGORY_STATUS;
                } else {
                    errors.push("Status must be 'active' or 'inactive'");
                }
            }

            const codeKey = code.toLowerCase();
            if (code && seenInFile.has(codeKey)) {
                errors.push('Duplicate code in file');
            }
            if (code) seenInFile.add(codeKey);

            let rowStatus: VendorCategoryImportRow['status'] = 'valid_new';
            let existingId: string | undefined;
            if (code) {
                const match = resolveMatch(
                    codeKey,
                    existingByCode,
                    `'${code}'`
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
                data: { code, name, description, status },
                status: rowStatus,
                existingId,
                errors,
            });
        }

        return { summary: summarise(rows), rows };
    }

    /** Persist the validated rows. One bad row never aborts the batch. */
    async importVendorCategories(
        rows: VendorCategoryImportRow[],
        companyId: string,
        userId: string
    ): Promise<{
        created: number;
        updated: number;
        errors: { row: number; message: string }[];
    }> {
        return runMasterImport(
            rows,
            {
                update: async (row, existingId) => {
                    const existing =
                        await this.vendorCategoryService.findOneById(
                            existingId
                        );
                    const updateData: any = {
                        code: row.data.code,
                        name: row.data.name,
                        status: row.data.status,
                        is_active:
                            row.data.status ===
                            ENUM_VENDOR_CATEGORY_STATUS.ACTIVE,
                    };
                    if (row.data.description) {
                        updateData.description = row.data.description;
                    }
                    return this.vendorCategoryService.update(
                        existing,
                        updateData
                    );
                },
                create: async (row) =>
                    this.vendorCategoryService.create(
                        companyId,
                        {
                            code: row.data.code,
                            name: row.data.name,
                            description: row.data.description || undefined,
                            status: row.data.status,
                            is_active:
                                row.data.status ===
                                ENUM_VENDOR_CATEGORY_STATUS.ACTIVE,
                        },
                        userId
                    ),
            },
            this.logger
        );
    }
}
