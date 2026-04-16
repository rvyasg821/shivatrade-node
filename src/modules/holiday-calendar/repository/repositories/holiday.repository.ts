import { Injectable } from '@nestjs/common';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual, And } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { HolidayDoc, HolidayEntity } from '../entities/holiday.entity';

@Injectable()
export class HolidayRepository extends DatabaseObjectIdRepositoryBase<HolidayEntity> {
    constructor(
        @InjectDatabaseModel(HolidayEntity)
        private readonly holidayRepo: Repository<HolidayEntity>
    ) {
        super(holidayRepo);
    }

    async findByCalendarId(calendarId: string, options?: any): Promise<HolidayDoc[]> {
        return this.findAll({ calendar_id: calendarId, soft_delete: false }, options);
    }

    async findByDateRange(
        companyId: string,
        startDate: string,
        endDate: string
    ): Promise<HolidayDoc[]> {
        return this.holidayRepo.find({
            where: {
                company_id: companyId,
                soft_delete: false,
                date: And(MoreThanOrEqual(startDate), LessThanOrEqual(endDate)) as any,
            } as any,
            order: { date: 'ASC' },
        }) as any;
    }

    async findByCalendarIdAndDateRange(
        calendarId: string,
        startDate: string,
        endDate: string
    ): Promise<HolidayDoc[]> {
        return this.holidayRepo.find({
            where: {
                calendar_id: calendarId,
                soft_delete: false,
                date: And(MoreThanOrEqual(startDate), LessThanOrEqual(endDate)) as any,
            } as any,
            order: { date: 'ASC' },
        }) as any;
    }
}
