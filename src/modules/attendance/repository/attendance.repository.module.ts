import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { AttendanceSettingsEntity } from './entities/attendance-settings.entity';
import { AttendanceRecordEntity } from './entities/attendance-record.entity';
import { AttendanceBreakEntity } from './entities/attendance-break.entity';
import { AttendanceSettingsRepository } from './repositories/attendance-settings.repository';
import { AttendanceRecordRepository } from './repositories/attendance-record.repository';
import { AttendanceBreakRepository } from './repositories/attendance-break.repository';

@Module({
    providers: [AttendanceSettingsRepository, AttendanceRecordRepository, AttendanceBreakRepository],
    exports: [AttendanceSettingsRepository, AttendanceRecordRepository, AttendanceBreakRepository],
    imports: [
        TypeOrmModule.forFeature(
            [AttendanceSettingsEntity, AttendanceRecordEntity, AttendanceBreakEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class AttendanceRepositoryModule {}
