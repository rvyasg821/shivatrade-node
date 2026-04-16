import {
    Controller, Get, Post, Put, Delete,
    Body, Param, Query, HttpStatus, HttpCode, UseGuards, Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { ToolAccessGuard } from '@modules/subscription/guards/tool-access.guard';
import { RequireToolAccess } from '@modules/subscription/decorators/tool-access.decorator';

import { ImmigrationService } from '../services/immigration.service';
import { RtwCheckService } from '../services/rtw-check.service';
import { ComplianceEventService } from '../services/compliance-event.service';
import { ComplianceAuditService } from '../services/compliance-audit.service';
import { NotificationService } from '@modules/notification/services/notification.service';
import { UserService } from '@modules/user/services/user.service';
import { LocationService } from '@modules/location/services/location.service';
import { RoleService } from '@modules/role/services/role.service';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import { ImmigrationCreateRequestDto } from '../dtos/request/immigration.request.dto';
import { RtwCheckCreateRequestDto } from '../dtos/request/rtw-check.request.dto';
import { ComplianceEventCreateRequestDto, ComplianceEventReportRequestDto } from '../dtos/request/compliance-event.request.dto';

@ApiTags('admin.compliance')
@UseGuards(ToolAccessGuard)
@RequireToolAccess(['hrm-compliance'])
@Controller({ version: '1', path: '/compliance' })
export class ComplianceAdminController {
    private readonly logger = new Logger(ComplianceAdminController.name);

    constructor(
        private readonly immigrationService: ImmigrationService,
        private readonly rtwCheckService: RtwCheckService,
        private readonly eventService: ComplianceEventService,
        private readonly auditService: ComplianceAuditService,
        private readonly notificationService: NotificationService,
        private readonly userService: UserService,
        private readonly locationService: LocationService,
        private readonly roleService: RoleService,
        private readonly companySettingsService: CompanySettingsService,
    ) {}

    // ============ IMMIGRATION RECORDS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/immigration/list')
    async listImmigration(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Query('_userId') userId?: string,
        @Query('_status') status?: string,
        @Query('_locationId') queryLocationId?: string,
    ) {
        const filters: any = {};
        if (userId) filters.user_id = userId;
        if (status) filters.status = status;

        // Location Admin: use selected location from navbar, fallback to JWT primary
        let effectiveLocationId = queryLocationId || null;
        if (roleName === 'Location Admin') {
            effectiveLocationId = queryLocationId || jwtLocationId;
        }
        if (effectiveLocationId) {
            filters.location_id = effectiveLocationId;
        }

        const items = await this.immigrationService.findAll(companyId, filters);
        return { statusCode: 200, message: 'Success', data: items.map(r => this.immigrationService.mapGet(r)) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/immigration/get/:id')
    async getImmigration(@Param('id') id: string) {
        const item = await this.immigrationService.findOneById(id);
        return { statusCode: 200, message: 'Success', data: this.immigrationService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/immigration/user/:userId')
    async getUserImmigration(@Param('userId') userId: string) {
        const items = await this.immigrationService.findByUser(userId);
        return { statusCode: 200, message: 'Success', data: items.map(r => this.immigrationService.mapGet(r)) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/immigration/create')
    async createImmigration(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') adminId: string,
        @Body() body: ImmigrationCreateRequestDto,
    ) {
        const item = await this.immigrationService.create(companyId, body.user_id, body as any);
        await this.auditService.log({
            company_id: companyId,
            user_id: body.user_id,
            performed_by: adminId,
            action: 'immigration_record_created',
            entity_type: 'immigration_record',
            entity_id: item._id,
            new_value: body,
        });
        return { statusCode: 200, message: 'Record created', data: this.immigrationService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/immigration/update/:id')
    async updateImmigration(
        @Param('id') id: string,
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') adminId: string,
        @Body() body: any,
    ) {
        // Convert empty date strings to null for PostgreSQL
        const DATE_FIELDS = ['visa_start_date', 'visa_expiry_date', 'cos_start_date', 'cos_expiry_date'];
        for (const f of DATE_FIELDS) { if (body[f] === '') body[f] = null; }

        const before = await this.immigrationService.findOneById(id);
        const item = await this.immigrationService.update(id, body);
        await this.auditService.log({
            company_id: companyId,
            user_id: before.user_id,
            performed_by: adminId,
            action: 'immigration_record_updated',
            entity_type: 'immigration_record',
            entity_id: id,
            previous_value: this.immigrationService.mapGet(before),
            new_value: body,
        });
        return { statusCode: 200, message: 'Record updated', data: this.immigrationService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/immigration/delete/:id')
    async deleteImmigration(@Param('id') id: string) {
        await this.immigrationService.softDelete(id);
        return { statusCode: 200, message: 'Record deleted' };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/immigration/expiring')
    async expiringVisas(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Query('days') days = 90,
        @Query('_locationId') queryLocationId?: string,
    ) {
        // Location Admin: use selected location from navbar, fallback to JWT primary
        let effectiveLocationId = queryLocationId || null;
        if (roleName === 'Location Admin') {
            effectiveLocationId = queryLocationId || jwtLocationId;
        }
        const filters: any = {};
        if (effectiveLocationId) {
            filters.location_id = effectiveLocationId;
        }

        const items = await this.immigrationService.findExpiringVisas(companyId, +days, filters);
        return { statusCode: 200, message: 'Success', data: items.map(r => this.immigrationService.mapGet(r)) };
    }

    // ============ RTW CHECKS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/rtw/list')
    async listRtwChecks(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Query('_userId') userId?: string,
        @Query('_locationId') queryLocationId?: string,
    ) {
        // Location Admin: use selected location from navbar, fallback to JWT primary
        let effectiveLocationId = queryLocationId || null;
        if (roleName === 'Location Admin') {
            effectiveLocationId = queryLocationId || jwtLocationId;
        }
        const filters: any = {};
        if (effectiveLocationId) {
            filters.location_id = effectiveLocationId;
        }

        const items = await this.rtwCheckService.findAll(companyId, userId, filters);
        return { statusCode: 200, message: 'Success', data: items.map(r => this.rtwCheckService.mapGet(r)) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/rtw/get/:id')
    async getRtwCheck(@Param('id') id: string) {
        const item = await this.rtwCheckService.findOneById(id);
        return { statusCode: 200, message: 'Success', data: this.rtwCheckService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/rtw/create')
    async createRtwCheck(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') adminId: string,
        @Body() body: RtwCheckCreateRequestDto,
    ) {
        const item = await this.rtwCheckService.create(companyId, adminId, body);
        await this.auditService.log({
            company_id: companyId,
            user_id: body.user_id,
            performed_by: adminId,
            action: 'rtw_check_completed',
            entity_type: 'rtw_check',
            entity_id: item._id,
            new_value: { result: body.result, check_type: body.check_type },
        });
        return { statusCode: 200, message: 'RTW check saved', data: this.rtwCheckService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/rtw/update/:id')
    async updateRtwCheck(@Param('id') id: string, @Body() body: any) {
        const item = await this.rtwCheckService.update(id, body);
        return { statusCode: 200, message: 'RTW check updated', data: this.rtwCheckService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/rtw/delete/:id')
    async deleteRtwCheck(@Param('id') id: string) {
        await this.rtwCheckService.softDelete(id);
        return { statusCode: 200, message: 'RTW check deleted' };
    }

    // ============ COMPLIANCE EVENTS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/event/list')
    async listEvents(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Query('_userId') userId?: string,
        @Query('_status') status?: string,
        @Query('_limit') limit?: number,
        @Query('_offset') offset?: number,
        @Query('_locationId') queryLocationId?: string,
    ) {
        const filters: any = {};
        if (userId) filters.user_id = userId;
        if (status) filters.status = status;

        // Location Admin: use selected location from navbar, fallback to JWT primary
        let effectiveLocationId = queryLocationId || null;
        if (roleName === 'Location Admin') {
            effectiveLocationId = queryLocationId || jwtLocationId;
        }
        if (effectiveLocationId) {
            filters.location_id = effectiveLocationId;
        }

        const [items, total] = await Promise.all([
            this.eventService.findAll(companyId, filters),
            this.eventService.getTotal(companyId, filters),
        ]);
        return {
            statusCode: 200, message: 'Success',
            data: items.map(e => this.eventService.mapGet(e)),
            _metadata: { total },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/event/get/:id')
    async getEvent(@Param('id') id: string) {
        const item = await this.eventService.findOneById(id);
        return { statusCode: 200, message: 'Success', data: this.eventService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/event/create')
    async createEvent(
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: ComplianceEventCreateRequestDto,
    ) {
        const item = await this.eventService.create(companyId, body.user_id, body);

        // Send real-time notification to admin(s)
        this.sendComplianceEventNotification(companyId, body.user_id, item).catch(err =>
            this.logger.error(`Failed to send COMPLIANCE_EVENT_CREATED notification: ${err.message}`)
        );

        return { statusCode: 200, message: 'Event created', data: this.eventService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/event/report/:id')
    async reportEvent(
        @Param('id') id: string,
        @AuthJwtPayload('user') adminId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: ComplianceEventReportRequestDto,
    ) {
        const item = await this.eventService.markReported(id, adminId, body.reference_number);
        await this.auditService.log({
            company_id: companyId,
            user_id: item.user_id,
            performed_by: adminId,
            action: 'compliance_event_reported',
            entity_type: 'compliance_event',
            entity_id: id,
            new_value: { reference_number: body.reference_number },
        });
        return { statusCode: 200, message: 'Event marked as reported', data: this.eventService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/event/not-applicable/:id')
    async markNotApplicable(@Param('id') id: string) {
        const item = await this.eventService.markNotApplicable(id);
        return { statusCode: 200, message: 'Event marked as not applicable', data: this.eventService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/event/update/:id')
    async updateEvent(@Param('id') id: string, @Body() body: any) {
        const item = await this.eventService.update(id, body);
        return { statusCode: 200, message: 'Event updated', data: this.eventService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/event/delete/:id')
    async deleteEvent(@Param('id') id: string) {
        await this.eventService.softDelete(id);
        return { statusCode: 200, message: 'Event deleted' };
    }

    // ============ AUDIT LOG ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/audit/list')
    async listAudit(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Query('_limit') limit?: number,
        @Query('_offset') offset?: number,
        @Query('_locationId') queryLocationId?: string,
    ) {
        // Location Admin: use selected location from navbar, fallback to JWT primary
        let effectiveLocationId = queryLocationId || null;
        if (roleName === 'Location Admin') {
            effectiveLocationId = queryLocationId || jwtLocationId;
        }
        const filters: any = {};
        if (effectiveLocationId) {
            filters.location_id = effectiveLocationId;
        }

        const items = await this.auditService.findByCompany(companyId, limit ? +limit : 50, offset ? +offset : 0, filters);
        return { statusCode: 200, message: 'Success', data: items };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/audit/user/:userId')
    async auditByUser(@Param('userId') userId: string) {
        const items = await this.auditService.findByUser(userId);
        return { statusCode: 200, message: 'Success', data: items };
    }

    // ============ NOTIFICATION HELPERS ============

    private async sendComplianceEventNotification(companyId: string, userId: string, event: any): Promise<void> {
        const user = await this.userService.findOneById(userId, { join: true }).catch(() => null);
        const loc = user?.location_id
            ? await this.locationService.findOneById(user.location_id).catch(() => null)
            : null;

        const recipients = await this.resolveAdminRecipients(companyId, user?.location_id, loc);
        if (recipients.length === 0) return;

        await this.notificationService.sendEventNotification({
            eventKey: 'COMPLIANCE_EVENT_CREATED',
            companyId,
            locationId: user?.location_id,
            recipients,
            variables: {
                employee_name: user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Employee',
                event_type: event.event_type || '',
                event_date: event.event_date || '',
                description: event.description || '',
                reporting_deadline: event.reporting_deadline || '',
                location_name: loc?.location_name || '',
            },
        });
    }

    private async resolveAdminRecipients(
        companyId: string,
        locationId: string,
        location: any,
    ): Promise<Array<{ email?: string; phone?: string; name: string }>> {
        const recipients: Array<{ email?: string; phone?: string; name: string }> = [];

        if (location) {
            const adminEmail = location.notification_email || location.email;
            if (adminEmail) {
                recipients.push({ email: adminEmail, name: location.contact_name || 'Location Admin' });
            }
            if (location.notification_email_cc) {
                recipients.push({ email: location.notification_email_cc, name: 'HR Team' });
            }
            if (location.cc_company_admin) {
                const companyAdmin = await this.resolveCompanyAdmin(companyId);
                if (companyAdmin?.email && !recipients.some(r => r.email === companyAdmin.email)) {
                    recipients.push({ email: companyAdmin.email, name: companyAdmin.name || companyAdmin.first_name || 'Company Admin' });
                }
            }
        } else {
            const companyAdmin = await this.resolveCompanyAdmin(companyId);
            if (companyAdmin?.email) {
                recipients.push({ email: companyAdmin.email, name: companyAdmin.name || companyAdmin.first_name || 'Company Admin' });
            }
        }

        return recipients;
    }

    private async resolveCompanyAdmin(companyId: string): Promise<any> {
        try {
            const role = await this.roleService.findOneByName('Company Admin');
            if (!role) return null;
            const users = await this.userService.findAll(
                { companyId, role: role._id, deleted: false },
                { paging: { limit: 1, offset: 0 } },
            );
            return users?.[0] || null;
        } catch {
            return null;
        }
    }

    // ============ DASHBOARD ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/dashboard')
    async dashboard(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Query('_locationId') queryLocationId?: string,
    ) {
        // Location Admin: use selected location from navbar, fallback to JWT primary
        let effectiveLocationId = queryLocationId || null;
        if (roleName === 'Location Admin') {
            effectiveLocationId = queryLocationId || jwtLocationId;
        }
        const locationFilter: any = {};
        if (effectiveLocationId) {
            locationFilter.location_id = effectiveLocationId;
        }

        const [expiring30, expiring90, overdueEvents, pendingEvents] = await Promise.all([
            this.immigrationService.findExpiringVisas(companyId, 30, locationFilter),
            this.immigrationService.findExpiringVisas(companyId, 90, locationFilter),
            this.eventService.findOverdueEvents(companyId, locationFilter),
            this.eventService.findAll(companyId, { status: 'pending', ...locationFilter }),
        ]);

        return {
            statusCode: 200,
            message: 'Success',
            data: {
                visas_expiring_30_days: expiring30.length,
                visas_expiring_90_days: expiring90.length,
                overdue_events: overdueEvents.length,
                pending_events: pendingEvents.length,
                expiring_records: expiring30.map(r => this.immigrationService.mapGet(r)),
            },
        };
    }

    // ============ COMPLIANCE SETTINGS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/settings')
    async getComplianceSettings(
        @AuthJwtPayload('companyId') companyId: string,
    ) {
        const settings = await this.companySettingsService.getCompanyDefaults(companyId);
        const mapped = this.companySettingsService.mapGet(settings);
        const config = mapped.compliance_config || {};

        return {
            statusCode: 200,
            message: 'Success',
            data: {
                rtw_check_reminder_days: config.rtw_check_reminder_days ?? 3,
                visa_reminder_1st_days: config.visa_reminder_1st_days ?? 90,
                visa_reminder_2nd_days: config.visa_reminder_2nd_days ?? 60,
                visa_reminder_3rd_days: config.visa_reminder_3rd_days ?? 30,
                ukvi_deadline_alert_days: config.ukvi_deadline_alert_days ?? '5,3,1',
                personal_verification_months: config.personal_verification_months ?? 6,
                additional_notification_emails: config.additional_notification_emails ?? '',
            },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/settings')
    async updateComplianceSettings(
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: any,
    ) {
        const settings = await this.companySettingsService.getCompanyDefaults(companyId);
        const existing = settings.compliance_config || {};

        const updated = {
            ...existing,
            ...(body.rtw_check_reminder_days !== undefined && { rtw_check_reminder_days: Number(body.rtw_check_reminder_days) }),
            ...(body.visa_reminder_1st_days !== undefined && { visa_reminder_1st_days: Number(body.visa_reminder_1st_days) }),
            ...(body.visa_reminder_2nd_days !== undefined && { visa_reminder_2nd_days: Number(body.visa_reminder_2nd_days) }),
            ...(body.visa_reminder_3rd_days !== undefined && { visa_reminder_3rd_days: Number(body.visa_reminder_3rd_days) }),
            ...(body.ukvi_deadline_alert_days !== undefined && { ukvi_deadline_alert_days: String(body.ukvi_deadline_alert_days) }),
            ...(body.personal_verification_months !== undefined && { personal_verification_months: Number(body.personal_verification_months) }),
            ...(body.additional_notification_emails !== undefined && { additional_notification_emails: String(body.additional_notification_emails) }),
        };

        await this.companySettingsService.update(companyId, { compliance_config: updated } as any);

        return { statusCode: 200, message: 'Compliance settings updated', data: updated };
    }
}
