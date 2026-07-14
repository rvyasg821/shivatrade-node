import {
    Controller,
    ForbiddenException,
    Get,
    Param,
    Post,
    Query,
} from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { Response } from '@common/response/decorators/response.decorator';
import { IResponse } from '@common/response/interfaces/response.interface';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { TrackingQueryService } from '../services/tracking-query.service';
import { TrackingCronService } from '../services/tracking-cron.service';

/**
 * Platform-owner read API for the tracking data (Phase 3).
 *
 * Everything under `/admin/tracking` is on the telemetry exclusion list
 * (`TRACKING_EXCLUDED_ROUTE_PREFIXES`), so the console cannot generate the
 * traffic it displays.
 *
 * There is no role decorator in this codebase — controllers compare `roleName`
 * inline (see `company.shared.controller.ts:82`). Same pattern here.
 */
@ApiTags('admin.tracking')
@Controller({ version: '1', path: '/admin/tracking' })
export class TrackingAdminController {
    constructor(
        private readonly trackingQueryService: TrackingQueryService,
        private readonly trackingCronService: TrackingCronService
    ) {}

    /** SUPER_ADMIN ("Admin" — the platform owner) only. Cross-company data. */
    private assertPlatformOwner(roleName: string): void {
        if (roleName !== ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            throw new ForbiddenException(
                'Tracking is restricted to the platform owner.'
            );
        }
    }

    @Response('tracking.activity')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'company_id', required: false })
    @ApiQuery({ name: 'user_id', required: false })
    @ApiQuery({ name: 'entity_name', required: false })
    @ApiQuery({ name: 'action', required: false })
    @ApiQuery({ name: 'from', required: false })
    @ApiQuery({ name: 'to', required: false })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'perPage', required: false })
    @Get('/activity')
    async activity(
        @AuthJwtPayload('roleName') roleName: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<any>> {
        this.assertPlatformOwner(roleName);
        const data = await this.trackingQueryService.listActivity({
            company_id: query.company_id,
            user_id: query.user_id,
            entity_name: query.entity_name,
            action: query.action,
            from: query.from,
            to: query.to,
            page: Number(query.page) || 1,
            perPage: Number(query.perPage) || 25,
        });
        return { data };
    }

    /** Raw telemetry rows for the "API Calls" tab. */
    @Response('tracking.apiCalls')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'company_id', required: false })
    @ApiQuery({ name: 'user_id', required: false })
    @ApiQuery({ name: 'route', required: false })
    @ApiQuery({ name: 'status_class', required: false, description: '2 | 4 | 5' })
    @ApiQuery({ name: 'from', required: false })
    @ApiQuery({ name: 'to', required: false })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'perPage', required: false })
    @Get('/api-calls')
    async apiCalls(
        @AuthJwtPayload('roleName') roleName: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<any>> {
        this.assertPlatformOwner(roleName);
        const data = await this.trackingQueryService.listApiCalls({
            company_id: query.company_id,
            user_id: query.user_id,
            route: query.route,
            status_class: query.status_class,
            from: query.from,
            to: query.to,
            page: Number(query.page) || 1,
            perPage: Number(query.perPage) || 25,
        });
        return { data };
    }

    /** Stat tiles: total, error rate, p50/p95/p99. */
    @Response('tracking.apiCallStats')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'company_id', required: false })
    @ApiQuery({ name: 'from', required: false })
    @ApiQuery({ name: 'to', required: false })
    @Get('/api-calls/stats')
    async apiCallStats(
        @AuthJwtPayload('roleName') roleName: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<any>> {
        this.assertPlatformOwner(roleName);
        const data = await this.trackingQueryService.apiCallStats({
            company_id: query.company_id,
            from: query.from,
            to: query.to,
        });
        return { data };
    }

    /** Per-company daily usage, served from the pre-aggregated rollup table. */
    @Response('tracking.usage')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'company_id', required: false })
    @ApiQuery({ name: 'from', required: false })
    @ApiQuery({ name: 'to', required: false })
    @Get('/usage')
    async usage(
        @AuthJwtPayload('roleName') roleName: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<any>> {
        this.assertPlatformOwner(roleName);
        const data = await this.trackingQueryService.listUsage({
            company_id: query.company_id,
            from: query.from,
            to: query.to,
        });
        return { data };
    }

    /**
     * Re-run the rollup for one day (`?day=2026-07-10`, default yesterday).
     *
     * The nightly cron already does this at 04:00; this exists so a day can be
     * backfilled — or verified — without waiting. Idempotent: the unique
     * (company_id, day) index turns a re-run into an overwrite, never a duplicate.
     */
    @Response('tracking.rollup')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'day', required: false })
    @Post('/usage/rollup')
    async rollup(
        @AuthJwtPayload('roleName') roleName: string,
        @Query('day') day?: string
    ): Promise<IResponse<any>> {
        this.assertPlatformOwner(roleName);
        const rows = day
            ? await this.trackingCronService.rollupDay(day)
            : await this.trackingCronService.rollupYesterday();
        return { data: { day: day || 'yesterday', companies: rows } };
    }

    /**
     * Full history of one document — what the Phase-5 "History" tab on the
     * Quotation / SO / POV / Invoice detail pages will call.
     */
    @Response('tracking.history')
    @AuthJwtAccessProtected()
    @Get('/history/:entityName/:entityId')
    async history(
        @AuthJwtPayload('roleName') roleName: string,
        @Param('entityName') entityName: string,
        @Param('entityId') entityId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<any>> {
        this.assertPlatformOwner(roleName);
        const data = await this.trackingQueryService.listActivity({
            entity_name: entityName,
            entity_id: entityId,
            page: Number(query.page) || 1,
            perPage: Number(query.perPage) || 50,
        });
        return { data };
    }
}
