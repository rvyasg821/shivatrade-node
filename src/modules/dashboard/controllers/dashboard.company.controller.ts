import { Controller, Get, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';
import { AttendanceReportService } from '@modules/attendance/services/attendance-report.service';
import { AttendanceRecordRepository } from '@modules/attendance/repository/repositories/attendance-record.repository';
import { LeaveRequestService } from '@modules/leave/services/leave-request.service';
import { LocationService } from '@modules/location/services/location.service';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { RoleService } from '@modules/role/services/role.service';
import { CompanyService } from '@modules/company/services/company.service';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import { LeaveTypeService } from '@modules/leave/services/leave-type.service';
import { ShiftTemplateService } from '@modules/shift/services/shift-template.service';
import { ContractTemplateService } from '@modules/contract/services/contract-template.service';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';
import { DateTime } from 'luxon';

@ApiTags('dashboard.company')
@Controller({ version: '1', path: '/admin/dashboard' })
export class DashboardCompanyController {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly roleService: RoleService,
        private readonly attendanceRecordRepository: AttendanceRecordRepository,
        private readonly leaveRequestService: LeaveRequestService,
        private readonly locationService: LocationService,
        private readonly companyService: CompanyService,
        private readonly settingsService: CompanySettingsService,
        private readonly leaveTypeService: LeaveTypeService,
        private readonly shiftTemplateService: ShiftTemplateService,
        private readonly contractTemplateService: ContractTemplateService,
        private readonly subscriptionService: SubscriptionService,
    ) {}

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/company-stats')
    async companyStats(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
    ) {
      try {
        // Get company timezone for accurate "today" date
        let companyTz = 'UTC';
        try {
            const comp = await this.companyService.findOneById(companyId);
            if (comp?.timezone) companyTz = comp.timezone;
        } catch {}
        const today = DateTime.now().setZone(companyTz).toISODate();
        const isLocationAdmin = roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN;

        // Get Employee role ID
        let employeeRoleId: string | null = null;
        try {
            const empRole = await this.roleService.findOneByName(ENUM_SYSTEM_ROLE.EMPLOYEE);
            if (empRole) employeeRoleId = (empRole as any)._id;
        } catch {}

        // Get employees scoped to role
        let allUsers: any[] = [];
        if (isLocationAdmin) {
            const locationIds = assignedLocations?.length ? assignedLocations : (jwtLocationId ? [jwtLocationId] : []);
            if (locationIds.length) {
                const users = await this.userRepository.findAll({ companyId });
                allUsers = users.filter((u: any) => locationIds.includes(u.location_id));
            }
        } else {
            allUsers = await this.userRepository.findAll({ companyId }) as any[];
        }

        // Filter to only Employee role
        const employees = employeeRoleId
            ? allUsers.filter((u: any) => u.role === employeeRoleId)
            : allUsers.filter((u: any) => u.employee_code);

        const employeeIds = employees.map((e: any) => e._id);
        const totalEmployees = employeeIds.length;

        // Get locations count
        let totalLocations = 0;
        try {
            if (isLocationAdmin) {
                totalLocations = assignedLocations?.length || 1;
            } else {
                const locations = await this.locationService.findAll(companyId);
                totalLocations = locations?.length || 0;
            }
        } catch {}

        // Today's attendance
        const todayRecords = await this.attendanceRecordRepository.findAll(
            { company_id: companyId, date: today, soft_delete: false }, {}
        ) as any[];

        // Filter to scoped employees
        const scopedTodayRecords = isLocationAdmin
            ? todayRecords.filter((r: any) => employeeIds.includes(r.user_id))
            : todayRecords;

        const presentToday = scopedTodayRecords.filter((r: any) => ['present', 'half_day'].includes(r.status)).length;
        const absentToday = scopedTodayRecords.filter((r: any) => r.status === 'absent').length;
        const lateToday = scopedTodayRecords.filter((r: any) => r.is_late).length;
        const onLeaveToday = scopedTodayRecords.filter((r: any) => r.status === 'on_leave').length;

        // Pending leave requests
        let pendingLeaves = 0;
        try {
            const pendingRequests = await this.leaveRequestService.findAll(companyId, 500, 0, { status: 'pending' });
            if (isLocationAdmin) {
                pendingLeaves = pendingRequests.filter((r: any) => employeeIds.includes(r.user_id)).length;
            } else {
                pendingLeaves = pendingRequests.length;
            }
        } catch {}

        // Recent 5 clock-ins today
        const recentClockIns = scopedTodayRecords
            .filter((r: any) => r.clock_in)
            .sort((a: any, b: any) => new Date(b.clock_in).getTime() - new Date(a.clock_in).getTime())
            .slice(0, 5);

        // Enrich with user names
        const userMap = new Map<string, string>();
        for (const emp of employees) {
            const name = [emp.first_name, emp.last_name].filter(Boolean).join(' ') || emp.name || '';
            userMap.set((emp as any)._id, name);
        }

        const recentActivity = recentClockIns.map((r: any) => ({
            user_id: r.user_id,
            user_name: userMap.get(r.user_id) || r.user_id?.substring(0, 8),
            clock_in: r.clock_in,
            clock_out: r.clock_out,
            status: r.status,
            is_late: r.is_late,
        }));

        // ── Company Setup Checklist (tool-aware) ──
        let setupChecklist: any = null;
        try {
            const company = await this.companyService.findOneById(companyId);
            const locations = await this.locationService.findAll(companyId);
            const settings = await this.settingsService.getCompanyDefaults(companyId);
            const mapped = this.settingsService.mapGet(settings);

            // Get subscribed tool slugs
            let toolSlugs: string[] = [];
            try {
                const sub = await this.subscriptionService.findActiveByUserId(companyId);
                if (!sub) {
                    // Fallback: try by company admin user
                    const companyEntity = await this.companyService.findOneById(companyId);
                    if (companyEntity?.user_id) {
                        const sub2 = await this.subscriptionService.findActiveByUserId(companyEntity.user_id);
                        if (sub2?.tools) toolSlugs = sub2.tools.map((t: any) => t.slug);
                    }
                } else if (sub?.tools) {
                    toolSlugs = sub.tools.map((t: any) => t.slug);
                }
            } catch {}

            const hasTool = (slug: string) => toolSlugs.includes(slug);

            // Build dynamic checklist — only include items for subscribed tools
            const items: any[] = [];

            // Always required
            items.push({
                key: 'company_details', label: 'Company Details',
                description: 'Set company name, country, timezone & currency',
                link: '/apps/company-settings', done: !!(company?.company_name && company?.timezone && company?.currency),
            });
            items.push({
                key: 'locations', label: 'Add Locations',
                description: 'Add at least one business location',
                link: '/apps/locations', done: locations?.length > 0,
            });
            items.push({
                key: 'branding', label: 'Branding & Logo',
                description: 'Upload company logo for emails and contracts',
                link: '/apps/company-settings', done: !!mapped.logo_url,
            });
            // Tool-specific items
            if (hasTool('hrm-attendance')) {
                items.push({
                    key: 'attendance_settings', label: 'Attendance Settings',
                    description: 'Configure late threshold, break tracking, overtime & GPS',
                    link: '/apps/attendance/admin', done: !!settings,
                });
            }
            if (hasTool('hrm-leave')) {
                let hasLeaveTypes = false;
                try { const lt = await this.leaveTypeService.findByCompany(companyId, true); hasLeaveTypes = lt?.length > 0; } catch {}
                items.push({
                    key: 'leave_settings', label: 'Leave Types & Policy',
                    description: 'Create leave types and set entitlement policies',
                    link: '/apps/leave/admin', done: hasLeaveTypes,
                });
            }
            if (hasTool('hrm-shift-rota')) {
                let hasShiftTemplates = false;
                try { const st = await this.shiftTemplateService.findAll(companyId); hasShiftTemplates = st?.length > 0; } catch {}
                items.push({
                    key: 'rota_settings', label: 'Shift Templates',
                    description: 'Create shift templates for rota schedule',
                    link: '/apps/shifts/admin', done: hasShiftTemplates,
                });
            }
            if (hasTool('hrm-contracts')) {
                let hasContractTemplates = false;
                try { const ct = await this.contractTemplateService.findAll(companyId); hasContractTemplates = ct?.length > 0; } catch {}
                items.push({
                    key: 'contract_templates', label: 'Contract Templates',
                    description: 'Create or customise contract templates',
                    link: '/apps/contracts/templates', done: hasContractTemplates,
                });
            }
            if (hasTool('hrm-compliance')) {
                const complianceCfg = mapped.compliance_config;
                items.push({
                    key: 'compliance_settings', label: 'Compliance Settings',
                    description: 'Configure visa & RTW reminders and notification preferences',
                    link: '/apps/compliance', done: !!complianceCfg?.visa_reminder_1st_days,
                });
            }

            // Always last
            items.push({
                key: 'employees', label: 'Add Employees',
                description: 'Add your first employees to the system',
                link: '/apps/employees', done: totalEmployees > 0,
            });

            setupChecklist = {
                items,
                toolSlugs,
                completedCount: items.filter(i => i.done).length,
                totalCount: items.length,
            };
        } catch {}

        return {
            statusCode: 200,
            message: 'Success',
            data: {
                totalEmployees,
                totalLocations,
                presentToday,
                absentToday,
                lateToday,
                onLeaveToday,
                pendingLeaves,
                attendanceRate: totalEmployees > 0 ? Math.round((presentToday / totalEmployees) * 100) : 0,
                recentActivity,
                setupChecklist,
            },
        };
      } catch (err: any) {
        console.error('[DashboardCompanyStats] Error:', err?.message, err?.stack);
        return { statusCode: 500, message: err?.message || 'Failed to load dashboard stats', data: null };
      }
    }
}
