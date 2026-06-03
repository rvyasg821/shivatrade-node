import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { GrnDoc, GrnEntity } from '../entities/grn.entity';

@Injectable()
export class GrnRepository extends DatabaseObjectIdRepositoryBase<GrnEntity> {
    constructor(
        @InjectDatabaseModel(GrnEntity)
        private readonly grnRepository: Repository<GrnEntity>
    ) {
        super(grnRepository);
    }

    async findByCompanyId(companyId: string, options?: any): Promise<GrnDoc[]> {
        return this.findAll(
            { company_id: companyId, soft_delete: false },
            options
        );
    }
}
