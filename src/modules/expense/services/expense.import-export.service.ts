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
import { ExpenseService } from './expense.service';
import { ExpenseRepository } from '../repository/repositories/expense.repository';
import { ENUM_EXPENSE_STATUS, ENUM_EXPENSE_TYPE } from '../enums/expense.enum';

/**
 * Expense Excel import/export — mirror of the Rebate importer. An expense is a
 * flat company-scoped master (name, code, type, value, status); single sheet,
 * no children.
 *
 * Match key is `code` (the stable business key; `name` is an editable label),
 * so on update the code is NOT re-sent. The value lives in the `value` column
 * on both the entity and the sheet.
 */
const EXCEL_HEADERS = ['code', 'name', 'type', 'value', 'status'];
const SHEET_NAME = 'Expenses';

const SAMPLE_ROWS = [
    {
        code: 'FRT',
        name: 'Freight',
        type: 'fixed',
        value: 1200,
        status: 'active',
    },
    {
        code: 'INS',
        name: 'Insurance',
        type: 'percent',
        value: 1.5,
        status: 'active',
    },
];

export interface ExpenseImportData {
    code: string;
    name: string;
    type: ENUM_EXPENSE_TYPE;
    value: number;
    status: ENUM_EXPENSE_STATUS;
}

export type ExpenseImportRow = MasterImportRow<ExpenseImportData>;

@Injectable()
export class ExpenseImportExportService {
    private readonly logger = new Logger(ExpenseImportExportService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly expenseService: ExpenseService,
        private readonly expenseRepository: ExpenseRepository
    ) {}

    /** Sample Excel file with headers + example rows. */
    generateSampleExcel(): Buffer {
        return this.fileService.writeExcel([
            { data: SAMPLE_ROWS, sheetName: SHEET_NAME },
        ]);
    }

    /** Export all of a company's expenses (active AND inactive) as an Excel buffer. */
    async exportExpenses(companyId: string): Promise<Buffer> {
        // Active + inactive, so a re-import of the export is never a purge.
        const expenses = await this.expenseRepository.findByCompanyId(companyId, {
            order: { name: 'asc' as any },
        });

        const rows = expenses.map((e) => ({
            code: e.code || '',
            name: e.name || '',
            type: e.type || ENUM_EXPENSE_TYPE.PERCENT,
            value: e.value ?? '',
            status: e.is_active
                ? ENUM_EXPENSE_STATUS.ACTIVE
                : ENUM_EXPENSE_STATUS.INACTIVE,
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
    ): Promise<{ summary: any; rows: ExpenseImportRow[] }> {
        const rawRows = readSheetRows(this.fileService, fileBuffer, {
            headers: EXCEL_HEADERS,
        });
        assertRequiredHeader(rawRows, ['code'], EXCEL_HEADERS);

        // Existing expenses for this company — case-insensitive code lookup.
        const existing = await this.expenseRepository.findByCompanyId(companyId);
        const existingByCode = indexBy(existing, (e: any) =>
            e.code.trim().toLowerCase()
        );

        const seenInFile = new Set<string>();
        const rows: ExpenseImportRow[] = [];

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
            let type = ENUM_EXPENSE_TYPE.PERCENT;
            if (typeRaw) {
                if (
                    typeRaw === ENUM_EXPENSE_TYPE.PERCENT ||
                    typeRaw === ENUM_EXPENSE_TYPE.FIXED
                ) {
                    type = typeRaw as ENUM_EXPENSE_TYPE;
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

            let status = ENUM_EXPENSE_STATUS.ACTIVE;
            if (statusRaw) {
                if (statusRaw === 'active' || statusRaw === 'inactive') {
                    status = statusRaw as ENUM_EXPENSE_STATUS;
                } else {
                    errors.push("Status must be 'active' or 'inactive'");
                }
            }

            const codeKey = code.toLowerCase();
            if (code && seenInFile.has(codeKey)) {
                errors.push('Duplicate code in file');
            }
            if (code) seenInFile.add(codeKey);

            let rowStatus: ExpenseImportRow['status'] = 'valid_new';
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
    async importExpenses(
        rows: ExpenseImportRow[],
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
                    const existing = await this.expenseService.findOneById(
                        existingId
                    );
                    // `code` is the match key and is NOT re-sent.
                    return this.expenseService.update(existing, {
                        name: row.data.name,
                        type: row.data.type,
                        value: row.data.value,
                        status: row.data.status,
                        is_active:
                            row.data.status === ENUM_EXPENSE_STATUS.ACTIVE,
                    } as any);
                },
                create: async (row) =>
                    this.expenseService.create(
                        companyId,
                        {
                            code: row.data.code,
                            name: row.data.name,
                            type: row.data.type,
                            value: row.data.value,
                            status: row.data.status,
                            is_active:
                                row.data.status === ENUM_EXPENSE_STATUS.ACTIVE,
                        } as any,
                        userId
                    ),
            },
            this.logger
        );
    }
}
