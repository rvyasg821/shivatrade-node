import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { AttendanceSettingsEntity } from '../entities/attendance-settings.entity';

@Injectable()
export class AttendanceSettingsRepository extends DatabaseObjectIdRepositoryBase<AttendanceSettingsEntity> {
    constructor(
        @InjectDatabaseModel(AttendanceSettingsEntity)
        private readonly repo: Repository<AttendanceSettingsEntity>
    ) {
        super(repo);
    }
}
