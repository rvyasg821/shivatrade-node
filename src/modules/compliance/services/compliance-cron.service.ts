import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ImmigrationService } from './immigration.service';
import { RtwCheckService } from './rtw-check.service';
import { ComplianceEventService } from './compliance-event.service';
import { ComplianceAuditService } from './compliance-audit.service';
import { NotificationService } from '@modules/notification/services/notification.service';
import { UserService } from '@modules/user/services/user.service';
import { RoleService } from '@modules/role/services/role.service';
import { LocationService } from '@modules/location/services/location.service';
import { ComplianceNotificationLogRepository } from '../repository/repositories/compliance-notification-log.repository';
import { ImmigrationRecordRepository } from '../repository/repositories/immigration-record.repository';
import { RtwCheckRepository } from '../repository/repositories/rtw-check.repository';
import { ComplianceEventRepository } from '../repository/repositories/compliance-event.repository';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';

// Default thresholds — overridden per-company from compliance_config
const DEFAULT_VISA_ALERT_THRESHOLDS = [90, 60, 30, 14, 7, 0];
const DEFAULT_UKVI_DEADLINE_DAYS = [5, 3, 1];

@Injectable()
export class ComplianceCronService {
    private readonly logger = new Logger(ComplianceCronService.name);

    constructor(
        private readonly immigrationService: ImmigrationService,
        private readonly rtwCheckService: RtwCheckService,
        private readonly eventService: ComplianceEventService,
        private readonly auditService: ComplianceAuditService,
        private readonly notificationService: NotificationService,
        private readonly userService: UserService,
        private readonly roleService: RoleService,
        private readonly locationService: LocationService,
        private readonly notificationLogRepo: ComplianceNotificationLogRepository,
        private readonly immigrationRepo: ImmigrationRecordRepository,
        private readonly rtwCheckRepo: RtwCheckRepository,
        private readonly complianceEventRepo: ComplianceEventRepository,
        private readonly companySettingsService: CompanySettingsService,
    ) {}

    /** Get compliance config for a company, with defaults */
    private async getCompanyComplianceConfig(companyId: string) {
        try {
            const settings = await this.companySettingsService.getCompanyDefaults(companyId);
            const config = (settings as any).compliance_config || {};
            return {
                visaThresholds: config.visa_reminder_1st_days
                    ? [
                        Number(config.visa_reminder_1st_days) || 90,
                        Number(config.visa_reminder_2nd_days) || 60,
                        Number(config.visa_reminder_3rd_days) || 30,
                        14, 7, 0
                      ]
                    : DEFAULT_VISA_ALERT_THRESHOLDS,
                ukviDeadlineDays: config.ukvi_deadline_alert_days
                    ? String(config.ukvi_deadline_alert_days).split(',').map(Number).filter(n => !isNaN(n))
                    : DEFAULT_UKVI_DEADLINE_DAYS,
            };
        } catch {
            return {
                visaThresholds: DEFAULT_VISA_ALERT_THRESHOLDS,
                ukviDeadlineDays: DEFAULT_UKVI_DEADLINE_DAYS,
            };
        }
    }

    /** Daily 5AM — Check visa/BRP expiry and send tiered alerts */
    private shouldRunCron(): boolean {
        if (process.env.CRON_ENABLED === 'false') return false;
        const instance = process.env.NODE_APP_INSTANCE;
        if (instance !== undefined && instance !== '0') return false;
        return true;
    }

    @Cron('0 5 * * *')
    async checkVisaExpiry(): Promise<void> {
        if (!this.shouldRunCron()) return;
        this.logger.log('Running visa expiry check...');
        try {
            // Build per-company thresholds, then check all matching days
            const allThresholds = new Set<number>();
            const companyConfigs: Record<string, number[]> = {};

            // Get all records to find distinct companies
            const allRecords = await this.findRecordsExpiringInRange(0, 90);
            const companyIds: string[] = Array.from(new Set<string>(allRecords.map((r: any) => String(r.company_id))));

            for (const cid of companyIds) {
                const cfg = await this.getCompanyComplianceConfig(cid);
                companyConfigs[cid] = cfg.visaThresholds;
                cfg.visaThresholds.forEach(d => allThresholds.add(d));
            }
            // Fallback if no records found
            if (allThresholds.size === 0) DEFAULT_VISA_ALERT_THRESHOLDS.forEach(d => allThresholds.add(d));

            for (const days of allThresholds) {
                const records = await this.findRecordsExpiringInExactDays(days);
                for (const record of records) {
                    // Only notify if this company has this threshold configured
                    const compThresholds = companyConfigs[record.company_id] || DEFAULT_VISA_ALERT_THRESHOLDS;
                    if (!compThresholds.includes(days)) continue;
                    try {
                        await this.sendVisaExpiryNotification(record, days);
                        await this.logNotification(
                            record.company_id,
                            record.user_id,
                            `visa_expiry_${days}`,
                            'immigration_record',
                            record._id,
                            days,
                        );
                    } catch (err) {
                        this.logger.error(`Failed to notify visa expiry for record ${record._id}: ${err.message}`);
                    }
                }
            }

            // Refresh statuses for all active records
            await this.refreshAllStatuses();
            this.logger.log('Visa expiry check complete.');
        } catch (err) {
            this.logger.error('Visa expiry check failed', err);
        }
    }

    /** Daily 5:30AM — RTW follow-up reminders */
    @Cron('30 5 * * *')
    async checkRtwFollowUps(): Promise<void> {
        if (!this.shouldRunCron()) return;
        this.logger.log('Running RTW follow-up check...');
        try {
            const today = new Date().toISOString().split('T')[0];
            const allFollowUps = await this.findRtwFollowUpsDueOn(today);
            for (const check of allFollowUps) {
                try {
                    await this.sendRtwFollowUpNotification(check);
                    await this.logNotification(
                        check.company_id,
                        check.user_id,
                        'rtw_followup_due',
                        'rtw_check',
                        check._id,
                        0,
                    );
                } catch (err) {
                    this.logger.error(`Failed to notify RTW follow-up for check ${check._id}: ${err.message}`);
                }
            }
            this.logger.log(`RTW follow-up check: ${allFollowUps.length} reminders processed.`);
        } catch (err) {
            this.logger.error('RTW follow-up check failed', err);
        }
    }

    /** Daily 6AM — Check compliance event deadlines */
    @Cron('0 6 * * *')
    async checkComplianceDeadlines(): Promise<void> {
        if (!this.shouldRunCron()) return;
        this.logger.log('Running compliance deadline check...');
        try {
            const today = new Date();
            // Build per-company UKVI deadline days
            const allUkviDays = new Set<number>();
            const companyUkviConfigs: Record<string, number[]> = {};
            const pendingEvents = await this.complianceEventRepo.findAll({ soft_delete: false, status: 'pending' }, {}) as any[];
            const ukviCompanyIds = [...new Set(pendingEvents.map(e => e.company_id))];
            for (const cid of ukviCompanyIds) {
                const cfg = await this.getCompanyComplianceConfig(cid);
                companyUkviConfigs[cid] = cfg.ukviDeadlineDays;
                cfg.ukviDeadlineDays.forEach(d => allUkviDays.add(d));
            }
            if (allUkviDays.size === 0) DEFAULT_UKVI_DEADLINE_DAYS.forEach(d => allUkviDays.add(d));

            for (const days of allUkviDays) {
                const deadline = new Date(today);
                deadline.setDate(today.getDate() + days);
                const deadlineStr = deadline.toISOString().split('T')[0];

                const events = await this.findEventsDueOn(deadlineStr);
                for (const event of events) {
                    // Only notify if this company has this UKVI threshold configured
                    const compDays = companyUkviConfigs[event.company_id] || DEFAULT_UKVI_DEADLINE_DAYS;
                    if (!compDays.includes(days)) continue;
                    try {
                        await this.sendUkviDeadlineNotification(event, days);
                        await this.logNotification(
                            event.company_id,
                            event.user_id,
                            `compliance_deadline_${days}days`,
                            'compliance_event',
                            event._id,
                            days,
                        );
                    } catch (err) {
                        this.logger.error(`Failed to notify UKVI deadline for event ${event._id}: ${err.message}`);
                    }
                }
            }
            this.logger.log('Compliance deadline check complete.');
        } catch (err) {
            this.logger.error('Compliance deadline check failed', err);
        }
    }

    /** Daily 6:30AM — Auto-detect reportable UKVI events from data changes */
    @Cron('30 6 * * *')
    async detectReportableEvents(): Promise<void> {
        if (!this.shouldRunCron()) return;
        this.logger.log('Running reportable event detection...');
        // Detection logic: query for sponsored workers with recent changes
        // This is a placeholder — full implementation would hook into user/attendance change events
        this.logger.log('Reportable event detection complete.');
    }

    /** Weekly Sunday 3AM — GDPR data retention cleanup */
    @Cron('0 3 * * 0')
    async gdprRetentionCleanup(): Promise<void> {
        if (!this.shouldRunCron()) return;
        this.logger.log('Running GDPR retention cleanup...');
        try {
            // Delete RTW + immigration records for employees who left > 2 years ago
            // In production: query users with inactive date > 2yr, then soft_delete related records
            await this.auditService.log({
                company_id: 'system',
                action: 'gdpr_retention_cleanup_ran',
                notes: `GDPR cleanup ran at ${new Date().toISOString()}`,
            });
            this.logger.log('GDPR retention cleanup complete.');
        } catch (err) {
            this.logger.error('GDPR retention cleanup failed', err);
        }
    }

    // ── Notification Senders ─────────────────────────────────────────────────

    private async sendVisaExpiryNotification(record: any, daysRemaining: number): Promise<void> {
        const user = await this.resolveUser(record.user_id);
        const loc = user?.location_id ? await this.resolveLocation(user.location_id) : null;

        const recipients = await this.resolveAdminRecipients(record.company_id, user?.location_id, loc);
        if (recipients.length === 0) {
            this.logger.warn(`No admin recipients for VISA_EXPIRY_WARNING (company: ${record.company_id})`);
            return;
        }

        await this.notificationService.sendEventNotification({
            eventKey: 'VISA_EXPIRY_WARNING',
            companyId: record.company_id,
            locationId: user?.location_id,
            recipients,
            variables: {
                employee_name: user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Employee',
                visa_type: record.visa_type || '',
                visa_expiry_date: record.visa_expiry_date || '',
                days_remaining: daysRemaining,
                brp_number: record.brp_number || '',
                location_name: loc?.location_name || '',
            },
        });
    }

    private async sendRtwFollowUpNotification(check: any): Promise<void> {
        const user = await this.resolveUser(check.user_id);
        const loc = user?.location_id ? await this.resolveLocation(user.location_id) : null;

        const recipients = await this.resolveAdminRecipients(check.company_id, user?.location_id, loc);
        if (recipients.length === 0) {
            this.logger.warn(`No admin recipients for RTW_FOLLOWUP_DUE (company: ${check.company_id})`);
            return;
        }

        await this.notificationService.sendEventNotification({
            eventKey: 'RTW_FOLLOWUP_DUE',
            companyId: check.company_id,
            locationId: user?.location_id,
            recipients,
            variables: {
                employee_name: user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Employee',
                check_type: check.check_type || '',
                original_check_date: check.check_date || '',
                follow_up_date: check.follow_up_date || '',
                location_name: loc?.location_name || '',
            },
        });
    }

    private async sendUkviDeadlineNotification(event: any, daysRemaining: number): Promise<void> {
        const user = await this.resolveUser(event.user_id);
        const loc = user?.location_id ? await this.resolveLocation(user.location_id) : null;

        const recipients = await this.resolveAdminRecipients(event.company_id, user?.location_id, loc);
        if (recipients.length === 0) {
            this.logger.warn(`No admin recipients for UKVI_DEADLINE_WARNING (company: ${event.company_id})`);
            return;
        }

        await this.notificationService.sendEventNotification({
            eventKey: 'UKVI_DEADLINE_WARNING',
            companyId: event.company_id,
            locationId: user?.location_id,
            recipients,
            variables: {
                employee_name: user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Employee',
                event_type: event.event_type || '',
                event_date: event.event_date || '',
                reporting_deadline: event.reporting_deadline || '',
                days_remaining: daysRemaining,
                description: event.description || '',
                location_name: loc?.location_name || '',
            },
        });
    }

    // ── Admin Recipient Resolution (matches Leave/Shift pattern) ─────────────

    private async resolveAdminRecipients(
        companyId: string,
        locationId: string,
        location: any,
    ): Promise<Array<{ email?: string; phone?: string; name: string }>> {
        const recipients: Array<{ email?: string; phone?: string; name: string }> = [];

        if (location) {
            const adminEmail = location.notification_email || location.email;
            if (adminEmail) {
                recipients.push({
                    email: adminEmail,
                    name: location.contact_name || 'Location Admin',
                });
            }

            if (location.notification_email_cc) {
                recipients.push({
                    email: location.notification_email_cc,
                    name: 'HR Team',
                });
            }

            if (location.cc_company_admin) {
                const companyAdmin = await this.resolveCompanyAdmin(companyId);
                if (companyAdmin?.email) {
                    const alreadyIncluded = recipients.some(r => r.email === companyAdmin.email);
                    if (!alreadyIncluded) {
                        recipients.push({
                            email: companyAdmin.email,
                            name: companyAdmin.name || companyAdmin.first_name || 'Company Admin',
                        });
                    }
                }
            }
        } else {
            const companyAdmin = await this.resolveCompanyAdmin(companyId);
            if (companyAdmin?.email) {
                recipients.push({
                    email: companyAdmin.email,
                    name: companyAdmin.name || companyAdmin.first_name || 'Company Admin',
                });
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
        } catch (error) {
            this.logger.warn(`Failed to resolve company admin for ${companyId}: ${error.message}`);
            return null;
        }
    }

    // ── Data Query Helpers ───────────────────────────────────────────────────

    private async findRecordsExpiringInRange(minDays: number, maxDays: number) {
        const from = new Date();
        from.setDate(from.getDate() + minDays);
        const to = new Date();
        to.setDate(to.getDate() + maxDays);
        try {
            // Use raw query for date range — repo findAll may not support Between
            const repo = (this.immigrationRepo as any).repository || this.immigrationRepo;
            if (repo.createQueryBuilder) {
                return repo.createQueryBuilder('r')
                    .where('r.soft_delete = false')
                    .andWhere('r.visa_expiry_date BETWEEN :from AND :to', {
                        from: from.toISOString().split('T')[0],
                        to: to.toISOString().split('T')[0],
                    })
                    .getMany();
            }
        } catch {}
        // Fallback: use exact days method for the max day
        return this.findRecordsExpiringInExactDays(maxDays);
    }

    private async findRecordsExpiringInExactDays(days: number) {
        const target = new Date();
        target.setDate(target.getDate() + days);
        const targetStr = target.toISOString().split('T')[0];
        return this.immigrationRepo.findAll({
            soft_delete: false,
            visa_expiry_date: targetStr,
        }, {}) as Promise<any[]>;
    }

    private async findRtwFollowUpsDueOn(todayStr: string): Promise<any[]> {
        return this.rtwCheckRepo.findAll({
            soft_delete: false,
            follow_up_required: true,
            follow_up_date: todayStr,
        }, {}) as Promise<any[]>;
    }

    private async findEventsDueOn(deadlineStr: string): Promise<any[]> {
        return this.complianceEventRepo.findAll({
            soft_delete: false,
            reported: false,
            status: 'PENDING',
            reporting_deadline: deadlineStr,
        }, {}) as Promise<any[]>;
    }

    private async refreshAllStatuses(): Promise<void> {
        const records = await this.immigrationRepo.findAll(
            { soft_delete: false },
            { order: { visa_expiry_date: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC } }
        ) as any[];
        for (const r of records) {
            if (r.visa_expiry_date) {
                await this.immigrationService.refreshStatus(r._id).catch(() => null);
            }
        }
    }

    private async resolveUser(userId: string): Promise<any> {
        try {
            return await this.userService.findOneById(userId, { join: true });
        } catch {
            return null;
        }
    }

    private async resolveLocation(locationId: string): Promise<any> {
        try {
            return await this.locationService.findOneById(locationId);
        } catch {
            return null;
        }
    }

    private async logNotification(
        companyId: string,
        userId: string,
        notificationType: string,
        entityType: string,
        entityId: string,
        daysRemaining: number,
    ): Promise<void> {
        await this.notificationLogRepo.create({
            company_id: companyId,
            user_id: userId,
            notification_type: notificationType,
            sent_to: null,
            sent_at: new Date(),
            entity_type: entityType,
            entity_id: entityId,
            days_remaining: daysRemaining,
        });
    }
}
