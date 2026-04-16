import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { LeavePolicyEntity } from '../entities/leave-policy.entity';

@Injectable()
export class LeavePolicyRepository extends DatabaseObjectIdRepositoryBase<LeavePolicyEntity> {
    constructor(
        @InjectDatabaseModel(LeavePolicyEntity)
        private readonly repo: Repository<LeavePolicyEntity>
    ) {
        super(repo);
    }
}
