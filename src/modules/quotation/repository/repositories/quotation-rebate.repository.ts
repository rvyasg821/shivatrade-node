import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { QuotationRebateEntity } from '../entities/quotation-rebate.entity';

@Injectable()
export class QuotationRebateRepository extends DatabaseObjectIdRepositoryBase<QuotationRebateEntity> {
    constructor(
        @InjectDatabaseModel(QuotationRebateEntity)
        private readonly quotationRebateRepository: Repository<QuotationRebateEntity>
    ) {
        super(quotationRebateRepository);
    }

    async deleteByQuotationId(quotationId: string): Promise<void> {
        await this._repository
            .createQueryBuilder()
            .delete()
            .where('quotation_id = :id', { id: quotationId })
            .execute();
    }
}
