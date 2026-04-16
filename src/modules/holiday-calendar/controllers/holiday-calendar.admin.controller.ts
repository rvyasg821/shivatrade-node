import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    HttpStatus,
    HttpCode,
    UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { ToolAccessGuard } from '@modules/subscription/guards/tool-access.guard';
import { RequireToolAccess } from '@modules/subscription/decorators/tool-access.decorator';

import { HolidayCalendarService } from '../services/holiday-calendar.service';
import { HolidayService } from '../services/holiday.service';
import { UkBankHolidaysService } from '../services/uk-bank-holidays.service';
import { HolidayCalendarRepository } from '../repository/repositories/holiday-calendar.repository';
import { HolidayRepository } from '../repository/repositories/holiday.repository';

import { HolidayCalendarCreateRequestDto } from '../dtos/request/holiday-calendar.create.request.dto';
import { HolidayCalendarUpdateRequestDto } from '../dtos/request/holiday-calendar.update.request.dto';
import { HolidayCreateRequestDto } from '../dtos/request/holiday.create.request.dto';
import { HolidayUpdateRequestDto } from '../dtos/request/holiday.update.request.dto';
import { ImportUkHolidaysRequestDto } from '../dtos/request/import-uk-holidays.request.dto';
import { ENUM_HOLIDAY_TYPE } from '../enums/holiday-calendar.enum';

@ApiTags('admin.holiday-calendar')
@UseGuards(ToolAccessGuard)
@RequireToolAccess(['hrm-holiday-calendar'])
@Controller({
    version: '1',
    path: '/holiday-calendar',
})
export class HolidayCalendarAdminController {
    constructor(
        private readonly holidayCalendarService: HolidayCalendarService,
        private readonly holidayService: HolidayService,
        private readonly ukBankHolidaysService: UkBankHolidaysService,
        private readonly holidayCalendarRepository: HolidayCalendarRepository,
        private readonly holidayRepository: HolidayRepository,
    ) {}

    // ============ CALENDAR CRUD ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: HolidayCalendarCreateRequestDto,
    ) {
        const calendar = await this.holidayCalendarService.create(companyId, body, userId);
        return { statusCode: 200, message: 'Calendar created', data: this.holidayCalendarService.mapGet(calendar) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('_limit') limit?: number,
        @Query('_offset') offset?: number,
        @Query('_search') search?: string,
        @Query('year') year?: string,
        @Query('location_id') locationId?: string,
    ) {
        const find: any = { soft_delete: false };
        if (companyId) find.company_id = companyId;
        if (year) find.year = parseInt(year, 10);

        // Build $or conditions combining location filter + search
        const orConditions: any[] = [];
        if (locationId && search) {
            orConditions.push(
                { location_id: locationId, name: { $regex: search, $options: 'i' } },
                { location_id: null, name: { $regex: search, $options: 'i' } },
            );
        } else if (locationId) {
            orConditions.push(
                { location_id: locationId },
                { location_id: null },
            );
        } else if (search) {
            orConditions.push({ name: { $regex: search, $options: 'i' } });
        }
        if (orConditions.length > 0) find.$or = orConditions;

        const _limit = limit ? +limit : 20;
        const _offset = offset ? +offset : 0;

        const [calendars, total] = await Promise.all([
            this.holidayCalendarRepository.findAll(find, {
                paging: { limit: _limit, offset: _offset },
            }),
            this.holidayCalendarRepository.getTotal(find),
        ]);

        return {
            statusCode: 200,
            message: 'Success',
            data: this.holidayCalendarService.mapList(calendars),
            _metadata: {
                pagination: { total, totalPage: Math.ceil(total / _limit) },
            },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/get/:calendarId')
    async get(@Param('calendarId') calendarId: string) {
        const calendar = await this.holidayCalendarService.findOneById(calendarId);
        const holidays = await this.holidayService.findByCalendar(calendarId);
        const dto = this.holidayCalendarService.mapGet(calendar);
        dto.holidays = this.holidayService.mapList(holidays);
        return { statusCode: 200, message: 'Success', data: dto };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/update/:calendarId')
    async update(
        @Param('calendarId') calendarId: string,
        @Body() body: HolidayCalendarUpdateRequestDto,
    ) {
        const calendar = await this.holidayCalendarService.findOneById(calendarId);
        const updated = await this.holidayCalendarService.update(calendar, body);
        return { statusCode: 200, message: 'Calendar updated', data: this.holidayCalendarService.mapGet(updated) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/delete/:calendarId')
    async delete(@Param('calendarId') calendarId: string) {
        const calendar = await this.holidayCalendarService.findOneById(calendarId);
        await this.holidayService.softDeleteByCalendar(calendarId);
        await this.holidayCalendarService.softDelete(calendar);
        return { statusCode: 200, message: 'Calendar deleted' };
    }

    // ============ UK BANK HOLIDAYS IMPORT ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/import-uk')
    async importUk(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: ImportUkHolidaysRequestDto,
    ) {
        const ukHolidays = this.ukBankHolidaysService.getUkBankHolidays(body.year);

        let calendar: any;
        if (body.calendar_id) {
            calendar = await this.holidayCalendarService.findOneById(body.calendar_id);
        } else {
            calendar = await this.holidayCalendarService.create(
                companyId,
                {
                    name: `UK Bank Holidays ${body.year}`,
                    year: body.year,
                    is_default: true,
                    is_active: true,
                },
                userId,
            );
        }

        for (const h of ukHolidays) {
            await this.holidayService.create(companyId, calendar._id, {
                calendar_id: calendar._id,
                name: h.name,
                date: h.date,
                type: ENUM_HOLIDAY_TYPE.BANK_HOLIDAY,
                is_recurring: false,
            }, userId);
        }

        const holidays = await this.holidayService.findByCalendar(calendar._id);
        const dto = this.holidayCalendarService.mapGet(calendar);
        dto.holidays = this.holidayService.mapList(holidays);
        return { statusCode: 200, message: 'UK holidays imported', data: dto };
    }

    // ============ HOLIDAY CRUD ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/holiday/create')
    async createHoliday(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: HolidayCreateRequestDto,
    ) {
        await this.holidayCalendarService.findOneById(body.calendar_id);
        const holiday = await this.holidayService.create(companyId, body.calendar_id, body, userId);
        return { statusCode: 200, message: 'Holiday created', data: this.holidayService.mapGet(holiday) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/holiday/update/:holidayId')
    async updateHoliday(
        @Param('holidayId') holidayId: string,
        @Body() body: HolidayUpdateRequestDto,
    ) {
        const holiday = await this.holidayService.findOneById(holidayId);
        const updated = await this.holidayService.update(holiday, body);
        return { statusCode: 200, message: 'Holiday updated', data: this.holidayService.mapGet(updated) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/holiday/delete/:holidayId')
    async deleteHoliday(@Param('holidayId') holidayId: string) {
        const holiday = await this.holidayService.findOneById(holidayId);
        await this.holidayService.softDelete(holiday);
        return { statusCode: 200, message: 'Holiday deleted' };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/holidays')
    async listHolidays(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('_limit') limit?: number,
        @Query('_offset') offset?: number,
        @Query('calendar_id') calendarId?: string,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
        @Query('location_id') locationId?: string,
    ) {
        const find: any = { company_id: companyId, soft_delete: false };
        if (calendarId) find.calendar_id = calendarId;

        // Date range filter
        if (startDate && endDate) {
            find.date = { $gte: startDate, $lte: endDate };
        } else if (startDate) {
            find.date = { $gte: startDate };
        } else if (endDate) {
            find.date = { $lte: endDate };
        }

        // Location filter: include holidays from matching location calendars + company-wide calendars
        if (locationId) {
            const calendarFind: any = { company_id: companyId, soft_delete: false, is_active: true };
            calendarFind.$or = [{ location_id: locationId }, { location_id: null }];
            const calendars = await this.holidayCalendarRepository.findAll(calendarFind, { paging: { limit: 100, offset: 0 } });
            const calendarIds = calendars.map((c: any) => c._id?.toString?.() || c._id);
            if (calendarIds.length > 0) {
                find.calendar_id = { $in: calendarIds };
            } else {
                // No matching calendars, return empty
                return { statusCode: 200, message: 'Success', data: [], _metadata: { total: 0, limit: limit || 100, offset: offset || 0 } };
            }
        }

        const _limit = limit ? +limit : 100;
        const _offset = offset ? +offset : 0;

        const [holidays, total] = await Promise.all([
            this.holidayRepository.findAll(find, { paging: { limit: _limit, offset: _offset } }),
            this.holidayRepository.getTotal(find),
        ]);

        return {
            statusCode: 200,
            message: 'Success',
            data: this.holidayService.mapList(holidays),
            _metadata: { total, limit: _limit, offset: _offset },
        };
    }
}
