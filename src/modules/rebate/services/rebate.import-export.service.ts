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
import { RebateService } from './rebate.service';
import { RebateRepository } from '../repository/repositories/rebate.repository';
import { ENUM_REBATE_STATUS, ENUM_REBATE_TYPE } from '../enums/rebate.enum';

/**
 * Rebate Excel import/export — same shape as the Category one, on the shared
 * `master-import.helper`. A rebate is a flat company-scoped master (name, code,
 * type, value, status), so this is a single sheet with no children.
 *
 * The match key is `code` (not `name`): both are unique per company, but the
 * code is the stable 30-char business key while the name is a human label the
 * client may reword. On update the code is therefore NOT re-sent — it is the
 * key, and RebateService.update would reject a code collision anyway.
 *
 * The value lives in the `pct` column on the entity; on the sheet it is simply
 * `value` (the UI labels it "Value" for both rebates and expenses).
 */
const EXCEL_HEADERS = ['code', 'name', 'type', 'value', 'status'];
const SHEET_NAME = 'Rebates';

const SAMPLE_ROWS = [
    {
        code: 'COMM',
        name: 'Sales Commission',
        type: 'percent',
        value: 2.5,
        status: 'active',
    },
    {
        code: 'DISC-FLAT',
        name: 'Flat Trade Discount',
        type: 'fixed',
        value: 500,
        status: 'active',
    },
];

export interface RebateImportData {
    code: string;
    name: string;
    type: ENUM_REBATE_TYPE;
    value: number;
    status: ENUM_REBATE_STATUS;
}

export type RebateImportRow = MasterImportRow<RebateImportData>;

@Injectable()
export class RebateImportExportService {
    private readonly logger = new Logger(RebateImportExportService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly rebateService: RebateService,
        private readonly rebateRepository: RebateRepository
    ) {}

    /** Sample Excel file with headers + example rows. */
    generateSampleExcel(): Buffer {
        return this.fileService.writeExcel([
            { data: SAMPLE_ROWS, sheetName: SHEET_NAME },
        ]);
    }

    /** Export all of a company's rebates (active AND inactive) as an Excel buffer. */
    async exportRebates(companyId: string): Promise<Buffer> {
        // Active + inactive, so a re-import of the export is never a purge.
        const rebates = await this.rebateRepository.findByCompanyId(companyId, {
            order: { name: 'asc' as any },
        });

        const rows = rebates.map((r) => ({
            code: r.code || '',
            name: r.name || '',
            type: r.type || ENUM_REBATE_TYPE.PERCENT,
            value: r.pct ?? '',
            status: r.is_active
                ? ENUM_REBATE_STATUS.ACTIVE
                : ENUM_REBATE_STATUS.INACTIVE,
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
        companyId: string
    ): Promise<{ summary: any; rows: RebateImportRow[] }> {
        const rawRows = readSheetRows(this.fileService, fileBuffer, {
            headers: EXCEL_HEADERS,
        });
        assertRequiredHeader(rawRows, ['code'], EXCEL_HEADERS);

        // Existing rebates for this company — case-insensitive code lookup.
        const existing = await this.rebateRepository.findByCompanyId(companyId);
        const existingByCode = indexBy(existing, (r: any) =>
            r.code.trim().toLowerCase()
        );

        const seenInFile = new Set<string>();
        const rows: RebateImportRow[] = [];

        for (let i = 0; i < rawRows.length; i++) {
            const rowNum = i + 2; // 1-indexed + header row
            const errors: string[] = [];
            const get = cellReader(rawRows[i]);

            const code = get('code');
            const name = get('name');
            const typeRaw = get('type').toLowerCase();
            const valueRaw = get('value');
            const statusRaw = get('status').toLowerCase();

            if (!code) {
                errors.push('Code is required');
            } else if (code.length > 30) {
                errors.push('Code must not exceed 30 characters');
            }

            if (!name) {
                errors.push('Name is required');
            } else if (name.length < 2) {
                errors.push('Name must be at least 2 characters');
            } else if (name.length > 150) {
                errors.push('Name must not exceed 150 characters');
            }

            // Blank = percent, matching the entity default.
            let type = ENUM_REBATE_TYPE.PERCENT;
            if (typeRaw) {
                if (
                    typeRaw === ENUM_REBATE_TYPE.PERCENT ||
                    typeRaw === ENUM_REBATE_TYPE.FIXED
                ) {
                    type = typeRaw as ENUM_REBATE_TYPE;
                } else {
                    errors.push("Type must be 'percent' or 'fixed'");
                }
            }

            let value = 0;
            if (!valueRaw) {
                errors.push('Value is required');
            } else {
                const n = Number(valueRaw);
                if (!Number.isFinite(n)) {
                    errors.push('Value must be a number');
                } else if (n < 0) {
                    errors.push('Value must not be negative');
                } else {
                    value = Math.round(n * 100) / 100;
                }
            }

            let status = ENUM_REBATE_STATUS.ACTIVE;
            if (statusRaw) {
                if (statusRaw === 'active' || statusRaw === 'inactive') {
                    status = statusRaw as ENUM_REBATE_STATUS;
                } else {
                    errors.push("Status must be 'active' or 'inactive'");
                }
            }

            const codeKey = code.toLowerCase();
            if (code && seenInFile.has(codeKey)) {
                errors.push('Duplicate code in file');
            }
            if (code) seenInFile.add(codeKey);

            let rowStatus: RebateImportRow['status'] = 'valid_new';
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
                data: { code, name, type, value, status },
                status: rowStatus,
                existingId,
                errors,
            });
        }

        return { summary: summarise(rows), rows };
    }

    /** Persist the validated rows. One bad row never aborts the batch. */
    async importRebates(
        rows: RebateImportRow[],
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
                    const existing = await this.rebateService.findOneById(
                        existingId
                    );
                    // `code` is the match key and is NOT re-sent — the service
                    // refuses a code rename against another rebate anyway.
                    return this.rebateService.update(existing, {
                        name: row.data.name,
                        type: row.data.type,
                        pct: row.data.value,
                        status: row.data.status,
                        is_active:
                            row.data.status === ENUM_REBATE_STATUS.ACTIVE,
                    } as any);
                },
                create: async (row) =>
                    this.rebateService.create(
                        companyId,
                        {
                            code: row.data.code,
                            name: row.data.name,
                            type: row.data.type,
                            pct: row.data.value,
                            status: row.data.status,
                            is_active:
                                row.data.status === ENUM_REBATE_STATUS.ACTIVE,
                        } as any,
                        userId
                    ),
            },
            this.logger
        );
    }
}
