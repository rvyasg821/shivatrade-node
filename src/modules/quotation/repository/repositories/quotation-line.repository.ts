import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { QuotationLineEntity } from '../entities/quotation-line.entity';

@Injectable()
export class QuotationLineRepository extends DatabaseObjectIdRepositoryBase<QuotationLineEntity> {
    constructor(
        @InjectDatabaseModel(QuotationLineEntity)
        private readonly quotationLineRepository: Repository<QuotationLineEntity>
    ) {
        super(quotationLineRepository);
    }

    async deleteByQuotationId(quotationId: string): Promise<void> {
        await this._repository
            .createQueryBuilder()
            .delete()
            .where('quotation_id = :id', { id: quotationId })
            .execute();
    }
}
