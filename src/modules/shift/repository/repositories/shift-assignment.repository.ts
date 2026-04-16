import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { ShiftAssignmentEntity } from '../entities/shift-assignment.entity';

@Injectable()
export class ShiftAssignmentRepository extends DatabaseObjectIdRepositoryBase<ShiftAssignmentEntity> {
    constructor(
        @InjectDatabaseModel(ShiftAssignmentEntity)
        private readonly repo: Repository<ShiftAssignmentEntity>
    ) {
        super(repo);
    }
}
