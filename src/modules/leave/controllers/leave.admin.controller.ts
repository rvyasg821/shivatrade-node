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

import { LeaveTypeService } from '../services/leave-type.service';
import { LeavePolicyService } from '../services/leave-policy.service';
import { LeaveEntitlementService } from '../services/leave-entitlement.service';
import { LeaveRequestService } from '../services/leave-request.service';
import { BradfordFactorService } from '../services/bradford-factor.service';
import { LeaveCalendarService } from '../services/leave-calendar.service';
import { LeaveNotificationService } from '../services/leave-notification.service';
import { ShiftAssignmentService } from '@modules/shift/services/shift-assignment.service';
import { AttendanceService } from '@modules/attendance/services/attendance.service';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';

import { LeaveTypeCreateRequestDto } from '../dtos/request/leave-type.create.request.dto';
import { LeaveRejectRequestDto } from '../dtos/request/leave-reject.request.dto';
import { LeavePolicyUpdateRequestDto } from '../dtos/request/leave-policy.update.request.dto';
import { LeaveEntitlementUpdateRequestDto } from '../dtos/request/leave-entitlement.update.request.dto';

@ApiTags('admin.leave')
@UseGuards(ToolAccessGuard)
@RequireToolAccess(['hrm-leave'])
@Controller({
    version: '1',
    path: '/leave',
})
export class LeaveAdminController {
    constructor(
        private readonly leaveTypeService: LeaveTypeService,
        private readonly policyService: LeavePolicyService,
        private readonly entitlementService: LeaveEntitlementService,
        private readonly requestService: LeaveRequestService,
        private readonly bradfordService: BradfordFactorService,
        private readonly calendarService: LeaveCalendarService,
        private readonly leaveNotificationService: LeaveNotificationService,
        private readonly shiftAssignmentService: ShiftAssignmentService,
        private readonly attendanceService: AttendanceService,
    ) {}

    // ============ LEAVE TYPES ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/type/list')
    async listLeaveTypes(@AuthJwtPayload('companyId') companyId: string) {
        const items = await this.leaveTypeService.findByCompany(companyId);
        return { statusCode: 200, message: 'Success', data: items.map(lt => this.leaveTypeService.mapGet(lt)) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/type/create')
    async createLeaveType(
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: LeaveTypeCreateRequestDto
    ) {
        const slug = body.slug || body.name.toLowerCase().replace(/\s+/g, '_');
        const item = await this.leaveTypeService.create(companyId, { ...body, slug });
        return { statusCode: 200, message: 'Leave type created', data: this.leaveTypeService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/type/update/:id')
    async updateLeaveType(
        @Param('id') id: string,
        @Body() body: Partial<LeaveTypeCreateRequestDto>
    ) {
        const item = await this.leaveTypeService.update(id, body as any);
        return { statusCode: 200, message: 'Leave type updated', data: this.leaveTypeService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/type/delete/:id')
    async deleteLeaveType(@Param('id') id: string) {
        await this.leaveTypeService.softDelete(id);
        return { statusCode: 200, message: 'Leave type deleted' };
    }

    // ============ POLICY ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/policy')
    async getPolicy(@AuthJwtPayload('companyId') companyId: string) {
        const policy = await this.policyService.getOrCreate(companyId);
        return { statusCode: 200, message: 'Success', data: this.policyService.mapGet(policy) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/policy')
    async updatePolicy(
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: LeavePolicyUpdateRequestDto
    ) {
        const policy = await this.policyService.update(companyId, body as any);
        return { statusCode: 200, message: 'Policy updated', data: this.policyService.mapGet(policy) };
    }

    // ============ ENTITLEMENTS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/entitlement/user/:userId')
    async getUserEntitlements(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('userId') userId: string,
        @Query('year') year?: number
    ) {
        const items = await this.entitlementService.findByUser(userId, year ? +year : new Date().getFullYear());
        return { statusCode: 200, message: 'Success', data: items.map(e => this.entitlementService.mapGet(e)) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/entitlement/:id')
    async updateEntitlement(
        @Param('id') id: string,
        @Body() body: LeaveEntitlementUpdateRequestDto
    ) {
        const ent = await this.entitlementService.update(id, body as any);
        return { statusCode: 200, message: 'Entitlement updated', data: this.entitlementService.mapGet(ent) };
    }

    // ============ LEAVE REQUESTS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/request/create')
    async adminCreateRequest(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') adminId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Body() body: {
            user_id: string;
            leave_type_id: string;
            start_date: string;
            end_date: string;
            start_half?: string;
            end_half?: string;
            reason?: string;
            location_id?: string;
            auto_approve?: boolean;
        }
    ) {
        if (!body.user_id) {
            throw new Error('Employee is required');
        }

        const request = await this.requestService.create(companyId, body.user_id, {
            leave_type_id: body.leave_type_id,
            start_date: body.start_date,
            end_date: body.end_date,
            start_half: body.start_half,
            end_half: body.end_half,
            reason: body.reason,
            location_id: body.location_id,
            created_by: adminId,
            auto_approve: body.auto_approve,
        });

        // If auto-approved, mark leave dates on attendance records
        if (request.status === 'approved') {
            this.attendanceService.markLeave(
                companyId,
                body.user_id,
                body.start_date,
                body.end_date,
                body.location_id || undefined,
            ).catch(() => {});
        }

        // Fire-and-forget notification
        if (request.status === 'pending') {
            this.leaveNotificationService.notifyLeaveRequested(request).catch(() => {});
        } else if (request.status === 'approved') {
            // Auto-approved by admin — notify employee about the approved leave
            this.leaveNotificationService.notifyLeaveApproved(request, adminId).catch(() => {});
        }

        return { statusCode: 200, message: 'Leave request created', data: this.requestService.mapGet(request) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/request/list')
    async listRequests(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Query('_limit') limit?: number,
        @Query('_offset') offset?: number,
        @Query('_status') status?: string,
        @Query('_userId') userId?: string,
        @Query('_leaveTypeId') leaveTypeId?: string,
        @Query('_locationId') queryLocationId?: string,
    ) {
        const filters: any = {};
        if (status) filters.status = status;
        if (userId) filters.user_id = userId;
        if (leaveTypeId) filters.leave_type_id = leaveTypeId;

        // Location Admin: use selected location from navbar, fallback to JWT primary
        let effectiveLocationId = queryLocationId || null;
        if (roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN) {
            effectiveLocationId = queryLocationId || jwtLocationId;
        }

        // When location_id is provided: show requests for that location OR unassigned (null)
        if (effectiveLocationId) {
            filters.$or = [
                { location_id: effectiveLocationId },
                { location_id: null },
            ];
        }

        const [items, total] = await Promise.all([
            this.requestService.findAll(companyId, limit ? +limit : 20, offset ? +offset : 0, filters),
            this.requestService.getTotal(companyId, filters),
        ]);
        return {
            statusCode: 200, message: 'Success',
            data: items.map(r => this.requestService.mapGet(r)),
            _metadata: { total, limit: limit ? +limit : 20, offset: offset ? +offset : 0 },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/request/get/:id')
    async getRequest(@Param('id') id: string) {
        const item = await this.requestService.findOneById(id);
        return { statusCode: 200, message: 'Success', data: this.requestService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/request/:id/conflicts')
    async getRequestConflicts(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
    ) {
        const request = await this.requestService.findOneById(id);

        // Find overlapping leaves at the same location (exclude self)
        const overlapping = await this.calendarService.getCalendarData(
            companyId,
            request.start_date,
            request.end_date,
            request.location_id || undefined,
        );
        const overlappingLeaves = overlapping
            .filter(r => r._id !== id)
            .map(r => this.requestService.mapGet(r));

        // Find the employee's shifts in the leave date range
        const affectedShifts = await this.shiftAssignmentService.findByUser(
            request.user_id,
            request.start_date,
            request.end_date,
        );

        return {
            statusCode: 200,
            message: 'Success',
            data: {
                request: this.requestService.mapGet(request),
                overlapping_leaves: overlappingLeaves,
                affected_shifts: await Promise.all(affectedShifts.map(a => this.shiftAssignmentService.mapGetResolved(a))),
            },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/request/approve/:id')
    async approveRequest(
        @AuthJwtPayload('user') adminId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string
    ) {
        const item = await this.requestService.approve(id, adminId);

        // Fire-and-forget: mark leave dates on attendance records
        this.attendanceService.markLeave(
            companyId || item.company_id,
            item.user_id,
            item.start_date,
            item.end_date,
            item.location_id || undefined,
        ).catch(() => {});

        // Fire-and-forget notification
        this.leaveNotificationService.notifyLeaveApproved(item, adminId).catch(() => {});

        return { statusCode: 200, message: 'Request approved', data: this.requestService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/request/reject/:id')
    async rejectRequest(
        @AuthJwtPayload('user') adminId: string,
        @Param('id') id: string,
        @Body() body: LeaveRejectRequestDto
    ) {
        const item = await this.requestService.reject(id, adminId, body.reason);

        // Fire-and-forget notification
        this.leaveNotificationService.notifyLeaveRejected(item, adminId).catch(() => {});

        return { statusCode: 200, message: 'Request rejected', data: this.requestService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/request/change-status/:id')
    async changeRequestStatus(
        @AuthJwtPayload('user') adminId: string,
        @Param('id') id: string,
        @Body() body: { status: string; reason?: string }
    ) {
        const request = await this.requestService.findOneById(id);
        const newStatus = body.status?.toLowerCase();
        const currentStatus = request.status;

        // Don't allow changing to same status
        if (newStatus === currentStatus) {
            return { statusCode: 400, message: `Request is already ${currentStatus}` };
        }

        if (newStatus === 'approved') {
            const item = await this.requestService.forceApprove(id, adminId);
            // Mark leave on attendance records
            this.attendanceService.markLeave(
                request.company_id,
                request.user_id,
                request.start_date,
                request.end_date,
                request.location_id || undefined,
            ).catch(() => {});
            this.leaveNotificationService.notifyLeaveApproved(item, adminId).catch(() => {});
            return { statusCode: 200, message: 'Request approved', data: this.requestService.mapGet(item) };
        } else if (newStatus === 'rejected') {
            const item = await this.requestService.forceReject(id, adminId, body.reason || 'Status changed by admin');
            this.leaveNotificationService.notifyLeaveRejected(item, adminId).catch(() => {});
            return { statusCode: 200, message: 'Request rejected', data: this.requestService.mapGet(item) };
        } else if (newStatus === 'cancelled') {
            const item = await this.requestService.adminCancel(id, adminId);
            this.leaveNotificationService.notifyLeaveCancelledByAdmin(item, adminId).catch(() => {});
            return { statusCode: 200, message: 'Request cancelled', data: this.requestService.mapGet(item) };
        }

        return { statusCode: 400, message: 'Invalid status' };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/request/delete/:id')
    async deleteRequest(
        @AuthJwtPayload('user') adminId: string,
        @Param('id') id: string
    ) {
        await this.requestService.adminDelete(id);
        return { statusCode: 200, message: 'Request deleted' };
    }

    // ============ BRADFORD FACTOR ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/bradford/:userId')
    async getBradford(
        @Param('userId') userId: string,
        @Query('year') year?: number
    ) {
        const data = await this.bradfordService.calculate(userId, year ? +year : new Date().getFullYear());
        return { statusCode: 200, message: 'Success', data };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/bradford')
    async getCompanyBradford(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('year') year?: number
    ) {
        const data = await this.bradfordService.calculateForCompany(companyId, year ? +year : new Date().getFullYear());
        return { statusCode: 200, message: 'Success', data };
    }

    // ============ CALENDAR ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/calendar')
    async getCalendar(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Query('start') start: string,
        @Query('end') end: string,
        @Query('locationId') queryLocationId?: string,
    ) {
        // Location Admin: use selected location from navbar, fallback to JWT primary
        let effectiveLocationId = queryLocationId || null;
        if (roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN) {
            effectiveLocationId = queryLocationId || jwtLocationId;
        }

        const items = await this.calendarService.getCalendarData(
            companyId,
            start || new Date().toISOString().split('T')[0],
            end || new Date().toISOString().split('T')[0],
            effectiveLocationId || undefined
        );
        return { statusCode: 200, message: 'Success', data: items.map(r => this.requestService.mapGet(r)) };
    }
}
