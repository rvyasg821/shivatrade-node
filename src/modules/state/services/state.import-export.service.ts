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
import { StateService } from './state.service';
import { StateRepository } from '../repository/repositories/state.repository';
import { StateDoc } from '../repository/entities/state.entity';
import { ENUM_STATE_STATUS } from '../enums/state.enum';
import { CountryRepository } from '@modules/country/repository/repositories/country.repository';
import { CountryDoc } from '@modules/country/repository/entities/country.entity';
import { ENUM_COUNTRY_STATUS } from '@modules/country/enums/country.enum';

/**
 * State Excel import/export.
 *
 * The parent is referenced by country NAME, never by id — a client editing a
 * spreadsheet cannot be asked to paste UUIDs. `country_id` and the denormalised
 * `country_code` are both derived from the resolved parent, so the two can
 * never disagree with each other.
 *
 * Countries must therefore be imported first. A state whose country is not in
 * the master yet fails in preview, before anything is written.
 */
const EXCEL_HEADERS = ['name', 'country', 'state_code', 'status'];
const SHEET_NAME = 'States';

/** §15 D-12 — preview hands every row back to the browser. */
const MAX_ROWS = 5000;

/** One query is enough for either master at real-world sizes. */
const LOAD_LIMIT = 100000;

const SAMPLE_ROWS = [
    { name: 'Gujarat', country: 'India', state_code: 'GJ', status: 'ACTIVE' },
    {
        name: 'Maharashtra',
        country: 'India',
        state_code: 'MH',
        status: 'ACTIVE',
    },
];

export interface StateImportData {
    name: string;
    country: string;
    country_id?: string;
    state_code?: string;
    status: ENUM_STATE_STATUS;
}

export type StateImportRow = MasterImportRow<StateImportData>;

@Injectable()
export class StateImportExportService {
    private readonly logger = new Logger(StateImportExportService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly stateService: StateService,
        private readonly stateRepository: StateRepository,
        private readonly countryRepository: CountryRepository
    ) {}

    /** Sample Excel file with headers + example rows. */
    generateSampleExcel(): Buffer {
        return this.fileService.writeExcel([
            { data: SAMPLE_ROWS, sheetName: SHEET_NAME },
        ]);
    }

    /**
     * Export every state as an Excel buffer — ACTIVE and INACTIVE both, so a
     * round-trip cannot look like a purge.
     */
    async exportStates(): Promise<Buffer> {
        const [states] = await this.stateRepository.findForList({
            limit: LOAD_LIMIT,
            offset: 0,
        });
        const countryNames = new Map(
            (await this.countryRepository.findAll({})).map((c): [
                string,
                string
            ] => [String(c._id), c.name])
        );

        const rows = states.map((s) => ({
            name: s.name || '',
            country: countryNames.get(s.country_id) || '',
            state_code: s.state_code || '',
            status: s.status || ENUM_STATE_STATUS.ACTIVE,
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
     * those are collected into each row's `errors`.
     */
    async parseAndValidate(
        fileBuffer: Buffer
    ): Promise<{ summary: any; rows: StateImportRow[] }> {
        const rawRows = readSheetRows(this.fileService, fileBuffer, {
            maxRows: MAX_ROWS,
            headers: EXCEL_HEADERS,
        });
        assertRequiredHeader(rawRows, ['name', 'country'], EXCEL_HEADERS);

        // Both parent tables loaded ONCE, not once per row — a 5,000-row file
        // would otherwise be 5,000 lookups.
        const countriesByName = indexBy(
            await this.countryRepository.findAll({}),
            (c: CountryDoc) => (c.name || '').trim().toLowerCase()
        );
        const [allStates] = await this.stateRepository.findForList({
            limit: LOAD_LIMIT,
            offset: 0,
        });
        // Keyed by parent + name, exactly like the unique index.
        const statesByKey = indexBy(allStates, (s: StateDoc) =>
            `${s.country_id}::${(s.name || '').trim().toLowerCase()}`
        );

        const seenInFile = new Set<string>();
        const rows: StateImportRow[] = [];

        for (let i = 0; i < rawRows.length; i++) {
            const rowNum = i + 2; // 1-indexed + header row
            const errors: string[] = [];
            const get = cellReader(rawRows[i]);

            const name = get('name');
            const countryName = get('country');
            const stateCode = get('state_code').toUpperCase();
            const statusRaw = get('status').toUpperCase();

            if (!name) {
                errors.push('Name is required');
            } else if (name.length > 100) {
                errors.push('Name must not exceed 100 characters');
            }
            if (stateCode && stateCode.length > 20) {
                errors.push('State code must not exceed 20 characters');
            }

            let status = ENUM_STATE_STATUS.ACTIVE;
            if (statusRaw) {
                if (
                    statusRaw === ENUM_STATE_STATUS.ACTIVE ||
                    statusRaw === ENUM_STATE_STATUS.INACTIVE
                ) {
                    status = statusRaw as ENUM_STATE_STATUS;
                } else {
                    errors.push("Status must be 'ACTIVE' or 'INACTIVE'");
                }
            }

            const country = this.resolveCountry(
                countryName,
                countriesByName,
                errors
            );

            // Without a parent there is no key, so new-vs-update is unknowable
            // and the row can only be an error.
            let rowStatus: StateImportRow['status'] = 'valid_new';
            let existingId: string | undefined;

            if (name && country) {
                const key = `${String(country._id)}::${name.toLowerCase()}`;
                if (seenInFile.has(key)) {
                    errors.push('Duplicate name in file for this country');
                }
                seenInFile.add(key);

                const match = resolveMatch(
                    key,
                    statesByKey,
                    `'${name}' in ${country.name}`
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
                    name,
                    country: country?.name || countryName,
                    country_id: country ? String(country._id) : undefined,
                    state_code: stateCode || undefined,
                    status,
                },
                status: rowStatus,
                existingId,
                errors,
            });
        }

        return { summary: summarise(rows), rows };
    }

    /**
     * Resolve the parent country by name, pushing the reason onto `errors` when
     * it cannot be. An INACTIVE parent is refused rather than quietly revived
     * (§15 D-11) — importing a child must never reactivate master data above it.
     */
    private resolveCountry(
        countryName: string,
        index: Map<string, CountryDoc[]>,
        errors: string[]
    ): CountryDoc | undefined {
        if (!countryName) {
            errors.push('Country is required');
            return undefined;
        }

        const hits = index.get(countryName.toLowerCase());
        if (!hits?.length) {
            errors.push(
                `Country '${countryName}' is not in the Country master — add it first, or import Countries before States`
            );
            return undefined;
        }
        if (hits.length > 1) {
            errors.push(
                `Country '${countryName}' matches more than one record — clean up the Country master first`
            );
            return undefined;
        }

        const country = hits[0];
        if (country.status !== ENUM_COUNTRY_STATUS.ACTIVE) {
            errors.push(
                `Country '${country.name}' is ${country.status.toLowerCase()} — re-activate it before importing its states`
            );
            return undefined;
        }
        return country;
    }

    /** Persist the validated rows. One bad row never aborts the batch. */
    async importStates(rows: StateImportRow[]): Promise<{
        created: number;
        updated: number;
        errors: { row: number; message: string }[];
    }> {
        return runMasterImport(
            rows,
            {
                update: async (row, existingId) => {
                    const existing = await this.stateService.findOneById(
                        existingId
                    );
                    // Neither `name` nor `country_id` is sent: together they are
                    // the match key, so by definition they already match. A
                    // blank `state_code` stays undefined, which the service
                    // reads as "leave it alone" rather than "clear it".
                    return this.stateService.update(existing, {
                        state_code: row.data.state_code,
                        status: row.data.status,
                    } as any);
                },
                create: async (row) =>
                    this.stateService.create({
                        name: row.data.name,
                        country_id: row.data.country_id as string,
                        state_code: row.data.state_code,
                        status: row.data.status,
                    } as any),
            },
            this.logger
        );
    }
}
