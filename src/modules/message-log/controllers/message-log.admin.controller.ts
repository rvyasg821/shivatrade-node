import {
    Controller,
    Get,
    Param,
    Query,
    HttpStatus,
    HttpCode,
    NotFoundException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { MessageLogService } from '../services/message-log.service';

@ApiTags('admin.message-log')
@Controller({ version: '1', path: '/message-log' })
export class MessageLogAdminController {
    constructor(private readonly messageLogService: MessageLogService) {}

    /**
     * GET /admin/message-log
     * Filters: channel, event_key, status, recipient, date range, page, perPage
     * Scope: company admins see whole company; location admins see only their location
     */
    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') tokenLocationId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Query('channel') channel?: string,
        @Query('event_key') eventKey?: string,
        @Query('status') status?: string,
        @Query('recipient') recipient?: string,
        @Query('location_id') locationIdFilter?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string,
        @Query('_limit') limit?: string,
        @Query('_offset') offset?: string,
    ) {
        // Location admins are restricted to their own location
        const isLocationAdmin = roleName === 'Location Admin';
        const effectiveLocationId = isLocationAdmin
            ? tokenLocationId
            : (locationIdFilter || undefined);

        const { items, total } = await this.messageLogService.list({
            company_id: companyId,
            location_id: effectiveLocationId,
            channel,
            event_key: eventKey,
            status,
            recipient_search: recipient,
            date_from: dateFrom ? new Date(dateFrom) : undefined,
            date_to: dateTo ? new Date(dateTo) : undefined,
            limit: limit ? parseInt(limit, 10) : 25,
            offset: offset ? parseInt(offset, 10) : 0,
        });

        return {
            statusCode: 200,
            message: 'Success',
            data: items,
            _pagination: {
                total,
                totalPage: Math.ceil(total / (limit ? parseInt(limit, 10) : 25)),
            },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/:id')
    async detail(
        @Param('id') id: string,
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') tokenLocationId: string,
        @AuthJwtPayload('roleName') roleName: string,
    ) {
        const log = await this.messageLogService.findOneById(id);
        if (!log) throw new NotFoundException('Message log not found');

        // Scope check
        if (log.company_id && log.company_id !== companyId) {
            throw new NotFoundException('Message log not found');
        }
        if (roleName === 'Location Admin' && log.location_id !== tokenLocationId) {
            throw new NotFoundException('Message log not found');
        }

        return { statusCode: 200, message: 'Success', data: log };
    }
}
