import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { QuotationExpenseEntity } from '../entities/quotation-expense.entity';

@Injectable()
export class QuotationExpenseRepository extends DatabaseObjectIdRepositoryBase<QuotationExpenseEntity> {
    constructor(
        @InjectDatabaseModel(QuotationExpenseEntity)
        private readonly quotationExpenseRepository: Repository<QuotationExpenseEntity>
    ) {
        super(quotationExpenseRepository);
    }

    async deleteByQuotationId(quotationId: string): Promise<void> {
        await this._repository
            .createQueryBuilder()
            .delete()
            .where('quotation_id = :id', { id: quotationId })
            .execute();
    }
}
