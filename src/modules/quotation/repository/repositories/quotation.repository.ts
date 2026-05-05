import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { QuotationEntity } from '../entities/quotation.entity';

@Injectable()
export class QuotationRepository extends DatabaseObjectIdRepositoryBase<QuotationEntity> {
    constructor(
        @InjectDatabaseModel(QuotationEntity)
        private readonly quotationRepository: Repository<QuotationEntity>
    ) {
        super(quotationRepository);
    }
}
