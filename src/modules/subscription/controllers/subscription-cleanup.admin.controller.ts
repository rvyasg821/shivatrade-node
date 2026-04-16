import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AuthJwtAccessProtected } from '@modules/auth/decorators/auth.jwt.decorator';
import { Response } from '@common/response/decorators/response.decorator';
import { IResponse } from '@common/response/interfaces/response.interface';
import { PermissionGuard } from '@modules/role/guards/permission.guard';
import { Permission } from '@modules/role/decorators/permission.decorator';
import { SubscriptionCleanupService } from '../services/subscription-cleanup.service';
import { CleanupMetrics, CleanupAuditLog } from '../interfaces/cleanup-metrics.interface';

@ApiTags('modules.admin.subscription-cleanup')
@Controller({
    version: '1',
    path: '/subscription-cleanup',
})
export class SubscriptionCleanupAdminController {
    constructor(
        private readonly subscriptionCleanupService: SubscriptionCleanupService
    ) { }

    @ApiOperation({
        summary: 'Get cleanup metrics',
        description: 'Retrieve metrics about subscription cleanup operations',
    })
    @ApiResponse({
        status: 200,
        description: 'Cleanup metrics retrieved successfully',
    })
    @Response('subscription-cleanup.metrics')
    @Permission('subscription', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Get('/metrics')
    async getMetrics(): Promise<IResponse<CleanupMetrics>> {
        const metrics = this.subscriptionCleanupService.getMetrics();

        return {
            data: metrics,
        };
    }

    @ApiOperation({
        summary: 'Get cleanup audit logs',
        description: 'Retrieve recent cleanup operation audit logs',
    })
    @ApiQuery({
        name: 'limit',
        required: false,
        type: Number,
        description: 'Number of logs to retrieve (default: 100, max: 1000)',
    })
    @ApiResponse({
        status: 200,
        description: 'Audit logs retrieved successfully',
    })
    @Response('subscription-cleanup.auditLogs')
    @Permission('subscription', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Get('/audit-logs')
    async getAuditLogs(
        @Query('limit') limit?: number
    ): Promise<IResponse<CleanupAuditLog[]>> {
        const actualLimit = Math.min(limit || 100, 1000);
        const auditLogs = this.subscriptionCleanupService.getAuditLogs(actualLimit);

        return {
            data: auditLogs,
        };
    }

    @ApiOperation({
        summary: 'Get recent cleanup failures',
        description: 'Retrieve cleanup operations that failed in the specified time period',
    })
    @ApiQuery({
        name: 'hours',
        required: false,
        type: Number,
        description: 'Number of hours to look back (default: 24)',
    })
    @ApiResponse({
        status: 200,
        description: 'Recent failures retrieved successfully',
    })
    @Response('subscription-cleanup.recentFailures')
    @Permission('subscription', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Get('/recent-failures')
    async getRecentFailures(
        @Query('hours') hours?: number
    ): Promise<IResponse<CleanupAuditLog[]>> {
        const actualHours = hours || 24;
        const failures = this.subscriptionCleanupService.getRecentFailures(actualHours);

        return {
            data: failures,
        };
    }
}