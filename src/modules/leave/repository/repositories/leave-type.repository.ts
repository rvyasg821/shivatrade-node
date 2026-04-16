import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { LeaveTypeEntity } from '../entities/leave-type.entity';

@Injectable()
export class LeaveTypeRepository extends DatabaseObjectIdRepositoryBase<LeaveTypeEntity> {
    constructor(
        @InjectDatabaseModel(LeaveTypeEntity)
        private readonly repo: Repository<LeaveTypeEntity>
    ) {
        super(repo);
    }
}
