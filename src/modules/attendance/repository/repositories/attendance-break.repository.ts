import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { AttendanceBreakEntity } from '../entities/attendance-break.entity';

@Injectable()
export class AttendanceBreakRepository extends DatabaseObjectIdRepositoryBase<AttendanceBreakEntity> {
    constructor(
        @InjectDatabaseModel(AttendanceBreakEntity)
        private readonly repo: Repository<AttendanceBreakEntity>
    ) {
        super(repo);
    }
}
