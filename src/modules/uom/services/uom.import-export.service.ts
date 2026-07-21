import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
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

export interface UomImportRow {
    rowNum: number;
    data: {
        code: string;
        name?: string;
        uqc_code?: string;
        allow_decimal: boolean;
        sort_order: number;
        status: ENUM_UOM_STATUS;
    };
    status: 'valid_new' | 'valid_update' | 'error';
    existingId?: string;
    errors: string[];
}

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
        let sheets;
        try {
            sheets = this.fileService.readExcel(fileBuffer);
        } catch {
            throw new BadRequestException(
                'Unable to read the file. Please upload a valid Excel or CSV file.'
            );
        }

        const rawRows = (sheets?.[0]?.data || []) as Record<string, any>[];
        if (!rawRows.length) {
            throw new BadRequestException('The file contains no data rows.');
        }

        const headerKeys = Object.keys(rawRows[0]).map((k) =>
            k.trim().toLowerCase()
        );
        if (!headerKeys.includes('code')) {
            throw new BadRequestException(
                `Missing required column "code". Expected columns: ${EXCEL_HEADERS.join(
                    ', '
                )}.`
            );
        }

        // Existing units — case-insensitive code lookup, mirroring
        // UomRepository.findByCode.
        const [existing] = await this.uomRepository.findForList({
            limit: 10000,
            offset: 0,
        });
        const existingByCode = new Map<string, any>();
        for (const u of existing) {
            existingByCode.set(u.code.trim().toLowerCase(), u);
        }

        const seenInFile = new Set<string>();
        const rows: UomImportRow[] = [];

        for (let i = 0; i < rawRows.length; i++) {
            const raw = rawRows[i];
            const rowNum = i + 2; // 1-indexed + header row
            const errors: string[] = [];

            // Case-insensitive column access. Strips outer whitespace
            // (including non-breaking spaces) and collapses internal runs —
            // Excel cells often arrive with pasted padding.
            const get = (col: string): string => {
                const key = Object.keys(raw).find(
                    (k) => k.trim().toLowerCase() === col
                );
                if (!key) return '';
                return String(raw[key] ?? '')
                    .replace(/ /g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            };

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

            let rowStatus: 'valid_new' | 'valid_update' | 'error' = 'valid_new';
            let existingId: string | undefined;
            if (code && existingByCode.has(codeKey)) {
                existingId = existingByCode.get(codeKey)._id.toString();
                rowStatus = 'valid_update';
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
    async importUoms(rows: UomImportRow[]): Promise<{
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
                if (row.status === 'valid_update' && row.existingId) {
                    const existing = await this.uomService.findOneById(
                        row.existingId
                    );
                    // `code` is deliberately NOT sent: it is the match key, and
                    // UomService.update refuses to rename a code that products
                    // already store. Sending the same code would be a no-op at
                    // best and a hard error on a case difference.
                    await this.uomService.update(existing, {
                        name: row.data.name,
                        uqc_code: row.data.uqc_code,
                        allow_decimal: row.data.allow_decimal,
                        sort_order: row.data.sort_order,
                        status: row.data.status,
                    });
                    updated++;
                } else {
                    await this.uomService.create({
                        code: row.data.code,
                        name: row.data.name,
                        uqc_code: row.data.uqc_code,
                        allow_decimal: row.data.allow_decimal,
                        sort_order: row.data.sort_order,
                        status: row.data.status,
                    });
                    created++;
                }
            } catch (err) {
                this.logger.error(
                    `Import row ${row.rowNum} failed: ${err.message}`
                );
                errors.push({ row: row.rowNum, message: err.message });
            }
        }

        return { created, updated, errors };
    }
}
