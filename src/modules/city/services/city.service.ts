import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { CityRepository } from '../repository/repositories/city.repository';
import { CityDoc, CityEntity } from '../repository/entities/city.entity';
import { CityCreateRequestDto } from '../dtos/request/city.create.request.dto';
import { CityUpdateRequestDto } from '../dtos/request/city.update.request.dto';
import {
    CityDropdownDto,
    CityResponseDto,
} from '../dtos/response/city.response.dto';
import { ENUM_CITY_STATUS } from '../enums/city.enum';
import { StateRepository } from '@modules/state/repository/repositories/state.repository';
import { StateDoc } from '@modules/state/repository/entities/state.entity';
import { CountryRepository } from '@modules/country/repository/repositories/country.repository';

@Injectable()
export class CityService {
    private readonly logger = new Logger(CityService.name);

    constructor(
        private readonly cityRepository: CityRepository,
        private readonly stateRepository: StateRepository,
        private readonly countryRepository: CountryRepository
    ) {}

    private async requireState(stateId: string): Promise<StateDoc> {
        const state = await this.stateRepository.findOneById(stateId);
        if (!state || state.deleted) {
            throw new BadRequestException('Selected state does not exist');
        }
        return state;
    }

    async create(data: CityCreateRequestDto): Promise<CityDoc> {
        const state = await this.requireState(data.state_id);
        const name = data.name.trim();

        if (await this.cityRepository.isNameExists(name, data.state_id)) {
            throw new BadRequestException(
                `'${name}' already exists in ${state.name}`
            );
        }

        // Soft delete + a unique (state_id, name) index: the deleted row still
        // holds the slot, so re-adding a deleted city would hit the constraint.
        // Revive it instead.
        const softDeleted = await this.cityRepository.findSoftDeleted(
            name,
            data.state_id
        );
        if (softDeleted) {
            const restored = await this.cityRepository.restore(softDeleted);
            return this.update(restored, data);
        }

        const create = new CityEntity();
        create.name = name;
        create.city_code = data.city_code?.trim().toUpperCase() || undefined;
        create.state_id = data.state_id;
        // Derived, never taken from the client: a city's country IS its state's
        // country, and letting the two disagree would corrupt the dropdown filter.
        create.country_id = state.country_id;
        create.status = data.status || ENUM_CITY_STATUS.ACTIVE;

        const row = await this.cityRepository.create<CityEntity>(create);
        this.logger.log(`City created: ${row._id} (${name})`);
        return row;
    }

    async findOneById(id: string): Promise<CityDoc> {
        const row = await this.cityRepository.findOneById(id);
        if (!row || row.deleted) throw new NotFoundException('City not found');
        return row;
    }

    async update(row: CityDoc, data: CityUpdateRequestDto): Promise<CityDoc> {
        if (data.state_id && data.state_id !== row.state_id) {
            const state = await this.requireState(data.state_id);
            row.state_id = data.state_id;
            row.country_id = state.country_id;
        }

        if (data.name) {
            const name = data.name.trim();
            if (
                await this.cityRepository.isNameExists(
                    name,
                    row.state_id,
                    String(row._id)
                )
            ) {
                throw new BadRequestException(
                    `'${name}' already exists in this state`
                );
            }
            row.name = name;
        }

        if (data.city_code !== undefined) {
            row.city_code = data.city_code?.trim().toUpperCase() || undefined;
        }
        if (data.status) row.status = data.status;

        const updated = await this.cityRepository.save(row);
        this.logger.log(`City updated: ${row._id}`);
        return updated;
    }

    async softDelete(row: CityDoc): Promise<CityDoc> {
        return this.cityRepository.softDelete(row);
    }

    /**
     * Bulk soft-delete. A city is the leaf of the geo tree, so there is no child
     * guard — each row is fetched and soft-deleted the same way the single-delete
     * endpoint does. Returns the ids actually deleted and the ones skipped.
     */
    async deleteMany(
        ids: string[],
        deletedBy?: string
    ): Promise<{
        deleted: string[];
        skipped: Array<{ id: string; reason: string }>;
    }> {
        const deleted: string[] = [];
        const skipped: Array<{ id: string; reason: string }> = [];
        for (const id of ids) {
            try {
                const row = await this.findOneById(id);
                await this.softDelete(row);
                deleted.push(id);
            } catch (e: any) {
                skipped.push({ id, reason: e?.message || 'Cannot delete' });
            }
        }
        return { deleted, skipped };
    }

    async findForList(filters: {
        q?: string;
        state_id?: string;
        country_id?: string;
        status?: ENUM_CITY_STATUS;
        limit: number;
        offset: number;
    }): Promise<[CityResponseDto[], number]> {
        const [rows, total] = await this.cityRepository.findForList(filters);
        return [await this.mapList(rows), total];
    }

    async findForDropdown(filters: {
        state_id?: string;
        country_id?: string;
        q?: string;
    }): Promise<CityDropdownDto[]> {
        const rows = await this.cityRepository.findForDropdown(filters);
        return rows.map((r) => ({
            _id: String(r._id),
            name: r.name,
            city_code: r.city_code || undefined,
            state_id: r.state_id,
            country_id: r.country_id,
        }));
    }

    /** Two lookups for the whole page — not two per row. */
    async mapList(rows: CityDoc[]): Promise<CityResponseDto[]> {
        const [states, countries] = await Promise.all([
            this.namesFor(
                rows.map((r) => r.state_id),
                'state'
            ),
            this.namesFor(
                rows.map((r) => r.country_id),
                'country'
            ),
        ]);

        return rows.map((r) => ({
            ...this.mapGet(r),
            state_name: states.get(r.state_id),
            country_name: countries.get(r.country_id),
        }));
    }

    async mapGetWithParents(row: CityDoc): Promise<CityResponseDto> {
        const [mapped] = await this.mapList([row]);
        return mapped;
    }

    private async namesFor(
        ids: string[],
        kind: 'state' | 'country'
    ): Promise<Map<string, string>> {
        const unique = [...new Set(ids.filter(Boolean))];
        if (!unique.length) return new Map();

        const rows =
            kind === 'state'
                ? await this.stateRepository.findAll({ _id: { $in: unique } })
                : await this.countryRepository.findAll({ _id: { $in: unique } });

        return new Map(
            rows.map((r: any): [string, string] => [String(r._id), r.name])
        );
    }

    mapGet(row: CityDoc): CityResponseDto {
        return {
            _id: String(row._id),
            name: row.name,
            city_code: row.city_code || undefined,
            state_id: row.state_id,
            country_id: row.country_id,
            status: row.status,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }
}
