import { Injectable } from '@nestjs/common';
import { Repository, Not, ILike } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { RebateDoc, RebateEntity } from '../entities/rebate.entity';

@Injectable()
export class RebateRepository extends DatabaseObjectIdRepositoryBase<RebateEntity> {
    constructor(
        @InjectDatabaseModel(RebateEntity)
        private readonly rebateRepository: Repository<RebateEntity>
    ) {
        super(rebateRepository);
    }

    async findByCompanyId(
        companyId: string,
        options?: any
    ): Promise<RebateDoc[]> {
        return this.findAll(
            { company_id: companyId, soft_delete: false },
            options
        );
    }

    async isNameExists(
        companyId: string,
        name: string,
        excludeId?: string
    ): Promise<boolean> {
        const where: any = {
            company_id: companyId,
            name: ILike(name.trim()),
            soft_delete: false,
        };
        if (excludeId) where._id = Not(excludeId);
        const count = await this._repository.count({ where });
        return count > 0;
    }

    async isCodeExists(
        companyId: string,
        code: string,
        excludeId?: string
    ): Promise<boolean> {
        const where: any = {
            company_id: companyId,
            code: ILike(code.trim()),
            soft_delete: false,
        };
        if (excludeId) where._id = Not(excludeId);
        const count = await this._repository.count({ where });
        return count > 0;
    }
}
