import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { RfqDoc, RfqEntity } from '../entities/rfq.entity';

@Injectable()
export class RfqRepository extends DatabaseObjectIdRepositoryBase<RfqEntity> {
    constructor(
        @InjectDatabaseModel(RfqEntity)
        private readonly rfqRepository: Repository<RfqEntity>
    ) {
        super(rfqRepository);
    }

    async findByCompanyId(
        companyId: string,
        options?: any
    ): Promise<RfqDoc[]> {
        return this.findAll(
            { company_id: companyId, soft_delete: false },
            options
        );
    }
}
