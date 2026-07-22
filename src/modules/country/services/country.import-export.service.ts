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
import { CountryService } from './country.service';
import { CountryRepository } from '../repository/repositories/country.repository';
import { CountryDoc } from '../repository/entities/country.entity';
import { ENUM_COUNTRY_STATUS } from '../enums/country.enum';

/**
 * Country Excel import/export.
 *
 * Countries are SHARED reference data — no `company_id` — so an import here is
 * visible to every company on the instance. That is why nothing in this file
 * deletes or renames: `name` is the match key, and states, cities and thousands
 * of free-text address rows are pinned to it.
 *
 * `slug` is not a sheet column. It is derived from the name by
 * `CountryService.create/update`, and letting a spreadsheet set it would let the
 * two drift apart.
 */
const EXCEL_HEADERS = [
    'name',
    'country_code',
    'currency_code',
    'time_zone',
    'status',
];
const SHEET_NAME = 'Countries';

/** §15 D-12 — preview hands every row back to the browser. */
const MAX_ROWS = 5000;

const SAMPLE_ROWS = [
    {
        name: 'India',
        country_code: 'IN',
        currency_code: 'INR',
        time_zone: 'Asia/Kolkata',
        status: 'ACTIVE',
    },
    {
        name: 'United Arab Emirates',
        country_code: 'AE',
        currency_code: 'AED',
        time_zone: 'Asia/Dubai',
        status: 'ACTIVE',
    },
];

export interface CountryImportData {
    name: string;
    country_code?: string;
    currency_code?: string;
    time_zone?: string;
    status: ENUM_COUNTRY_STATUS;
}

export type CountryImportRow = MasterImportRow<CountryImportData>;

@Injectable()
export class CountryImportExportService {
    private readonly logger = new Logger(CountryImportExportService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly countryService: CountryService,
        private readonly countryRepository: CountryRepository
    ) {}

    /** Sample Excel file with headers + example rows. */
    generateSampleExcel(): Buffer {
        return this.fileService.writeExcel([
            { data: SAMPLE_ROWS, sheetName: SHEET_NAME },
        ]);
    }

    /**
     * Export every country as an Excel buffer.
     *
     * Deliberately unfiltered — INACTIVE and BLOCKED rows are included, so a
     * round-trip (export, edit, re-import) cannot look like a purge of the
     * rows the on-screen filter happened to be hiding.
     */
    async exportCountries(): Promise<Buffer> {
        const countries = await this.loadAll();

        const rows = countries.map((c) => ({
            name: c.name || '',
            country_code: c.country_code || '',
            currency_code: c.currency_code || '',
            time_zone: c.time_zone || '',
            status: c.status || ENUM_COUNTRY_STATUS.ACTIVE,
        }));

        if (rows.length === 0) {
            return this.fileService.writeExcelFromArray([EXCEL_HEADERS]);
        }

        return this.fileService.writeExcel([
            { data: rows, sheetName: SHEET_NAME },
        ]);
    }

    /** Every live country, name-sorted. ~250 rows — one query, sorted here. */
    private async loadAll(): Promise<CountryDoc[]> {
        const rows = await this.countryRepository.findAll({});
        return rows.sort((a, b) =>
            (a.name || '').localeCompare(b.name || '')
        );
    }

    /**
     * Parse + validate an uploaded file. Never throws on row-level problems —
     * those are collected into each row's `errors`. Only file-level problems
     * (unreadable / empty / missing header / too many rows) throw.
     */
    async parseAndValidate(
        fileBuffer: Buffer
    ): Promise<{ summary: any; rows: CountryImportRow[] }> {
        const rawRows = readSheetRows(this.fileService, fileBuffer, {
            maxRows: MAX_ROWS,
            headers: EXCEL_HEADERS,
        });
        assertRequiredHeader(rawRows, ['name'], EXCEL_HEADERS);

        const existingByName = indexBy(await this.loadAll(), (c) =>
            (c.name || '').trim().toLowerCase()
        );

        const seenInFile = new Set<string>();
        const rows: CountryImportRow[] = [];

        for (let i = 0; i < rawRows.length; i++) {
            const rowNum = i + 2; // 1-indexed + header row
            const errors: string[] = [];
            const get = cellReader(rawRows[i]);

            const name = get('name');
            const countryCode = get('country_code').toUpperCase();
            const currencyCode = get('currency_code').toUpperCase();
            const timeZone = get('time_zone');
            const statusRaw = get('status').toUpperCase();

            if (!name) {
                errors.push('Name is required');
            } else if (name.length > 100) {
                errors.push('Name must not exceed 100 characters');
            }
            if (countryCode && countryCode.length > 10) {
                errors.push('Country code must not exceed 10 characters');
            }
            if (currencyCode && currencyCode.length > 20) {
                errors.push('Currency code must not exceed 20 characters');
            }
            if (timeZone && timeZone.length > 100) {
                errors.push('Time zone must not exceed 100 characters');
            }

            let status = ENUM_COUNTRY_STATUS.ACTIVE;
            if (statusRaw) {
                if (
                    (Object.values(ENUM_COUNTRY_STATUS) as string[]).includes(
                        statusRaw
                    )
                ) {
                    status = statusRaw as ENUM_COUNTRY_STATUS;
                } else {
                    // BLOCKED is a real country status, and export emits it —
                    // refusing it here would make a round-trip fail.
                    errors.push(
                        "Status must be 'ACTIVE', 'INACTIVE' or 'BLOCKED'"
                    );
                }
            }

            const nameKey = name.toLowerCase();
            if (name && seenInFile.has(nameKey)) {
                errors.push('Duplicate name in file');
            }
            if (name) seenInFile.add(nameKey);

            let rowStatus: CountryImportRow['status'] = 'valid_new';
            let existingId: string | undefined;
            if (name) {
                const match = resolveMatch(
                    nameKey,
                    existingByName,
                    `'${name}'`
                );
                if (match.error) errors.push(match.error);
                else if (match.existingId) {
                    existingId = match.existingId;
                    rowStatus = 'valid_update';
                }
            }

            // Both are NOT NULL on the entity, so a NEW row must carry them.
            // On an update a blank cell means "leave it alone" (§15 D-10), and
            // the existing value stays put.
            if (rowStatus === 'valid_new') {
                if (!countryCode) errors.push('Country code is required');
                if (!currencyCode) errors.push('Currency code is required');
            }

            if (errors.length > 0) rowStatus = 'error';

            rows.push({
                rowNum,
                data: {
                    name,
                    country_code: countryCode || undefined,
                    currency_code: currencyCode || undefined,
                    time_zone: timeZone || undefined,
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
    async importCountries(rows: CountryImportRow[]): Promise<{
        created: number;
        updated: number;
        errors: { row: number; message: string }[];
    }> {
        return runMasterImport(
            rows,
            {
                update: async (row, existingId) => {
                    const existing = await this.countryService.findOneById(
                        existingId
                    );
                    // `name` is deliberately NOT sent: it is the match key, and
                    // sending it back would only ever re-case the row while
                    // regenerating the slug that states and addresses read.
                    return this.countryService.update(existing, {
                        country_code: row.data.country_code,
                        currency_code: row.data.currency_code,
                        time_zone: row.data.time_zone,
                        status: row.data.status,
                    } as any);
                },
                create: async (row) =>
                    this.countryService.create({
                        name: row.data.name,
                        country_code: row.data.country_code,
                        currency_code: row.data.currency_code,
                        time_zone: row.data.time_zone,
                        status: row.data.status,
                    } as any),
            },
            this.logger
        );
    }
}
