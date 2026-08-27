import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    HttpCode,
    HttpStatus,
    Res,
} from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { DashboardExportService } from '../services/dashboard-export.service';
import { DashboardExportRequestDto } from '../dtos/request/dashboard-export.request.dto';
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
import { LeadRepository } from '@modules/lead/repository/repositories/lead.repository';
import { QuotationRepository } from '@modules/quotation/repository/repositories/quotation.repository';
import { PfiRepository } from '@modules/pfi/repository/repositories/pfi.repository';
import { PurchaseOrderRepository } from '@modules/purchase-order/repository/repositories/purchase-order.repository';
import { PoVendorRepository } from '@modules/po-vendor/repository/repositories/po-vendor.repository';
import { PoVendorTrackingEventRepository } from '@modules/tracking-event/repository/repositories/po-vendor-tracking-event.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
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
        private readonly leadRepository: LeadRepository,
        private readonly quotationRepository: QuotationRepository,
        private readonly pfiRepository: PfiRepository,
        private readonly poRepository: PurchaseOrderRepository,
        private readonly povRepository: PoVendorRepository,
        private readonly trackingEventRepository: PoVendorTrackingEventRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly dashboardExportService: DashboardExportService,
    ) {}

    /**
     * WYSIWYG exports — the request body is exactly what ErpDashboard.js has
     * already rendered on screen (KPIs/attention/counts/leaderboards); these
     * endpoints only style/paginate it into a file, never recompute a figure.
     */
    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/export/excel')
    async exportExcel(
        @Body() body: DashboardExportRequestDto,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const { buffer, filename } =
            this.dashboardExportService.renderExcel(body);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
        );
        res.setHeader('Content-Length', buffer.length.toString());
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/export/pdf')
    async exportPdf(
        @Body() body: DashboardExportRequestDto,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const { buffer, filename } =
            await this.dashboardExportService.renderPdf(body);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
        );
        res.setHeader('Content-Length', buffer.length.toString());
        res.end(buffer);
    }

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

        // Allowed roles for the Employee module: legacy Employee system role
        // + every active custom role for this company. Custom-role users
        // count toward total-employees too.
        let allowedRoleIds: string[] = [];
        try {
            allowedRoleIds = await this.roleService.getListableEmployeeRoleIds(
                companyId
            );
        } catch {}
        const allowedRoleSet = new Set(allowedRoleIds);

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

        // Filter to Employee + custom-role users (anyone in the Employee module)
        const employees = allowedRoleSet.size > 0
            ? allUsers.filter((u: any) => allowedRoleSet.has(String(u.role)))
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

    /**
     * Sales / Purchase / Operations rollup for the dashboard.
     * Date window is controlled by `?period=today|week|month|year` (default = month).
     * Each section is computed independently so a partial failure on one
     * doesn't take the whole payload down. FE gates per-card visibility
     * using the user's module permissions.
     */
    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/operations-stats')
    async operationsStats(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @Query('period') period?: string,
    ) {
        // ── Resolve company timezone + date window ──
        let companyTz = 'UTC';
        try {
            const comp = await this.companyService.findOneById(companyId);
            if (comp?.timezone) companyTz = comp.timezone;
        } catch {}

        const now = DateTime.now().setZone(companyTz);
        const p = (period || 'month').toLowerCase();
        let fromIso: string;
        const toIso = now.toISO();
        if (p === 'today') fromIso = now.startOf('day').toISO();
        else if (p === 'week') fromIso = now.startOf('week').toISO();
        else if (p === 'year') fromIso = now.startOf('year').toISO();
        else fromIso = now.startOf('month').toISO();

        const isLocationAdmin = roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN;
        const scopedLocations = isLocationAdmin
            ? Array.from(
                  new Set(
                      [
                          ...(assignedLocations || []),
                          ...(jwtLocationId ? [jwtLocationId] : []),
                      ].filter(Boolean)
                  )
              )
            : [];

        const num = (v: any) =>
            v === null || v === undefined || v === '' ? 0 : Number(v);

        // ── Sales (company-wide; not location-scoped) ──
        const sales = await (async () => {
            try {
                const [leads, quotations, pfis] = await Promise.all([
                    this.leadRepository.findAll({
                        company_id: companyId,
                        soft_delete: false,
                    } as any),
                    this.quotationRepository.findAll({
                        company_id: companyId,
                        soft_delete: false,
                    } as any),
                    this.pfiRepository.findAll({
                        company_id: companyId,
                        soft_delete: false,
                    } as any),
                ]);

                const activeLeads = (leads as any[]).filter(
                    l => l.status !== 'lost' && l.status !== 'won'
                ).length;
                const openQuotations = (quotations as any[]).filter(
                    q => q.status === 'draft' || q.status === 'sent'
                ).length;
                const approvedPfis = (pfis as any[]).filter(
                    p => p.status === 'approved'
                ).length;

                // Pipeline value = sum of open quotation grand_totals in home
                // currency (₹). The quotation `exchange_rate` is document-per-₹1,
                // so INR = grand_total ÷ exchange_rate (matches quotation.service
                // stats + every report). It was MULTIPLYING, which understated
                // every foreign-currency quote (a $1000 quote at 0.0105 read ₹10.5
                // instead of ₹95,238). Domestic INR quotes (rate = 1) are unaffected.
                const pipelineValue = (quotations as any[])
                    .filter(q => q.status === 'draft' || q.status === 'sent')
                    .reduce(
                        (s, q) =>
                            s + num(q.grand_total) / (num(q.exchange_rate) || 1),
                        0
                    );

                return {
                    activeLeads,
                    openQuotations,
                    approvedPfis,
                    pipelineValue: Math.round(pipelineValue * 100) / 100,
                };
            } catch (e: any) {
                console.error('[OperationsStats:sales]', e?.message);
                return null;
            }
        })();

        // ── Purchase ──
        const purchase = await (async () => {
            try {
                const [pos, povs, vendors] = await Promise.all([
                    this.poRepository.findAll({
                        company_id: companyId,
                        soft_delete: false,
                    } as any),
                    this.povRepository.findAll({
                        company_id: companyId,
                        soft_delete: false,
                    } as any),
                    this.vendorRepository.findAll({
                        company_id: companyId,
                        soft_delete: false,
                    } as any),
                ]);

                const posByStatus = countBy(pos as any[], 'status');
                const povsByStatus = countBy(povs as any[], 'status');
                // SO (purchase-order) grand_total in ₹: exchange_rate is
                // document-per-₹1 → INR = grand_total ÷ exchange_rate (matches
                // purchase-order.service stats + reports). Was multiplying, which
                // understated every foreign-currency Sales Order.
                const poGrandTotal = (pos as any[]).reduce(
                    (s, p) =>
                        s + num(p.grand_total) / (num(p.exchange_rate) || 1),
                    0
                );

                // Top vendors by POV count within the period.
                const fromMs = new Date(fromIso).getTime();
                const periodPovs = (povs as any[]).filter(
                    v => v.createdAt && new Date(v.createdAt).getTime() >= fromMs
                );
                const vendorAgg = new Map<
                    string,
                    { count: number; total: number }
                >();
                for (const v of periodPovs) {
                    const vid = v.vendor_id?.toString();
                    if (!vid) continue;
                    const cur = vendorAgg.get(vid) || { count: 0, total: 0 };
                    cur.count += 1;
                    // POV doesn't carry grand_total directly; use line sum if present.
                    const lineSum = Array.isArray(v.lines)
                        ? v.lines.reduce(
                              (s: number, l: any) => s + num(l.line_total),
                              0
                          )
                        : 0;
                    cur.total += lineSum;
                    vendorAgg.set(vid, cur);
                }
                const vendorMap = new Map(
                    (vendors as any[]).map(v => [
                        v._id.toString(),
                        v.company_name || v.vendor_code || '-',
                    ])
                );
                const topVendorsThisMonth = Array.from(vendorAgg.entries())
                    .map(([vid, agg]) => ({
                        vendor_id: vid,
                        vendor_name: vendorMap.get(vid) || vid.slice(0, 8),
                        povCount: agg.count,
                        totalValue: Math.round(agg.total * 100) / 100,
                    }))
                    .sort((a, b) => b.povCount - a.povCount)
                    .slice(0, 5);

                return {
                    posByStatus,
                    povsByStatus,
                    poGrandTotal: Math.round(poGrandTotal * 100) / 100,
                    topVendorsThisMonth,
                };
            } catch (e: any) {
                console.error('[OperationsStats:purchase]', e?.message);
                return null;
            }
        })();

        // ── Operations (POV + tracking; location-scoped for Location Admin) ──
        const operations = await (async () => {
            try {
                const baseFind: any = {
                    company_id: companyId,
                    soft_delete: false,
                };
                if (isLocationAdmin && scopedLocations.length) {
                    baseFind.delivery_address_id = { $in: scopedLocations };
                }
                const povs = await this.povRepository.findAll(baseFind);
                const todayStart = now.startOf('day').toISO();
                const todayStartMs = new Date(todayStart).getTime();

                const povsAwaitingReceipt = (povs as any[]).filter(
                    v => v.status === 'dispatched'
                ).length;
                const overdueArrivals = (povs as any[]).filter(v => {
                    if (v.status !== 'dispatched' && v.status !== 'draft')
                        return false;
                    if (!v.expected_arrival_date) return false;
                    return (
                        new Date(v.expected_arrival_date).getTime() <
                        todayStartMs
                    );
                }).length;

                const povIds = (povs as any[]).map(v => v._id.toString());
                let trackingEventsToday = 0;
                let recentTrackingEvents: any[] = [];
                if (povIds.length) {
                    const allEvents =
                        await this.trackingEventRepository.findAll({
                            po_vendor_id: { $in: povIds },
                            soft_delete: false,
                        } as any);
                    trackingEventsToday = (allEvents as any[]).filter(e => {
                        const ts = e.event_at
                            ? new Date(e.event_at).getTime()
                            : 0;
                        return ts >= todayStartMs;
                    }).length;
                    recentTrackingEvents = (allEvents as any[])
                        .sort(
                            (a, b) =>
                                new Date(b.event_at || 0).getTime() -
                                new Date(a.event_at || 0).getTime()
                        )
                        .slice(0, 5)
                        .map(e => ({
                            _id: e._id,
                            po_vendor_id: e.po_vendor_id,
                            event_at: e.event_at,
                            event_type: e.event_type,
                            location: e.location,
                            notes: e.notes,
                        }));
                }

                return {
                    trackingEventsToday,
                    povsAwaitingReceipt,
                    overdueArrivals,
                    recentTrackingEvents,
                };
            } catch (e: any) {
                console.error('[OperationsStats:ops]', e?.message);
                return null;
            }
        })();

        return {
            statusCode: 200,
            message: 'Success',
            data: {
                period: p,
                from: fromIso,
                to: toIso,
                sales,
                purchase,
                operations,
            },
        };
    }
}

function countBy(rows: any[], key: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of rows) {
        const k = (r?.[key] ?? 'unknown').toString();
        out[k] = (out[k] || 0) + 1;
    }
    return out;
}
