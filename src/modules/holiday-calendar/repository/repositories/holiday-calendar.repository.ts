import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { HolidayCalendarDoc, HolidayCalendarEntity } from '../entities/holiday-calendar.entity';

@Injectable()
export class HolidayCalendarRepository extends DatabaseObjectIdRepositoryBase<HolidayCalendarEntity> {
    constructor(
        @InjectDatabaseModel(HolidayCalendarEntity)
        private readonly holidayCalendarRepo: Repository<HolidayCalendarEntity>
    ) {
        super(holidayCalendarRepo);
    }

    async findByCompanyId(companyId: string, options?: any): Promise<HolidayCalendarDoc[]> {
        return this.findAll({ company_id: companyId, soft_delete: false }, options);
    }

    async findByCompanyAndYear(companyId: string, year: number): Promise<HolidayCalendarDoc[]> {
        return this.findAll({ company_id: companyId, year, soft_delete: false });
    }
}
