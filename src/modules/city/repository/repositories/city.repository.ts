import { Injectable } from '@nestjs/common';
import { Repository, Not, ILike } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { CityDoc, CityEntity } from '../entities/city.entity';
import { ENUM_CITY_STATUS } from '@modules/city/enums/city.enum';

@Injectable()
export class CityRepository extends DatabaseObjectIdRepositoryBase<CityEntity> {
    constructor(
        @InjectDatabaseModel(CityEntity)
        private readonly cityRepository: Repository<CityEntity>
    ) {
        super(cityRepository);
    }

    async findForList(filters: {
        q?: string;
        state_id?: string;
        country_id?: string;
        status?: ENUM_CITY_STATUS;
        limit: number;
        offset: number;
    }): Promise<[CityDoc[], number]> {
        const qb = this._repository
            .createQueryBuilder('c')
            .where('c.deleted = :del', { del: false });

        if (filters.state_id) {
            qb.andWhere('c.state_id = :sid', { sid: filters.state_id });
        }
        if (filters.country_id) {
            qb.andWhere('c.country_id = :cid', { cid: filters.country_id });
        }
        if (filters.status) {
            qb.andWhere('c.status = :st', { st: filters.status });
        }
        if (filters.q) {
            qb.andWhere('(c.name ILIKE :term OR c.city_code ILIKE :term)', {
                term: `%${filters.q.trim()}%`,
            });
        }

        qb.orderBy('c.name', 'ASC').skip(filters.offset).take(filters.limit);
        return qb.getManyAndCount();
    }

    /** Active cities for the address dropdowns, filtered by state or country. */
    async findForDropdown(filters: {
        state_id?: string;
        country_id?: string;
        q?: string;
    }): Promise<CityDoc[]> {
        const qb = this._repository
            .createQueryBuilder('c')
            .where('c.deleted = :del', { del: false })
            .andWhere('c.status = :st', { st: ENUM_CITY_STATUS.ACTIVE });

        if (filters.state_id) {
            qb.andWhere('c.state_id = :sid', { sid: filters.state_id });
        }
        if (filters.country_id) {
            qb.andWhere('c.country_id = :cid', { cid: filters.country_id });
        }
        if (filters.q) {
            qb.andWhere('c.name ILIKE :term', { term: `%${filters.q.trim()}%` });
        }

        return qb.orderBy('c.name', 'ASC').limit(500).getMany();
    }

    /** Unique within its state — "Springfield" may legitimately exist in many. */
    async isNameExists(
        name: string,
        stateId: string,
        excludeId?: string
    ): Promise<boolean> {
        const where: any = {
            name: ILike(name.trim()),
            state_id: stateId,
            deleted: false,
        };
        if (excludeId) where._id = Not(excludeId);
        return (await this._repository.count({ where })) > 0;
    }

    /**
     * A previously-deleted city with this exact (state, name). The unique index
     * covers soft-deleted rows, so a re-add must revive rather than insert.
     */
    async findSoftDeleted(
        name: string,
        stateId: string
    ): Promise<CityDoc | null> {
        return this._repository.findOne({
            where: {
                name: ILike(name.trim()),
                state_id: stateId,
                deleted: true,
            } as any,
            withDeleted: true,
        });
    }

    /** Delete guard for the state master. */
    async countByState(stateId: string): Promise<number> {
        return this._repository.count({
            where: { state_id: stateId, deleted: false } as any,
        });
    }

    /** Delete guard for the country master. */
    async countByCountry(countryId: string): Promise<number> {
        return this._repository.count({
            where: { country_id: countryId, deleted: false } as any,
        });
    }
}
