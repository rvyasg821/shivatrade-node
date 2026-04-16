import {
    Controller,
    Get,
    Post,
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
import { LeaveEntitlementService } from '../services/leave-entitlement.service';
import { LeaveRequestService } from '../services/leave-request.service';
import { LeaveNotificationService } from '../services/leave-notification.service';
import { LeaveRequestCreateRequestDto } from '../dtos/request/leave-request.create.request.dto';

@ApiTags('employee.leave')
@UseGuards(ToolAccessGuard)
@RequireToolAccess(['hrm-leave'])
@Controller({
    version: '1',
    path: '/employee/leave',
})
export class LeaveEmployeeController {
    constructor(
        private readonly leaveTypeService: LeaveTypeService,
        private readonly entitlementService: LeaveEntitlementService,
        private readonly requestService: LeaveRequestService,
        private readonly leaveNotificationService: LeaveNotificationService,
    ) {}

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/types')
    async getLeaveTypes(@AuthJwtPayload('companyId') companyId: string) {
        const items = await this.leaveTypeService.findByCompany(companyId);
        return { statusCode: 200, message: 'Success', data: items.map(lt => this.leaveTypeService.mapGet(lt)) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/balance')
    async getMyBalance(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @Query('year') year?: number
    ) {
        const y = year ? +year : new Date().getFullYear();
        const items = await this.entitlementService.findByUser(userId, y);
        return { statusCode: 200, message: 'Success', data: items.map(e => this.entitlementService.mapGet(e)) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/my-requests')
    async myRequests(
        @AuthJwtPayload('user') userId: string,
        @Query('year') year?: number
    ) {
        const items = await this.requestService.findByUser(userId, year ? +year : undefined);
        return { statusCode: 200, message: 'Success', data: items.map(r => this.requestService.mapGet(r)) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/request')
    async submitRequest(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') locationId: string,
        @Body() body: LeaveRequestCreateRequestDto
    ) {
        const item = await this.requestService.create(companyId, userId, {
            ...body,
            location_id: body.location_id || locationId,
        });

        // Fire-and-forget notification to admin
        this.leaveNotificationService.notifyLeaveRequested(item).catch(() => {});

        return { statusCode: 200, message: 'Leave request submitted', data: this.requestService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/cancel/:id')
    async cancelRequest(
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string
    ) {
        // Get the request before cancellation to capture previous status
        const beforeCancel = await this.requestService.findOneById(id);
        const previousStatus = beforeCancel.status;

        const item = await this.requestService.cancel(id, userId);

        // Fire-and-forget notification to admin
        this.leaveNotificationService.notifyLeaveCancelledByEmployee(item, previousStatus).catch(() => {});

        return { statusCode: 200, message: 'Request cancelled', data: this.requestService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/calculate-days')
    async calculateDays(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('start') start: string,
        @Query('end') end: string,
        @Query('startHalf') startHalf?: string,
        @Query('endHalf') endHalf?: string,
    ) {
        const days = await this.requestService.calculateWorkingDays(
            companyId,
            start,
            end,
            startHalf || 'full',
            endHalf || 'full'
        );
        return { statusCode: 200, message: 'Success', data: { working_days: days } };
    }
}
