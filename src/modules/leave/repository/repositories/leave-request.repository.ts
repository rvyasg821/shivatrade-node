import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { LeaveRequestEntity } from '../entities/leave-request.entity';

@Injectable()
export class LeaveRequestRepository extends DatabaseObjectIdRepositoryBase<LeaveRequestEntity> {
    constructor(
        @InjectDatabaseModel(LeaveRequestEntity)
        private readonly repo: Repository<LeaveRequestEntity>
    ) {
        super(repo);
    }
}
