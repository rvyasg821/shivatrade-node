import {
    Controller, Get, Post, Put, Delete,
    Body, Param, Query, HttpStatus, HttpCode, UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { ToolAccessGuard } from '@modules/subscription/guards/tool-access.guard';
import { RequireToolAccess } from '@modules/subscription/decorators/tool-access.decorator';

import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { LeaveCalendarService } from '@modules/leave/services/leave-calendar.service';
import { ENUM_LEAVE_REQUEST_STATUS } from '@modules/leave/enums/leave.enum';
import { ShiftTemplateService } from '../services/shift-template.service';
import { ShiftAssignmentService } from '../services/shift-assignment.service';
import { ShiftSwapService } from '../services/shift-swap.service';
import { ShiftRotaBuilderService } from '../services/shift-rota-builder.service';
import { ShiftConflictService } from '../services/shift-conflict.service';
import { ShiftNotificationService } from '../services/shift-notification.service';
import { ShiftTemplateCreateRequestDto, ShiftTemplateUpdateRequestDto } from '../dtos/request/shift-template.create.request.dto';
import {
    ShiftAssignmentCreateRequestDto,
    ShiftBulkAssignRequestDto,
    ShiftPublishRequestDto,
    ShiftCopyWeekRequestDto,
} from '../dtos/request/shift-assignment.request.dto';
import { ShiftSwapAdminDecideDto } from '../dtos/request/shift-swap.request.dto';

@ApiTags('admin.shift')
@UseGuards(ToolAccessGuard)
@RequireToolAccess(['hrm-shift-rota'])
@Controller({ version: '1', path: '/shift' })
export class ShiftAdminController {
    constructor(
        private readonly templateService: ShiftTemplateService,
        private readonly assignmentService: ShiftAssignmentService,
        private readonly swapService: ShiftSwapService,
        private readonly rotaBuilder: ShiftRotaBuilderService,
        private readonly conflictService: ShiftConflictService,
        private readonly leaveCalendarService: LeaveCalendarService,
        private readonly shiftNotificationService: ShiftNotificationService,
    ) {}

    // ============ TEMPLATES ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/template/list')
    async listTemplates(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Query('_locationId') queryLocationId?: string,
    ) {
        // Location Admins can filter by any of their assigned locations; falls back to JWT location
        // Company Admins (and above) see all templates (pass locationId to also include location-specific ones for the selected location, or null for all)
        let filterLocationId = queryLocationId || undefined;
        if (roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN) {
            filterLocationId = queryLocationId || jwtLocationId;
        }
        const items = await this.templateService.findAll(companyId, filterLocationId);
        return { statusCode: 200, message: 'Success', data: items.map(t => this.templateService.mapGet(t)) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/template/get/:id')
    async getTemplate(@Param('id') id: string) {
        const item = await this.templateService.findOneById(id);
        return { statusCode: 200, message: 'Success', data: this.templateService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/template/create')
    async createTemplate(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') locationId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Body() body: ShiftTemplateCreateRequestDto,
    ) {
        // Location Admins always create location-specific templates (auto-set their locationId)
        // Company Admins create company-wide templates (location_id = null) unless they explicitly set one
        const resolvedLocationId = roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN
            ? locationId
            : (body.location_id ?? null);
        const item = await this.templateService.create(companyId, { ...body, location_id: resolvedLocationId });
        return { statusCode: 200, message: 'Template created', data: this.templateService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/template/update/:id')
    async updateTemplate(
        @Param('id') id: string,
        @Body() body: ShiftTemplateUpdateRequestDto,
    ) {
        const item = await this.templateService.update(id, body as any);
        return { statusCode: 200, message: 'Template updated', data: this.templateService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/template/delete/:id')
    async deleteTemplate(@Param('id') id: string) {
        await this.templateService.softDelete(id);
        return { statusCode: 200, message: 'Template deleted' };
    }

    // ============ ASSIGNMENTS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/assignment/list')
    async listAssignments(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('_startDate') startDate?: string,
        @Query('_endDate') endDate?: string,
        @Query('_userId') userId?: string,
        @Query('_locationId') locationId?: string,
        @Query('_limit') limit?: number,
        @Query('_offset') offset?: number,
    ) {
        const filters: any = {};
        if (userId) filters.user_id = userId;
        if (locationId) filters.location_id = locationId;
        if (startDate || endDate) {
            filters.date = {};
            if (startDate) filters.date.$gte = startDate;
            if (endDate) filters.date.$lte = endDate;
        }
        const [items, total] = await Promise.all([
            this.assignmentService.findAll(companyId, limit ? +limit : 50, offset ? +offset : 0, filters),
            this.assignmentService.getTotal(companyId, filters),
        ]);
        return {
            statusCode: 200, message: 'Success',
            data: items.map(a => this.assignmentService.mapGet(a)),
            _metadata: { total, limit: limit ? +limit : 50, offset: offset ? +offset : 0 },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/assignment/get/:id')
    async getAssignment(@Param('id') id: string) {
        const item = await this.assignmentService.findOneById(id);
        return { statusCode: 200, message: 'Success', data: this.assignmentService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/assignment/create')
    async createAssignment(
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: ShiftAssignmentCreateRequestDto,
    ) {
        const item = await this.assignmentService.create(companyId, body);
        return { statusCode: 200, message: 'Assignment created', data: this.assignmentService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/assignment/update/:id')
    async updateAssignment(
        @Param('id') id: string,
        @Body() body: any,
    ) {
        const item = await this.assignmentService.update(id, body);

        // Notify employee only if assignment is published
        if (item.published) {
            this.shiftNotificationService.notifyShiftUpdated(item).catch(() => {});
        }

        return { statusCode: 200, message: 'Assignment updated', data: this.assignmentService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/assignment/delete/:id')
    async deleteAssignment(@Param('id') id: string) {
        await this.assignmentService.softDelete(id);
        return { statusCode: 200, message: 'Assignment deleted' };
    }

    // ============ ROTA BUILDER ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/rota/bulk-assign')
    async bulkAssign(
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: ShiftBulkAssignRequestDto,
    ) {
        const result = await this.rotaBuilder.assignWeekPattern(
            companyId,
            body.user_ids,
            body.monday,
            body.shift_template_id,
            body.location_id,
            body.include_days ?? [0, 1, 2, 3, 4],
            body.exclude_dates ?? [],
        );
        return { statusCode: 200, message: `Created ${result.created}, skipped ${result.skipped}`, data: result };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/rota/copy-week')
    async copyWeek(
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: ShiftCopyWeekRequestDto,
    ) {
        const result = await this.rotaBuilder.copyWeek(
            companyId,
            body.source_monday,
            body.target_monday,
            body.location_id,
            body.exclude_dates ?? [],
        );
        return { statusCode: 200, message: `Copied ${result.created} assignments`, data: result };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/rota/publish')
    async publishRota(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') adminId: string,
        @Body() body: ShiftPublishRequestDto,
    ) {
        const count = await this.assignmentService.publish(
            companyId,
            body.start_date,
            body.end_date,
            adminId,
            body.location_id,
        );

        // Send notifications to affected employees
        const assignments = await this.assignmentService.findAll(companyId, 1000, 0, {
            date: { $gte: body.start_date, $lte: body.end_date },
            ...(body.location_id ? { location_id: body.location_id } : {}),
            published: true,
        });
        const userIds = [...new Set(assignments.map(a => a.user_id))];
        this.shiftNotificationService.notifyShiftPublished(companyId, body.location_id, userIds, body.start_date).catch(() => {});

        return { statusCode: 200, message: `Published ${count} assignments` };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/rota/check-conflicts')
    async checkConflicts(
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: { user_ids: string[]; dates: string[] },
    ) {
        const conflicts = await this.conflictService.detectConflicts(companyId, body.user_ids, body.dates);
        return { statusCode: 200, message: 'Success', data: conflicts };
    }

    // ============ ROTA LEAVES ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/rota/leaves')
    async getRotaLeaves(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('_startDate') startDate: string,
        @Query('_endDate') endDate: string,
        @Query('_locationId') locationId?: string,
    ) {
        const allLeaves = await this.leaveCalendarService.getCalendarData(
            companyId,
            startDate,
            endDate,
            locationId,
        );
        // Filter to approved only for rota display
        const approved = allLeaves
            .filter(l => l.status === ENUM_LEAVE_REQUEST_STATUS.APPROVED)
            .map(l => ({
                _id: l._id,
                user_id: l.user_id,
                start_date: l.start_date,
                end_date: l.end_date,
                leave_type_id: l.leave_type_id,
                total_days: l.total_days,
            }));
        return { statusCode: 200, message: 'Success', data: approved };
    }

    // ============ SWAP MANAGEMENT ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/swap/list')
    async listSwaps(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Query('_status') status?: string,
        @Query('_locationId') queryLocationId?: string,
    ) {
        const filters: any = {};
        if (status) filters.status = status;

        // Location Admin → use query param if provided, fall back to JWT location
        // Company Admin → optionally filter by query param
        let filterLocationId = queryLocationId || undefined;
        if (roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN) {
            filterLocationId = queryLocationId || jwtLocationId;
        }

        const items = await this.swapService.findAllForAdmin(companyId, filters, filterLocationId);
        const mapped = items.map(s => this.swapService.mapGet(s));
        const enriched = await this.swapService.enrichWithUserDetails(mapped);
        return { statusCode: 200, message: 'Success', data: enriched };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/swap/decide/:id')
    async adminDecide(
        @Param('id') id: string,
        @AuthJwtPayload('user') adminId: string,
        @Body() body: ShiftSwapAdminDecideDto,
    ) {
        const item = await this.swapService.adminDecide(id, adminId, body.approve, body.notes);

        if (body.approve) {
            this.shiftNotificationService.notifySwapApproved(item, adminId).catch(() => {});
        } else {
            this.shiftNotificationService.notifySwapRejected(item, adminId).catch(() => {});
        }

        return { statusCode: 200, message: body.approve ? 'Swap approved' : 'Swap rejected', data: this.swapService.mapGet(item) };
    }
}
