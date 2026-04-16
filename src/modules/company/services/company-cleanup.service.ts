import { Injectable, Logger } from '@nestjs/common';
import { InjectDatabaseConnection } from '@common/database/decorators/database.decorator';
import { DataSource } from 'typeorm';

/**
 * Handles cascade deletion of all company-scoped data across feature tables.
 * Uses direct SQL for efficiency — no need to import every module.
 */
@Injectable()
export class CompanyCleanupService {
    private readonly logger = new Logger(CompanyCleanupService.name);

    constructor(@InjectDatabaseConnection() private readonly dataSource: DataSource) {}

    /**
     * Delete all feature data for a company from tables that are NOT already
     * handled by the main cascade in CompanyAdminController.delete().
     *
     * Already handled elsewhere (do NOT duplicate here):
     *   payments, subscriptions, locations, roles, cards, users, shared_users, company
     */
    async deleteAllCompanyData(companyId: string): Promise<void> {
        // Tables with company_id column
        const companyIdTables = [
            // Leave
            'leave_requests',
            'leave_entitlements',
            'leave_policy_settings',
            'leave_types',
            // Shift
            'shift_swap_requests',
            'shift_assignments',
            'shift_templates',
            // Holiday Calendar
            'holidays',
            'holiday_calendars',
            // Document
            'documents',
            'document_categories',
            // Compliance
            'compliance_notification_log',
            'compliance_audit_log',
            'compliance_events',
            'immigration_records',
            'rtw_checks',
            // Attendance
            'attendance_records',
            'attendance_settings',
            // Contract
            'contract_field_values',
            'employee_contracts',
            'contract_templates',
            // Notification
            'notification_preferences',
            'notification_templates',
            // Company Settings
            'company_settings',
            // Employee
            'employee_location_assignments',
            'employees',
            // Discount
            'discount_applieds',
        ];

        // Tables with companyId column (camelCase — no naming strategy)
        const camelCaseCompanyIdTables = [
            'company_lookups',
        ];

        for (const table of companyIdTables) {
            try {
                const result = await this.dataSource.query(
                    `DELETE FROM "${table}" WHERE company_id = $1`,
                    [companyId],
                );
                const count = result?.[1] ?? result?.rowCount ?? 0;
                if (count > 0) {
                    this.logger.log(`Deleted ${count} row(s) from ${table}`);
                }
            } catch (err) {
                // Table may not exist yet or column missing — log and continue
                this.logger.warn(`Cleanup ${table}: ${err.message}`);
            }
        }

        for (const table of camelCaseCompanyIdTables) {
            try {
                const result = await this.dataSource.query(
                    `DELETE FROM "${table}" WHERE "companyId" = $1`,
                    [companyId],
                );
                const count = result?.[1] ?? result?.rowCount ?? 0;
                if (count > 0) {
                    this.logger.log(`Deleted ${count} row(s) from ${table}`);
                }
            } catch (err) {
                this.logger.warn(`Cleanup ${table}: ${err.message}`);
            }
        }

        this.logger.log(`Company data cleanup completed for: ${companyId}`);
    }
}
