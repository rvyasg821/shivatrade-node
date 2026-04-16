import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { HolidayCalendarRepository } from '../repository/repositories/holiday-calendar.repository';
import { HolidayCalendarDoc } from '../repository/entities/holiday-calendar.entity';
import { HolidayCalendarCreateRequestDto } from '../dtos/request/holiday-calendar.create.request.dto';
import { HolidayCalendarUpdateRequestDto } from '../dtos/request/holiday-calendar.update.request.dto';
import { HolidayCalendarGetResponseDto } from '../dtos/response/holiday-calendar.get.response.dto';
import { HolidayCalendarListResponseDto } from '../dtos/response/holiday-calendar.list.response.dto';

@Injectable()
export class HolidayCalendarService {
    private readonly logger = new Logger(HolidayCalendarService.name);

    constructor(private readonly holidayCalendarRepository: HolidayCalendarRepository) {}

    async create(
        companyId: string,
        data: HolidayCalendarCreateRequestDto,
        createdBy: string
    ): Promise<HolidayCalendarDoc> {
        const calendar = await this.holidayCalendarRepository.create({
            ...data,
            company_id: companyId,
            createdBy,
        } as any);

        this.logger.log(`Holiday calendar created: ${calendar._id} for company: ${companyId}`);
        return calendar;
    }

    async findAll(companyId: string, options?: any): Promise<HolidayCalendarDoc[]> {
        return this.holidayCalendarRepository.findByCompanyId(companyId, options);
    }

    async findOneById(id: string): Promise<HolidayCalendarDoc> {
        const calendar = await this.holidayCalendarRepository.findOneById(id);
        if (!calendar || calendar.soft_delete) {
            throw new NotFoundException('Holiday calendar not found');
        }
        return calendar;
    }

    async update(
        calendar: HolidayCalendarDoc,
        data: HolidayCalendarUpdateRequestDto
    ): Promise<HolidayCalendarDoc> {
        Object.assign(calendar, data);
        const updated = await this.holidayCalendarRepository.save(calendar);
        this.logger.log(`Holiday calendar updated: ${calendar._id}`);
        return updated;
    }

    async softDelete(calendar: HolidayCalendarDoc): Promise<HolidayCalendarDoc> {
        calendar.soft_delete = true;
        calendar.is_active = false;
        const updated = await this.holidayCalendarRepository.save(calendar);
        this.logger.log(`Holiday calendar soft deleted: ${calendar._id}`);
        return updated;
    }

    mapGet(calendar: HolidayCalendarDoc): HolidayCalendarGetResponseDto {
        return plainToInstance(HolidayCalendarGetResponseDto, calendar);
    }

    mapList(calendars: HolidayCalendarDoc[]): HolidayCalendarListResponseDto[] {
        return calendars.map((c) => plainToInstance(HolidayCalendarListResponseDto, c));
    }
}
