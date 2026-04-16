import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { HolidayCalendarEntity } from './entities/holiday-calendar.entity';
import { HolidayEntity } from './entities/holiday.entity';
import { HolidayCalendarRepository } from './repositories/holiday-calendar.repository';
import { HolidayRepository } from './repositories/holiday.repository';

@Module({
    providers: [HolidayCalendarRepository, HolidayRepository],
    exports: [HolidayCalendarRepository, HolidayRepository],
    imports: [
        TypeOrmModule.forFeature(
            [HolidayCalendarEntity, HolidayEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class HolidayCalendarRepositoryModule {}
