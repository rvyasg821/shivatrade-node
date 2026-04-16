import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { LeaveEntitlementEntity } from '../entities/leave-entitlement.entity';

@Injectable()
export class LeaveEntitlementRepository extends DatabaseObjectIdRepositoryBase<LeaveEntitlementEntity> {
    constructor(
        @InjectDatabaseModel(LeaveEntitlementEntity)
        private readonly repo: Repository<LeaveEntitlementEntity>
    ) {
        super(repo);
    }
}
