import { Injectable } from '@nestjs/common';
import { Repository, Not, ILike } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { StateDoc, StateEntity } from '../entities/state.entity';
import { ENUM_STATE_STATUS } from '@modules/state/enums/state.enum';

@Injectable()
export class StateRepository extends DatabaseObjectIdRepositoryBase<StateEntity> {
    constructor(
        @InjectDatabaseModel(StateEntity)
        private readonly stateRepository: Repository<StateEntity>
    ) {
        super(stateRepository);
    }

    /**
     * Paginated list for the master screen. A query builder rather than the
     * base's `findAll`, because the list needs an OR-search across two columns
     * plus a country filter, and building that as a mongo-ish `find` object is
     * harder to read than the SQL it compiles to.
     */
    async findForList(filters: {
        q?: string;
        country_id?: string;
        status?: ENUM_STATE_STATUS;
        limit: number;
        offset: number;
    }): Promise<[StateDoc[], number]> {
        const qb = this._repository
            .createQueryBuilder('s')
            .where('s.deleted = :del', { del: false });

        if (filters.country_id) {
            qb.andWhere('s.country_id = :cid', { cid: filters.country_id });
        }
        if (filters.status) {
            qb.andWhere('s.status = :st', { st: filters.status });
        }
        if (filters.q) {
            qb.andWhere('(s.name ILIKE :term OR s.state_code ILIKE :term)', {
                term: `%${filters.q.trim()}%`,
            });
        }

        qb.orderBy('s.name', 'ASC').skip(filters.offset).take(filters.limit);
        return qb.getManyAndCount();
    }

    /**
     * Active states for a country, for the address dropdowns.
     * Accepts either the country's uuid or its ISO-2 code — address forms hold
     * the code, the master screen holds the id.
     */
    async findForDropdown(filters: {
        country_id?: string;
        country_code?: string;
        q?: string;
    }): Promise<StateDoc[]> {
        const qb = this._repository
            .createQueryBuilder('s')
            .where('s.deleted = :del', { del: false })
            .andWhere('s.status = :st', { st: ENUM_STATE_STATUS.ACTIVE });

        if (filters.country_id) {
            qb.andWhere('s.country_id = :cid', { cid: filters.country_id });
        }
        if (filters.country_code) {
            qb.andWhere('UPPER(s.country_code) = :cc', {
                cc: filters.country_code.toUpperCase(),
            });
        }
        if (filters.q) {
            qb.andWhere('s.name ILIKE :term', { term: `%${filters.q.trim()}%` });
        }

        return qb.orderBy('s.name', 'ASC').limit(500).getMany();
    }

    /** Duplicate guard — a state name is unique within its country, not globally. */
    async isNameExists(
        name: string,
        countryId: string,
        excludeId?: string
    ): Promise<boolean> {
        const where: any = {
            name: ILike(name.trim()),
            country_id: countryId,
            deleted: false,
        };
        if (excludeId) where._id = Not(excludeId);
        return (await this._repository.count({ where })) > 0;
    }

    /**
     * A previously-deleted state with this exact (country, name).
     *
     * The unique index spans soft-deleted rows too, so a re-add has to find and
     * revive the corpse rather than insert a second row and hit the constraint.
     */
    async findSoftDeleted(
        name: string,
        countryId: string
    ): Promise<StateDoc | null> {
        return this._repository.findOne({
            where: {
                name: ILike(name.trim()),
                country_id: countryId,
                deleted: true,
            } as any,
            withDeleted: true,
        });
    }

    /** How many live states hang off a country — the country delete guard. */
    async countByCountry(countryId: string): Promise<number> {
        return this._repository.count({
            where: { country_id: countryId, deleted: false } as any,
        });
    }
}
