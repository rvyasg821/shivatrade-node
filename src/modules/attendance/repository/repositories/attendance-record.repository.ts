import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { AttendanceRecordEntity } from '../entities/attendance-record.entity';

@Injectable()
export class AttendanceRecordRepository extends DatabaseObjectIdRepositoryBase<AttendanceRecordEntity> {
    constructor(
        @InjectDatabaseModel(AttendanceRecordEntity)
        private readonly repo: Repository<AttendanceRecordEntity>
    ) {
        super(repo);
    }
}
