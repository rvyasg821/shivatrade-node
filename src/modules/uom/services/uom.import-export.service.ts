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
import { UomService } from './uom.service';
import { UomRepository } from '../repository/repositories/uom.repository';
import { ENUM_UOM_STATUS } from '../enums/uom.enum';

/**
 * UOM Excel import/export — same shape as the Category one, with two
 * differences that come from the master itself:
 *
 *  - UOM is GLOBAL reference data (no `company_id`), so nothing here is
 *    company-scoped.
 *  - The key is `code`, matched CASE-INSENSITIVELY but stored VERBATIM. Codes
 *    are loose text on every product and document line ("KG", "Nos", "Tonne" —
 *    mixed case on purpose), so uppercasing an existing code on import would
 *    make the master disagree with the data it describes.
 */
const EXCEL_HEADERS = [
    'code',
    'name',
    'uqc_code',
    'allow_decimal',
    'sort_order',
    'status',
];
const SHEET_NAME = 'UOM';

const SAMPLE_ROWS = [
    {
        code: 'KG',
        name: 'Kilogram',
        uqc_code: 'KGS',
        allow_decimal: 'yes',
        sort_order: 1,
        status: 'ACTIVE',
    },
    {
        code: 'Nos',
        name: 'Numbers',
        uqc_code: 'NOS',
        // Countable — you cannot ship 2.5 of them.
        allow_decimal: 'no',
        sort_order: 2,
        status: 'ACTIVE',
    },
];

const YES = new Set(['yes', 'y', 'true', '1']);
const NO = new Set(['no', 'n', 'false', '0']);

export interface UomImportData {
    code: string;
    name?: string;
    uqc_code?: string;
    allow_decimal: boolean;
    sort_order: number;
    status: ENUM_UOM_STATUS;
}

export type UomImportRow = MasterImportRow<UomImportData>;

@Injectable()
export class UomImportExportService {
    private readonly logger = new Logger(UomImportExportService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly uomService: UomService,
        private readonly uomRepository: UomRepository
    ) {}

    /** Sample Excel file with headers + example rows. */
    generateSampleExcel(): Buffer {
        return this.fileService.writeExcel([
            { data: SAMPLE_ROWS, sheetName: SHEET_NAME },
        ]);
    }

    /** Export every unit (active AND inactive) as an Excel buffer. */
    async exportUoms(): Promise<Buffer> {
        // Not `findForDropdown` — that filters to ACTIVE, which would quietly
        // drop the inactive units and make a re-import look like a purge.
        const [units] = await this.uomRepository.findForList({
            limit: 10000,
            offset: 0,
        });

        const rows = units.map((u) => ({
            code: u.code || '',
            name: u.name || '',
            uqc_code: u.uqc_code || '',
            allow_decimal: u.allow_decimal ? 'yes' : 'no',
            sort_order: u.sort_order ?? 0,
            status: u.status || ENUM_UOM_STATUS.ACTIVE,
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
        fileBuffer: Buffer
    ): Promise<{ summary: any; rows: UomImportRow[] }> {
        const rawRows = readSheetRows(this.fileService, fileBuffer, {
            headers: EXCEL_HEADERS,
        });
        assertRequiredHeader(rawRows, ['code'], EXCEL_HEADERS);

        // Existing units — case-insensitive code lookup, mirroring
        // UomRepository.findByCode.
        const [existing] = await this.uomRepository.findForList({
            limit: 10000,
            offset: 0,
        });
        const existingByCode = indexBy(existing, (u: any) =>
            u.code.trim().toLowerCase()
        );

        const seenInFile = new Set<string>();
        const rows: UomImportRow[] = [];

        for (let i = 0; i < rawRows.length; i++) {
            const rowNum = i + 2; // 1-indexed + header row
            const errors: string[] = [];
            const get = cellReader(rawRows[i]);

            const code = get('code');
            const name = get('name');
            const uqcCode = get('uqc_code');
            const allowRaw = get('allow_decimal').toLowerCase();
            const sortRaw = get('sort_order');
            const statusRaw = get('status').toUpperCase();

            if (!code) {
                errors.push('Code is required');
            } else if (code.length > 30) {
                errors.push('Code must not exceed 30 characters');
            }
            if (name && name.length > 100) {
                errors.push('Name must not exceed 100 characters');
            }
            if (uqcCode && uqcCode.length > 10) {
                errors.push('UQC code must not exceed 10 characters');
            }

            // Blank = true, matching the entity default.
            let allowDecimal = true;
            if (allowRaw) {
                if (YES.has(allowRaw)) allowDecimal = true;
                else if (NO.has(allowRaw)) allowDecimal = false;
                else errors.push("allow_decimal must be 'yes' or 'no'");
            }

            let sortOrder = 0;
            if (sortRaw) {
                const nSort = Number(sortRaw);
                if (!Number.isInteger(nSort)) {
                    errors.push('sort_order must be a whole number');
                } else {
                    sortOrder = nSort;
                }
            }

            let status = ENUM_UOM_STATUS.ACTIVE;
            if (statusRaw) {
                if (
                    statusRaw === ENUM_UOM_STATUS.ACTIVE ||
                    statusRaw === ENUM_UOM_STATUS.INACTIVE
                ) {
                    status = statusRaw as ENUM_UOM_STATUS;
                } else {
                    errors.push("Status must be 'ACTIVE' or 'INACTIVE'");
                }
            }

            const codeKey = code.toLowerCase();
            if (code && seenInFile.has(codeKey)) {
                errors.push('Duplicate code in file');
            }
            if (code) seenInFile.add(codeKey);

            let rowStatus: UomImportRow['status'] = 'valid_new';
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
                data: {
                    code,
                    name: name || undefined,
                    uqc_code: uqcCode || undefined,
                    allow_decimal: allowDecimal,
                    sort_order: sortOrder,
                    status,
                },
                status: rowStatus,
                existingId,
                errors,
            });
        }

        return { summary: summarise(rows), rows };
    }

    /** Persist the validated rows. One bad row never aborts the batch. */
    async importUoms(rows: UomImportRow[]): Promise<{
        created: number;
        updated: number;
        errors: { row: number; message: string }[];
    }> {
        return runMasterImport(
            rows,
            {
                update: async (row, existingId) => {
                    const existing = await this.uomService.findOneById(
                        existingId
                    );
                    // `code` is deliberately NOT sent: it is the match key, and
                    // UomService.update refuses to rename a code that products
                    // already store. Sending the same code would be a no-op at
                    // best and a hard error on a case difference.
                    return this.uomService.update(existing, {
                        name: row.data.name,
                        uqc_code: row.data.uqc_code,
                        allow_decimal: row.data.allow_decimal,
                        sort_order: row.data.sort_order,
                        status: row.data.status,
                    });
                },
                create: async (row) =>
                    this.uomService.create({
                        code: row.data.code,
                        name: row.data.name,
                        uqc_code: row.data.uqc_code,
                        allow_decimal: row.data.allow_decimal,
                        sort_order: row.data.sort_order,
                        status: row.data.status,
                    }),
            },
            this.logger
        );
    }
}
