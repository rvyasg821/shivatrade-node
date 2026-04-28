import { Injectable } from '@nestjs/common';
import { Repository, Not, ILike } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { CurrencyDoc, CurrencyEntity } from '../entities/currency.entity';

@Injectable()
export class CurrencyRepository extends DatabaseObjectIdRepositoryBase<CurrencyEntity> {
    constructor(
        @InjectDatabaseModel(CurrencyEntity)
        private readonly currencyRepository: Repository<CurrencyEntity>
    ) {
        super(currencyRepository);
    }

    async findByCompanyId(
        companyId: string,
        options?: any
    ): Promise<CurrencyDoc[]> {
        return this.findAll(
            { company_id: companyId, soft_delete: false },
            options
        );
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
