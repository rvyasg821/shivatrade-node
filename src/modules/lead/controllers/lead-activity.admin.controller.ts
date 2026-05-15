import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { Response } from '@common/response/decorators/response.decorator';
import { IResponse } from '@common/response/interfaces/response.interface';

import { LeadActivityService } from '../services/lead-activity.service';
import { LeadService } from '../services/lead.service';
import { LeadActivityCreateRequestDto } from '../dtos/request/lead-activity.create.request.dto';
import { LeadActivityGetResponseDto } from '../dtos/response/lead-activity.get.response.dto';

@ApiTags('admin.lead.activity')
@Controller({ version: '1', path: '/admin/lead' })
export class LeadActivityAdminController {
    constructor(
        private readonly activityService: LeadActivityService,
        private readonly leadService: LeadService
    ) {}

    @Response('lead.activity.list')
    @AuthJwtAccessProtected()
    @Get('/:leadId/activity')
    async list(
        @Param('leadId') leadId: string
    ): Promise<IResponse<LeadActivityGetResponseDto[]>> {
        // Validates lead exists + tenancy bouncer.
        await this.leadService.findOneById(leadId);
        const data = await this.activityService.list(leadId);
        return { data };
    }

    @Response('lead.activity.create')
    @AuthJwtAccessProtected()
    @Post('/:leadId/activity')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('leadId') leadId: string,
        @Body() body: LeadActivityCreateRequestDto
    ): Promise<IResponse<LeadActivityGetResponseDto>> {
        await this.leadService.findOneById(leadId);
        const row = await this.activityService.addNote(
            companyId,
            leadId,
            body.body,
            userId
        );
        const [mapped] = await this.activityService.list(leadId);
        // list() returns newest first; the row we just inserted is first.
        return { data: mapped };
    }

    @Response('lead.activity.update')
    @AuthJwtAccessProtected()
    @Put('/:leadId/activity/:activityId')
    async update(
        @AuthJwtPayload('user') userId: string,
        @Param('leadId') leadId: string,
        @Param('activityId') activityId: string,
        @Body() body: LeadActivityCreateRequestDto
    ): Promise<IResponse<LeadActivityGetResponseDto>> {
        await this.leadService.findOneById(leadId);
        await this.activityService.updateNote(activityId, body.body, userId);
        const rows = await this.activityService.list(leadId);
        const updated = rows.find((r) => r._id === activityId);
        return { data: updated as LeadActivityGetResponseDto };
    }

    @Response('lead.activity.delete')
    @AuthJwtAccessProtected()
    @Delete('/:leadId/activity/:activityId')
    async remove(
        @AuthJwtPayload('user') userId: string,
        @Param('leadId') leadId: string,
        @Param('activityId') activityId: string
    ): Promise<void> {
        await this.leadService.findOneById(leadId);
        await this.activityService.deleteNote(activityId, userId);
    }
}
