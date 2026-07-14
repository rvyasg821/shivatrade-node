import { Injectable } from '@nestjs/common';
import { Repository, Not, ILike } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { UomDoc, UomEntity } from '../entities/uom.entity';
import { ENUM_UOM_STATUS } from '@modules/uom/enums/uom.enum';

@Injectable()
export class UomRepository extends DatabaseObjectIdRepositoryBase<UomEntity> {
    constructor(
        @InjectDatabaseModel(UomEntity)
        private readonly uomRepository: Repository<UomEntity>
    ) {
        super(uomRepository);
    }

    async findForList(filters: {
        q?: string;
        status?: ENUM_UOM_STATUS;
        limit: number;
        offset: number;
    }): Promise<[UomDoc[], number]> {
        const qb = this._repository
            .createQueryBuilder('u')
            .where('u.deleted = :del', { del: false });

        if (filters.status) {
            qb.andWhere('u.status = :st', { st: filters.status });
        }
        if (filters.q) {
            qb.andWhere(
                '(u.code ILIKE :term OR u.name ILIKE :term OR u.uqc_code ILIKE :term)',
                { term: `%${filters.q.trim()}%` }
            );
        }

        qb.orderBy('u.sort_order', 'ASC')
            .addOrderBy('u.code', 'ASC')
            .skip(filters.offset)
            .take(filters.limit);
        return qb.getManyAndCount();
    }

    /** Active units for every product / line-item dropdown in the app. */
    async findForDropdown(): Promise<UomDoc[]> {
        return this._repository
            .createQueryBuilder('u')
            .where('u.deleted = :del', { del: false })
            .andWhere('u.status = :st', { st: ENUM_UOM_STATUS.ACTIVE })
            .orderBy('u.sort_order', 'ASC')
            .addOrderBy('u.code', 'ASC')
            .getMany();
    }

    /**
     * Look a unit up by its code, case-insensitively.
     *
     * Case-insensitive on purpose: the product Excel import has always accepted
     * "kg" and stored the canonical "KG", and the validator that replaces the
     * old enum check has to keep doing that or every existing import file breaks.
     */
    async findByCode(code: string): Promise<UomDoc | null> {
        return this._repository.findOne({
            where: { code: ILike(code.trim()), deleted: false } as any,
        });
    }

    async isCodeExists(code: string, excludeId?: string): Promise<boolean> {
        const where: any = { code: ILike(code.trim()), deleted: false };
        if (excludeId) where._id = Not(excludeId);
        return (await this._repository.count({ where })) > 0;
    }

    /** Revive a soft-deleted twin — the unique index covers deleted rows too. */
    async findSoftDeleted(code: string): Promise<UomDoc | null> {
        return this._repository.findOne({
            where: { code: ILike(code.trim()), deleted: true } as any,
            withDeleted: true,
        });
    }
}
