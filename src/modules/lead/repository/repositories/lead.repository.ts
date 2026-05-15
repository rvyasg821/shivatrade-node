import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { LeadDoc, LeadEntity } from '../entities/lead.entity';

@Injectable()
export class LeadRepository extends DatabaseObjectIdRepositoryBase<LeadEntity> {
    constructor(
        @InjectDatabaseModel(LeadEntity)
        private readonly leadRepository: Repository<LeadEntity>
    ) {
        super(leadRepository);
    }

    async findByCompanyId(
        companyId: string,
        options?: any
    ): Promise<LeadDoc[]> {
        return this.findAll(
            { company_id: companyId, soft_delete: false },
            options
        );
    }
}
