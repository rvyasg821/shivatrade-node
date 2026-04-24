import { Command } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';

// Import all seed classes
import { MigrationFreshInitSeed } from './migration.fresh-init.seed';
import { MigrationSettingFeatureSeed } from './migration.settings.seed';
import { MigrationToolsSeed } from './migration.tools.seed';
import { MigrationHrmPlansSeed } from './migration.hrm-plans.seed';
import { MigrationLeaveTypesSeed } from './migration.leave-types.seed';
import { MigrationDocumentCategoriesSeed } from './migration.document-categories.seed';
import { MigrationContractTemplatesSeed } from './migration.contract-templates.seed';
import { MigrationNotificationEventsSeed } from './migration.notification-events.seed';
import { MigrationUpdateRolePermissionsSeed } from './migration.update-role-permissions.seed';
import { MigrationSyncCustomRolePermissionsSeed } from './migration.sync-custom-role-permissions.seed';

/**
 * Tables that contain user/company-generated data — wiped on production reset.
 * Order matters: child tables before parent tables to respect FK constraints.
 */
const USER_DATA_TABLES = [
    // Attendance
    'attendance_breaks',
    'attendance_records',
    'attendance_settings',

    // Shifts / Rota
    'shift_swap_requests',
    'shift_assignments',
    'shift_templates',

    // Leave
    'leave_requests',
    'leave_entitlements',
    'leave_policy_settings',

    // Contracts (issued)
    'contract_field_values',
    'employee_contracts',

    // Documents
    'documents',

    // Holiday Calendar
    'holidays',
    'holiday_calendars',

    // Compliance
    'compliance_notification_log',
    'compliance_audit_log',
    'compliance_events',
    'rtw_checks',
    'immigration_records',

    // Assessments
    'question_answers',
    'questions',
    'sections',
    'assessment_reports',
    'assessments',

    // Payments / Subscriptions
    'discount_applieds',
    'payments',
    'cards',
    'subscriptions',
    'discounts',

    // Company / Location / Employees
    'company_lookups',
    'company_settings',
    'employee_location_assignments',
    'locations',
    'company',

    // Widgets
    'widgets',

    // Notifications (company-level preferences only, not system events/templates)
    'notification_preferences',

    // Auth / Session / Activity (user-generated)
    'activities',
    'sessions',
    'password_histories',
    'otps',
    'reset_passwords',
];

/**
 * System tables — wiped and re-seeded from scratch.
 */
const SYSTEM_DATA_TABLES = [
    // Users & Shared Users (re-created by fresh-init)
    'sharedusers',
    'users',
    'roles',

    // System reference data (re-created by seeds)
    'notification_templates',
    'notification_events',
    'contract_fields',
    'contract_sections',
    'contract_templates',
    'document_categories',
    'leave_types',
    'plans',
    'tools',
    'setting_features',
];

@Injectable()
export class MigrationProductionSeed {
    constructor(
        @InjectDataSource(DATABASE_CONNECTION_NAME)
        private readonly dataSource: DataSource,

        private readonly freshInitSeed: MigrationFreshInitSeed,
        private readonly settingsSeed: MigrationSettingFeatureSeed,
        private readonly toolsSeed: MigrationToolsSeed,
        private readonly hrmPlansSeed: MigrationHrmPlansSeed,
        private readonly leaveTypesSeed: MigrationLeaveTypesSeed,
        private readonly documentCategoriesSeed: MigrationDocumentCategoriesSeed,
        private readonly contractTemplatesSeed: MigrationContractTemplatesSeed,
        private readonly notificationEventsSeed: MigrationNotificationEventsSeed,
        private readonly updateRolePermissionsSeed: MigrationUpdateRolePermissionsSeed,
        private readonly syncCustomRolePermissionsSeed: MigrationSyncCustomRolePermissionsSeed,
    ) {}

    // ─────────────────────────────────────────────────────────────────────────────
    // seed:production — Full wipe + seed for production deployment or app reset
    // ─────────────────────────────────────────────────────────────────────────────
    @Command({
        command: 'seed:production',
        describe: 'Wipe all data and seed production-ready system data (roles, admin, tools, plans, templates, etc.)',
    })
    async seed(): Promise<void> {
        const startTime = Date.now();

        console.log('');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║           PRODUCTION SEED — Full Reset & Seed               ║');
        console.log('╠══════════════════════════════════════════════════════════════╣');
        console.log('║  This will DELETE all existing data and seed fresh system    ║');
        console.log('║  data required for production deployment.                   ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log('');

        try {
            // ── PHASE 1: Wipe all user-generated data ──
            console.log('━━━ PHASE 1: Wiping user-generated data ━━━');
            await this.truncateTables(USER_DATA_TABLES);
            console.log('');

            // ── PHASE 2: Wipe system data tables ──
            console.log('━━━ PHASE 2: Wiping system data tables ━━━');
            await this.truncateTables(SYSTEM_DATA_TABLES);
            console.log('');

            // ── PHASE 3: Seed core system (roles + super admin) ──
            console.log('━━━ PHASE 3: Seeding core system (roles + super admin) ━━━');
            await this.freshInitSeed.seed();
            console.log('');

            // ── PHASE 4: Seed SMTP settings ──
            console.log('━━━ PHASE 4: Seeding SMTP settings ━━━');
            await this.settingsSeed.seeds();
            console.log('');

            // ── PHASE 5: Seed HRM tools ──
            console.log('━━━ PHASE 5: Seeding HRM tools (7 modules) ━━━');
            await this.toolsSeed.seed();
            console.log('');

            // ── PHASE 6: Seed subscription plans ──
            console.log('━━━ PHASE 6: Seeding subscription plans (8 plans) ━━━');
            await this.hrmPlansSeed.seed();
            console.log('');

            // ── PHASE 7: Seed leave types ──
            console.log('━━━ PHASE 7: Seeding leave types (7 system types) ━━━');
            await this.leaveTypesSeed.seed();
            console.log('');

            // ── PHASE 8: Seed document categories ──
            console.log('━━━ PHASE 8: Seeding document categories (13 categories) ━━━');
            await this.documentCategoriesSeed.seed();
            console.log('');

            // ── PHASE 9: Seed contract templates ──
            console.log('━━━ PHASE 9: Seeding contract templates (3 UK templates) ━━━');
            await this.contractTemplatesSeed.seed();
            console.log('');

            // ── PHASE 10: Seed notification events + templates ──
            console.log('━━━ PHASE 10: Seeding notification events (18 events) ━━━');
            await this.notificationEventsSeed.seed();
            console.log('');

            // ── PHASE 11: Sync role permissions ──
            console.log('━━━ PHASE 11: Syncing role permissions with all modules ━━━');
            await this.updateRolePermissionsSeed.updateRolePermissions();
            await this.syncCustomRolePermissionsSeed.syncCustomRolePermissions();
            console.log('');

            // ── DONE ──
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log('╔══════════════════════════════════════════════════════════════╗');
            console.log('║           PRODUCTION SEED COMPLETED SUCCESSFULLY            ║');
            console.log('╠══════════════════════════════════════════════════════════════╣');
            console.log('║                                                             ║');
            console.log('║  Super Admin Login:                                         ║');
            console.log('║    Email:    admin@shivatrade.com                                ║');
            console.log('║    Password: Admin@123                                      ║');
            console.log('║                                                             ║');
            console.log('║  Seeded Data:                                               ║');
            console.log('║    - 5 system roles with permissions                        ║');
            console.log('║    - 1 super admin user                                     ║');
            console.log('║    - SMTP settings (from .env)                              ║');
            console.log('║    - 7 HRM tools                                            ║');
            console.log('║    - 8 subscription plans (monthly/yearly/trial/lifetime)   ║');
            console.log('║    - 7 leave types                                          ║');
            console.log('║    - 13 document categories                                 ║');
            console.log('║    - 3 UK contract templates                                ║');
            console.log('║    - 18 notification events + email/SMS templates           ║');
            console.log('║                                                             ║');
            console.log(`║  Completed in ${elapsed}s                                      ║`);
            console.log('╚══════════════════════════════════════════════════════════════╝');
            console.log('');

        } catch (error: any) {
            console.error('');
            console.error('╔══════════════════════════════════════════════════════════════╗');
            console.error('║           PRODUCTION SEED FAILED                            ║');
            console.error('╚══════════════════════════════════════════════════════════════╝');
            console.error(`Error: ${error.message}`);
            console.error('');
            throw error;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // seed:production-wipe — Wipe only (no seeding) — for manual step-by-step
    // ─────────────────────────────────────────────────────────────────────────────
    @Command({
        command: 'seed:production-wipe',
        describe: 'Wipe all user-generated and system data tables (no seeding)',
    })
    async wipeOnly(): Promise<void> {
        console.log('');
        console.log('Wiping ALL data tables...');
        console.log('');

        console.log('── User-generated data ──');
        await this.truncateTables(USER_DATA_TABLES);
        console.log('');

        console.log('── System data ──');
        await this.truncateTables(SYSTEM_DATA_TABLES);
        console.log('');

        console.log('All tables wiped. Run individual seeds to repopulate.');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Helper: Truncate tables safely using CASCADE
    // ─────────────────────────────────────────────────────────────────────────────
    private async truncateTables(tables: string[]): Promise<void> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();

        try {
            for (const table of tables) {
                try {
                    // Check if table exists before truncating
                    const exists = await queryRunner.query(
                        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
                        [table],
                    );
                    if (!exists?.[0]?.exists) {
                        console.log(`  ~ Skipping "${table}" (table does not exist)`);
                        continue;
                    }

                    await queryRunner.query(`TRUNCATE TABLE "${table}" CASCADE`);
                    console.log(`  + Truncated "${table}"`);
                } catch (err: any) {
                    console.warn(`  ! Warning: Could not truncate "${table}": ${err.message}`);
                }
            }
        } finally {
            await queryRunner.release();
        }
    }
}
