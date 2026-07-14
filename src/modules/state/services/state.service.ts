import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { StateRepository } from '../repository/repositories/state.repository';
import { StateDoc, StateEntity } from '../repository/entities/state.entity';
import { StateCreateRequestDto } from '../dtos/request/state.create.request.dto';
import { StateUpdateRequestDto } from '../dtos/request/state.update.request.dto';
import {
    StateDropdownDto,
    StateResponseDto,
} from '../dtos/response/state.response.dto';
import { ENUM_STATE_STATUS } from '../enums/state.enum';
import { CountryRepository } from '@modules/country/repository/repositories/country.repository';
import { CountryDoc } from '@modules/country/repository/entities/country.entity';

@Injectable()
export class StateService {
    private readonly logger = new Logger(StateService.name);

    constructor(
        private readonly stateRepository: StateRepository,
        private readonly countryRepository: CountryRepository
    ) {}

    /**
     * The parent must exist and not be soft-deleted. Enforced here rather than
     * with a database FK because the country master soft-deletes, so a real FK
     * would happily keep pointing at a row the app treats as gone.
     */
    private async requireCountry(countryId: string): Promise<CountryDoc> {
        const country = await this.countryRepository.findOneById(countryId);
        if (!country || country.deleted) {
            throw new BadRequestException('Selected country does not exist');
        }
        return country;
    }

    async create(data: StateCreateRequestDto): Promise<StateDoc> {
        const country = await this.requireCountry(data.country_id);
        const name = data.name.trim();

        if (await this.stateRepository.isNameExists(name, data.country_id)) {
            throw new BadRequestException(
                `'${name}' already exists in ${country.name}`
            );
        }

        // Delete is SOFT but the (country_id, name) unique index is not — the
        // dead row still holds the slot. Without this, deleting 'Gujarat' and
        // re-adding it would fail on a raw database constraint violation.
        // Revive the old row instead, which is what the user meant anyway.
        const softDeleted = await this.stateRepository.findSoftDeleted(
            name,
            data.country_id
        );
        if (softDeleted) {
            const restored = await this.stateRepository.restore(softDeleted);
            return this.update(restored, data);
        }

        const create = new StateEntity();
        create.name = name;
        create.state_code = data.state_code?.trim().toUpperCase() || undefined;
        create.country_id = data.country_id;
        create.country_code = country.country_code;
        create.status = data.status || ENUM_STATE_STATUS.ACTIVE;

        const row = await this.stateRepository.create<StateEntity>(create);
        this.logger.log(`State created: ${row._id} (${name})`);
        return row;
    }

    async findOneById(id: string): Promise<StateDoc> {
        const row = await this.stateRepository.findOneById(id);
        if (!row || row.deleted) throw new NotFoundException('State not found');
        return row;
    }

    async update(row: StateDoc, data: StateUpdateRequestDto): Promise<StateDoc> {
        // Re-point at another country and the denormalised code must follow, or
        // the address dropdowns would keep filtering it under the old country.
        if (data.country_id && data.country_id !== row.country_id) {
            const country = await this.requireCountry(data.country_id);
            row.country_id = data.country_id;
            row.country_code = country.country_code;
        }

        if (data.name) {
            const name = data.name.trim();
            if (
                await this.stateRepository.isNameExists(
                    name,
                    row.country_id,
                    String(row._id)
                )
            ) {
                throw new BadRequestException(
                    `'${name}' already exists in this country`
                );
            }
            row.name = name;
        }

        if (data.state_code !== undefined) {
            row.state_code = data.state_code?.trim().toUpperCase() || undefined;
        }
        if (data.status) row.status = data.status;

        const updated = await this.stateRepository.save(row);
        this.logger.log(`State updated: ${row._id}`);
        return updated;
    }

    async softDelete(row: StateDoc): Promise<StateDoc> {
        return this.stateRepository.softDelete(row);
    }

    async findForList(filters: {
        q?: string;
        country_id?: string;
        status?: ENUM_STATE_STATUS;
        limit: number;
        offset: number;
    }): Promise<[StateResponseDto[], number]> {
        const [rows, total] = await this.stateRepository.findForList(filters);
        return [await this.mapList(rows), total];
    }

    async findForDropdown(filters: {
        country_id?: string;
        country_code?: string;
        q?: string;
    }): Promise<StateDropdownDto[]> {
        const rows = await this.stateRepository.findForDropdown(filters);
        return rows.map((r) => ({
            _id: String(r._id),
            name: r.name,
            state_code: r.state_code || undefined,
            country_id: r.country_id,
            country_code: r.country_code || undefined,
        }));
    }

    /**
     * Resolve country names in ONE query for the whole page, not one per row —
     * the list is paginated, so this is at most `limit` distinct countries.
     */
    async mapList(rows: StateDoc[]): Promise<StateResponseDto[]> {
        const names = await this.countryNamesFor(rows.map((r) => r.country_id));
        return rows.map((r) => this.mapGet(r, names.get(r.country_id)));
    }

    async mapGetWithCountry(row: StateDoc): Promise<StateResponseDto> {
        const names = await this.countryNamesFor([row.country_id]);
        return this.mapGet(row, names.get(row.country_id));
    }

    private async countryNamesFor(
        ids: string[]
    ): Promise<Map<string, string>> {
        const unique = [...new Set(ids.filter(Boolean))];
        if (!unique.length) return new Map();

        const countries = await this.countryRepository.findAll({
            _id: { $in: unique },
        });
        return new Map(countries.map((c) => [String(c._id), c.name]));
    }

    mapGet(row: StateDoc, countryName?: string): StateResponseDto {
        return {
            _id: String(row._id),
            name: row.name,
            state_code: row.state_code || undefined,
            country_id: row.country_id,
            country_code: row.country_code || undefined,
            country_name: countryName,
            status: row.status,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }
}
