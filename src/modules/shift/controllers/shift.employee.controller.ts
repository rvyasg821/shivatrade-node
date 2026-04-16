import {
    Controller, Get, Post, Body, Query, Param, HttpStatus, HttpCode, UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { ToolAccessGuard } from '@modules/subscription/guards/tool-access.guard';
import { RequireToolAccess } from '@modules/subscription/decorators/tool-access.decorator';

import { ShiftAssignmentService } from '../services/shift-assignment.service';
import { ShiftSwapService } from '../services/shift-swap.service';
import { ShiftNotificationService } from '../services/shift-notification.service';
import { ShiftSwapRequestCreateDto, ShiftSwapRespondDto } from '../dtos/request/shift-swap.request.dto';

@ApiTags('employee.shift')
@UseGuards(ToolAccessGuard)
@RequireToolAccess(['hrm-shift-rota'])
@Controller({ version: '1', path: '/employee/shift' })
export class ShiftEmployeeController {
    constructor(
        private readonly assignmentService: ShiftAssignmentService,
        private readonly swapService: ShiftSwapService,
        private readonly shiftNotificationService: ShiftNotificationService,
    ) {}

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/my-shifts')
    async myShifts(
        @AuthJwtPayload('user') userId: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        const items = await this.assignmentService.findByUser(userId, startDate, endDate);
        const data = await Promise.all(items.map(a => this.assignmentService.mapGetResolved(a)));
        return { statusCode: 200, message: 'Success', data };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/today')
    async todayShift(@AuthJwtPayload('user') userId: string) {
        const today = new Date().toISOString().split('T')[0];
        const item = await this.assignmentService.findByUserAndDate(userId, today);
        if (!item) return { statusCode: 200, message: 'No shift today', data: null };
        return { statusCode: 200, message: 'Success', data: await this.assignmentService.mapGetResolved(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/swap/colleagues')
    async swapColleagues(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
    ) {
        const data = await this.swapService.getColleagues(companyId, userId);
        return { statusCode: 200, message: 'Success', data };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/swap/my-requests')
    async mySwapRequests(@AuthJwtPayload('user') userId: string) {
        const items = await this.swapService.findByUser(userId);
        const mapped = items.map(s => this.swapService.mapGet(s));
        const enriched = await this.swapService.enrichWithUserDetails(mapped);
        return { statusCode: 200, message: 'Success', data: enriched };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/swap/request')
    async requestSwap(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: ShiftSwapRequestCreateDto,
    ) {
        const item = await this.swapService.requestSwap(companyId, userId, body);

        this.shiftNotificationService.notifySwapRequested(item).catch(() => {});

        return { statusCode: 200, message: 'Swap requested', data: this.swapService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/swap/respond/:id')
    async respondSwap(
        @Param('id') id: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: ShiftSwapRespondDto,
    ) {
        const item = await this.swapService.respondSwap(id, userId, body.accept);

        this.shiftNotificationService.notifySwapResponded(item, body.accept).catch(() => {});

        return {
            statusCode: 200,
            message: body.accept ? 'Swap accepted — awaiting admin approval' : 'Swap declined',
            data: this.swapService.mapGet(item),
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/swap/cancel/:id')
    async cancelSwap(
        @Param('id') id: string,
        @AuthJwtPayload('user') userId: string,
    ) {
        const item = await this.swapService.cancel(id, userId);
        return { statusCode: 200, message: 'Swap cancelled', data: this.swapService.mapGet(item) };
    }
}
