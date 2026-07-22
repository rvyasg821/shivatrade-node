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
import { CityService } from './city.service';
import { CityRepository } from '../repository/repositories/city.repository';
import { CityDoc } from '../repository/entities/city.entity';
import { ENUM_CITY_STATUS } from '../enums/city.enum';
import { StateRepository } from '@modules/state/repository/repositories/state.repository';
import { StateDoc } from '@modules/state/repository/entities/state.entity';
import { ENUM_STATE_STATUS } from '@modules/state/enums/state.enum';
import { CountryRepository } from '@modules/country/repository/repositories/country.repository';
import { CountryDoc } from '@modules/country/repository/entities/country.entity';

/**
 * City Excel import/export — the reason this feature exists.
 *
 * The city master ships EMPTY on purpose, so this importer is how a client
 * populates it: a spreadsheet of the places they actually ship to, rather than
 * a seed of every settlement on earth.
 *
 * Parents are resolved two levels up, by NAME. `country` is required alongside
 * `state` and not merely decorative: *Punjab* is a state in both India and
 * Pakistan, *Georgia* is a state in the USA and a country, and without the
 * country column those rows are genuinely ambiguous. `state_id` and the
 * denormalised `country_id` are both taken from the resolved state, never from
 * the sheet.
 */
const EXCEL_HEADERS = ['name', 'state', 'country', 'city_code', 'status'];
const SHEET_NAME = 'Cities';

/** §15 D-12 — preview hands every row back to the browser. */
const MAX_ROWS = 5000;

const LOAD_LIMIT = 100000;

const SAMPLE_ROWS = [
    {
        name: 'Ahmedabad',
        state: 'Gujarat',
        country: 'India',
        city_code: 'AMD',
        status: 'ACTIVE',
    },
    {
        name: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        city_code: 'BOM',
        status: 'ACTIVE',
    },
];

export interface CityImportData {
    name: string;
    state: string;
    country: string;
    state_id?: string;
    city_code?: string;
    status: ENUM_CITY_STATUS;
}

export type CityImportRow = MasterImportRow<CityImportData>;

@Injectable()
export class CityImportExportService {
    private readonly logger = new Logger(CityImportExportService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly cityService: CityService,
        private readonly cityRepository: CityRepository,
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
     * Export every city as an Excel buffer — ACTIVE and INACTIVE both, so a
     * round-trip cannot look like a purge.
     */
    async exportCities(): Promise<Buffer> {
        const [cities] = await this.cityRepository.findForList({
            limit: LOAD_LIMIT,
            offset: 0,
        });
        const [states] = await this.stateRepository.findForList({
            limit: LOAD_LIMIT,
            offset: 0,
        });

        const stateNames = new Map(
            states.map((s): [string, string] => [String(s._id), s.name])
        );
        const countryNames = new Map(
            (await this.countryRepository.findAll({})).map((c): [
                string,
                string
            ] => [String(c._id), c.name])
        );

        const rows = cities.map((c) => ({
            name: c.name || '',
            state: stateNames.get(c.state_id) || '',
            country: countryNames.get(c.country_id) || '',
            city_code: c.city_code || '',
            status: c.status || ENUM_CITY_STATUS.ACTIVE,
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
    ): Promise<{ summary: any; rows: CityImportRow[] }> {
        const rawRows = readSheetRows(this.fileService, fileBuffer, {
            maxRows: MAX_ROWS,
            headers: EXCEL_HEADERS,
        });
        assertRequiredHeader(
            rawRows,
            ['name', 'state', 'country'],
            EXCEL_HEADERS
        );

        // All three tables loaded ONCE — a 5,000-row file would otherwise be
        // 15,000 round trips.
        const countriesByName = indexBy(
            await this.countryRepository.findAll({}),
            (c: CountryDoc) => (c.name || '').trim().toLowerCase()
        );
        const [allStates] = await this.stateRepository.findForList({
            limit: LOAD_LIMIT,
            offset: 0,
        });
        // Keyed by country + name: this is what makes "Punjab, India" and
        // "Punjab, Pakistan" two different lookups instead of a collision.
        const statesByKey = indexBy(allStates, (s: StateDoc) =>
            `${s.country_id}::${(s.name || '').trim().toLowerCase()}`
        );

        const [allCities] = await this.cityRepository.findForList({
            limit: LOAD_LIMIT,
            offset: 0,
        });
        const citiesByKey = indexBy(allCities, (c: CityDoc) =>
            `${c.state_id}::${(c.name || '').trim().toLowerCase()}`
        );

        const seenInFile = new Set<string>();
        const rows: CityImportRow[] = [];

        for (let i = 0; i < rawRows.length; i++) {
            const rowNum = i + 2; // 1-indexed + header row
            const errors: string[] = [];
            const get = cellReader(rawRows[i]);

            const name = get('name');
            const stateName = get('state');
            const countryName = get('country');
            const cityCode = get('city_code').toUpperCase();
            const statusRaw = get('status').toUpperCase();

            if (!name) {
                errors.push('Name is required');
            } else if (name.length > 100) {
                errors.push('Name must not exceed 100 characters');
            }
            if (cityCode && cityCode.length > 20) {
                errors.push('City code must not exceed 20 characters');
            }

            let status = ENUM_CITY_STATUS.ACTIVE;
            if (statusRaw) {
                if (
                    statusRaw === ENUM_CITY_STATUS.ACTIVE ||
                    statusRaw === ENUM_CITY_STATUS.INACTIVE
                ) {
                    status = statusRaw as ENUM_CITY_STATUS;
                } else {
                    errors.push("Status must be 'ACTIVE' or 'INACTIVE'");
                }
            }

            const state = this.resolveState(
                stateName,
                countryName,
                countriesByName,
                statesByKey,
                errors
            );

            let rowStatus: CityImportRow['status'] = 'valid_new';
            let existingId: string | undefined;

            if (name && state) {
                const key = `${String(state._id)}::${name.toLowerCase()}`;
                if (seenInFile.has(key)) {
                    errors.push('Duplicate name in file for this state');
                }
                seenInFile.add(key);

                const match = resolveMatch(
                    key,
                    citiesByKey,
                    `'${name}' in ${state.name}`
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
                    state: state?.name || stateName,
                    country: countryName,
                    state_id: state ? String(state._id) : undefined,
                    city_code: cityCode || undefined,
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
     * Country name → state name → state row.
     *
     * Resolved through the country rather than by state name alone, so a
     * duplicated state name across two countries is disambiguated by data
     * instead of by luck. An INACTIVE parent at either level is refused rather
     * than quietly revived (§15 D-11).
     */
    private resolveState(
        stateName: string,
        countryName: string,
        countriesByName: Map<string, CountryDoc[]>,
        statesByKey: Map<string, StateDoc[]>,
        errors: string[]
    ): StateDoc | undefined {
        if (!stateName) errors.push('State is required');
        if (!countryName) errors.push('Country is required');
        if (!stateName || !countryName) return undefined;

        const countryHits = countriesByName.get(countryName.toLowerCase());
        if (!countryHits?.length) {
            errors.push(
                `Country '${countryName}' is not in the Country master — add it first, or import Countries before Cities`
            );
            return undefined;
        }
        if (countryHits.length > 1) {
            errors.push(
                `Country '${countryName}' matches more than one record — clean up the Country master first`
            );
            return undefined;
        }

        const country = countryHits[0];
        const stateHits = statesByKey.get(
            `${String(country._id)}::${stateName.toLowerCase()}`
        );
        if (!stateHits?.length) {
            errors.push(
                `State '${stateName}' is not in the State master under ${country.name} — add it first, or import States before Cities`
            );
            return undefined;
        }
        if (stateHits.length > 1) {
            errors.push(
                `State '${stateName}' matches more than one record in ${country.name} — clean up the State master first`
            );
            return undefined;
        }

        const state = stateHits[0];
        if (state.status !== ENUM_STATE_STATUS.ACTIVE) {
            errors.push(
                `State '${state.name}' is inactive — re-activate it before importing its cities`
            );
            return undefined;
        }
        return state;
    }

    /** Persist the validated rows. One bad row never aborts the batch. */
    async importCities(rows: CityImportRow[]): Promise<{
        created: number;
        updated: number;
        errors: { row: number; message: string }[];
    }> {
        return runMasterImport(
            rows,
            {
                update: async (row, existingId) => {
                    const existing = await this.cityService.findOneById(
                        existingId
                    );
                    // `name` and `state_id` together ARE the match key, so they
                    // already agree with the stored row. A blank `city_code`
                    // stays undefined, which the service reads as "leave it
                    // alone" rather than "clear it".
                    return this.cityService.update(existing, {
                        city_code: row.data.city_code,
                        status: row.data.status,
                    } as any);
                },
                create: async (row) =>
                    this.cityService.create({
                        name: row.data.name,
                        state_id: row.data.state_id as string,
                        city_code: row.data.city_code,
                        status: row.data.status,
                    } as any),
            },
            this.logger
        );
    }
}
