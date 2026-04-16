import { Module } from '@nestjs/common';
import { HolidayCalendarRepositoryModule } from './repository/holiday-calendar.repository.module';
import { HolidayCalendarService } from './services/holiday-calendar.service';
import { HolidayService } from './services/holiday.service';
import { UkBankHolidaysService } from './services/uk-bank-holidays.service';

@Module({
    imports: [HolidayCalendarRepositoryModule],
    providers: [HolidayCalendarService, HolidayService, UkBankHolidaysService],
    exports: [
        HolidayCalendarRepositoryModule,
        HolidayCalendarService,
        HolidayService,
        UkBankHolidaysService,
    ],
})
export class HolidayCalendarModule {}
