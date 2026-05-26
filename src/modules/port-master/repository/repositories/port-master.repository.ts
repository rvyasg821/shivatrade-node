import { Injectable } from '@nestjs/common';
import { Repository, Not, ILike, In } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PortMasterDoc, PortMasterEntity } from '../entities/port-master.entity';
import { ENUM_PORT_TYPE } from '@modules/port-master/enums/port-master.enum';

@Injectable()
export class PortMasterRepository extends DatabaseObjectIdRepositoryBase<PortMasterEntity> {
    constructor(
        @InjectDatabaseModel(PortMasterEntity)
        private readonly portMasterRepository: Repository<PortMasterEntity>
    ) {
        super(portMasterRepository);
    }

    async findByCode(code: string): Promise<PortMasterDoc | null> {
        return this._repository.findOne({
            where: { code, soft_delete: false } as any,
        });
    }

    /**
     * Filtered list for the dropdown.
     *  - country_code: 'IN' for Indian dropdown (default for loading port)
     *  - types: array filter; pass ['sea','icd','sez'] for sea modes, ['air','icd'] for air modes
     *  - q: case-insensitive search on code OR name
     */
    async findForDropdown(filters: {
        country_code?: string;
        types?: ENUM_PORT_TYPE[];
        q?: string;
        is_active?: boolean;
    }): Promise<PortMasterDoc[]> {
        const qb = this._repository
            .createQueryBuilder('p')
            .where('p.soft_delete = :sd', { sd: false });

        if (filters.is_active !== undefined) {
            qb.andWhere('p.is_active = :ia', { ia: filters.is_active });
        }
        if (filters.country_code) {
            qb.andWhere('p.country_code = :cc', { cc: filters.country_code });
        }
        if (filters.types && filters.types.length > 0) {
            qb.andWhere('p.type IN (:...types)', { types: filters.types });
        }
        if (filters.q) {
            const term = `%${filters.q.trim()}%`;
            qb.andWhere('(p.code ILIKE :term OR p.name ILIKE :term)', { term });
        }

        qb.orderBy('p.code', 'ASC').limit(200);
        return qb.getMany();
    }

    async isCodeExists(code: string, excludeId?: string): Promise<boolean> {
        const where: any = {
            code: ILike(code.trim()),
            soft_delete: false,
        };
        if (excludeId) where._id = Not(excludeId);
        const count = await this._repository.count({ where });
        return count > 0;
    }

    async findManyByIds(ids: string[]): Promise<PortMasterDoc[]> {
        if (!ids.length) return [];
        return this._repository.find({
            where: { _id: In(ids), soft_delete: false } as any,
        });
    }
}
