import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { HolidayRepository } from '../repository/repositories/holiday.repository';
import { HolidayDoc } from '../repository/entities/holiday.entity';
import { HolidayCreateRequestDto } from '../dtos/request/holiday.create.request.dto';
import { HolidayUpdateRequestDto } from '../dtos/request/holiday.update.request.dto';
import { HolidayGetResponseDto } from '../dtos/response/holiday.get.response.dto';

@Injectable()
export class HolidayService {
    private readonly logger = new Logger(HolidayService.name);

    constructor(private readonly holidayRepository: HolidayRepository) {}

    async create(
        companyId: string,
        calendarId: string,
        data: HolidayCreateRequestDto,
        createdBy: string
    ): Promise<HolidayDoc> {
        const holiday = await this.holidayRepository.create({
            ...data,
            company_id: companyId,
            calendar_id: calendarId,
            createdBy,
        } as any);

        this.logger.log(`Holiday created: ${holiday._id} in calendar: ${calendarId}`);
        return holiday;
    }

    async findByCalendar(calendarId: string, options?: any): Promise<HolidayDoc[]> {
        return this.holidayRepository.findByCalendarId(calendarId, options);
    }

    /**
     * Find holidays in a date range for a company — used by Leave Management
     * to exclude holidays when calculating working days
     */
    async findByDateRange(
        companyId: string,
        startDate: string,
        endDate: string
    ): Promise<HolidayDoc[]> {
        return this.holidayRepository.findByDateRange(companyId, startDate, endDate);
    }

    async findOneById(id: string): Promise<HolidayDoc> {
        const holiday = await this.holidayRepository.findOneById(id);
        if (!holiday || holiday.soft_delete) {
            throw new NotFoundException('Holiday not found');
        }
        return holiday;
    }

    async update(holiday: HolidayDoc, data: HolidayUpdateRequestDto): Promise<HolidayDoc> {
        Object.assign(holiday, data);
        const updated = await this.holidayRepository.save(holiday);
        this.logger.log(`Holiday updated: ${holiday._id}`);
        return updated;
    }

    async softDelete(holiday: HolidayDoc): Promise<HolidayDoc> {
        holiday.soft_delete = true;
        const updated = await this.holidayRepository.save(holiday);
        this.logger.log(`Holiday soft deleted: ${holiday._id}`);
        return updated;
    }

    async softDeleteByCalendar(calendarId: string): Promise<void> {
        const holidays = await this.holidayRepository.findByCalendarId(calendarId);
        for (const holiday of holidays) {
            holiday.soft_delete = true;
            await this.holidayRepository.save(holiday);
        }
    }

    mapGet(holiday: HolidayDoc): HolidayGetResponseDto {
        return plainToInstance(HolidayGetResponseDto, holiday);
    }

    mapList(holidays: HolidayDoc[]): HolidayGetResponseDto[] {
        return holidays.map((h) => plainToInstance(HolidayGetResponseDto, h));
    }
}
