import { Injectable } from '@nestjs/common';
import { Command } from 'nestjs-command';
import { PlanService } from '@modules/plan/services/plan.service';
import { ToolsRepository } from '@modules/tools/repository/repositories/tools.repository';
import { ENUM_PLAN_STATUS, ENUM_PLAN_DURATION_TYPE, ENUM_TOOL_PRICING_MODE } from '@modules/plan/enums/plan.enum';

// ─── Pricing Design ───────────────────────────────────────────────────────────
//
// Tool prices below are per-location/month.
// Plans use MULTIPLIER pricing mode: each extra location adds full tool price.
//
//  Tool                    £/loc/mo
//  ─────────────────────── ────────
//  Holiday Calendar           2.00
//  Document Management        3.00
//  Contracts                  5.00
//  Leave Management           4.00
//  Attendance                 5.00
//  Shift & Rota               4.00
//  Home Office Compliance     6.00
//
// Plans:
//
//  MONTHLY (recurring):
//  HRM Starter       (£19/loc/mo)  – Holiday + Documents + Leave
//  HRM Professional  (£49/loc/mo)  – Starter + Contracts + Attendance + Shift
//  HRM Enterprise    (£79/loc/mo)  – Everything including Compliance
//
//  YEARLY (recurring, ~2 months free = 16.7% off):
//  HRM Starter Yearly       (£190/loc/yr = £15.83/loc/mo equiv)
//  HRM Professional Yearly  (£490/loc/yr = £40.83/loc/mo equiv)
//  HRM Enterprise Yearly    (£790/loc/yr = £65.83/loc/mo equiv)
//
//  TRIAL (14 days, non-recurring):
//  HRM Professional Trial   – 14 days free, Professional features
//
//  LIFETIME (one-time payment):
//  HRM Enterprise Lifetime  – All 7 tools, ~24 months equivalent
// ─────────────────────────────────────────────────────────────────────────────

// All plan names managed by this seed (for cleanup)
const ALL_PLAN_NAMES = [
    'HRM Starter',
    'HRM Professional',
    'HRM Enterprise',
    'HRM Starter Yearly',
    'HRM Professional Yearly',
    'HRM Enterprise Yearly',
    'HRM Professional Trial',
    'HRM Enterprise Lifetime',
];

@Injectable()
export class MigrationHrmPlansSeed {
    constructor(
        private readonly planService: PlanService,
        private readonly toolsRepository: ToolsRepository,
    ) {}

    @Command({
        command: 'seed:hrm-plans',
        describe: 'Seed HRM subscription plans (Monthly, Yearly, Trial, Lifetime). Run after seed:tools.',
    })
    async seed(): Promise<void> {
        try {
            console.log('=== HRM Plans Seed ===');
            console.log('');

            // ── Fetch HRM tools from DB ────────────────────────────────────────
            const toolSlugs = [
                'hrm-holiday-calendar',
                'hrm-documents',
                'hrm-contracts',
                'hrm-leave',
                'hrm-attendance',
                'hrm-shift-rota',
                'hrm-compliance',
                'hrm-payroll',
            ];

            const toolMap: Record<string, { _id: string; name: string; slug: string }> = {};
            for (const slug of toolSlugs) {
                const tool = await this.toolsRepository.findOne({ slug });
                if (!tool) {
                    throw new Error(
                        `Tool "${slug}" not found in database. Run "seed:tools" first.`
                    );
                }
                toolMap[slug] = { _id: String(tool._id), name: tool.name, slug: tool.slug };
            }
            console.log(`  ✅ All ${toolSlugs.length} HRM tools found in database`);
            console.log('');

            // ── Helper: build PlanToolDto ──────────────────────────────────────
            const t = (slug: string, price: number) => ({
                _id: toolMap[slug]._id,
                name: toolMap[slug].name,
                slug: toolMap[slug].slug,
                price,
                pricing_mode: ENUM_TOOL_PRICING_MODE.MULTIPLIER,
                location_multiplier: 1.0,
                is_mandatory: false,
            });

            // ── Starter tools ──────────────────────────────────────────────────
            const starterTools = [
                t('hrm-holiday-calendar', 2),
                t('hrm-documents',         3),
                t('hrm-leave',             4),
            ];

            // ── Professional tools ─────────────────────────────────────────────
            const professionalTools = [
                t('hrm-holiday-calendar', 2),
                t('hrm-documents',         3),
                t('hrm-contracts',         5),
                t('hrm-leave',             4),
                t('hrm-attendance',        5),
                t('hrm-shift-rota',        4),
            ];

            // ── Enterprise tools (all 8) ───────────────────────────────────────
            const enterpriseTools = [
                t('hrm-holiday-calendar', 2),
                t('hrm-documents',         3),
                t('hrm-contracts',         5),
                t('hrm-leave',             4),
                t('hrm-attendance',        5),
                t('hrm-shift-rota',        4),
                t('hrm-compliance',        6),
                t('hrm-payroll',           8),
            ];

            // ── Plan definitions ───────────────────────────────────────────────
            const plans = [
                // ── MONTHLY PLANS ──────────────────────────────────────────────
                {
                    name: 'HRM Starter',
                    displayOrder: 1,
                    isDefault: true,
                    duration: 1,
                    duration_type: ENUM_PLAN_DURATION_TYPE.MONTHLY,
                    recurring: true,
                    trial: false,
                    is_lifetime: false,
                    features: [
                        'Holiday calendar with UK bank holiday import',
                        'Document storage with expiry alerts',
                        'Leave requests & approval workflow',
                        'Employee self-service portal',
                        'Email notifications',
                    ],
                    location_pricing: [
                        { locations: 3,   price: 19,  platform_fee: 10 },
                        { locations: 10,  price: 17,  platform_fee: 10 },
                        { locations: 30,  price: 15,  platform_fee: 10 },
                        { locations: 100, price: 13,  platform_fee: 10 },
                    ],
                    tools: starterTools,
                    metadata: { slug: 'hrm-starter', billing_cycle: 'monthly' },
                },
                {
                    name: 'HRM Professional',
                    displayOrder: 2,
                    isDefault: false,
                    duration: 1,
                    duration_type: ENUM_PLAN_DURATION_TYPE.MONTHLY,
                    recurring: true,
                    trial: false,
                    is_lifetime: false,
                    features: [
                        'Everything in HRM Starter',
                        'Employment contracts with digital signature',
                        'Attendance tracking with clock in/out',
                        'Shift & rota builder',
                        'Overtime & break management',
                        'Bradford factor monitoring',
                        'Monthly attendance reports',
                    ],
                    location_pricing: [
                        { locations: 3,   price: 49,  platform_fee: 26 },
                        { locations: 10,  price: 44,  platform_fee: 26 },
                        { locations: 30,  price: 39,  platform_fee: 26 },
                        { locations: 100, price: 34,  platform_fee: 26 },
                    ],
                    tools: professionalTools,
                    metadata: { slug: 'hrm-professional', billing_cycle: 'monthly' },
                },
                {
                    name: 'HRM Enterprise',
                    displayOrder: 3,
                    isDefault: false,
                    duration: 1,
                    duration_type: ENUM_PLAN_DURATION_TYPE.MONTHLY,
                    recurring: true,
                    trial: false,
                    is_lifetime: false,
                    features: [
                        'Everything in HRM Professional',
                        'Home Office Compliance (UK)',
                        'Immigration record management',
                        'Right to Work (RTW) check log',
                        'UKVI reportable event tracking',
                        'Visa & BRP expiry alerts (90/60/30/14/7 days)',
                        'GDPR data retention automation',
                        'Full compliance audit trail',
                        'Dedicated onboarding support',
                    ],
                    location_pricing: [
                        { locations: 3,   price: 79,  platform_fee: 44 },
                        { locations: 10,  price: 71,  platform_fee: 44 },
                        { locations: 30,  price: 63,  platform_fee: 44 },
                        { locations: 100, price: 55,  platform_fee: 44 },
                    ],
                    tools: enterpriseTools,
                    metadata: { slug: 'hrm-enterprise', billing_cycle: 'monthly' },
                },

                // ── YEARLY PLANS (~2 months free = 10 × monthly price) ─────────
                {
                    name: 'HRM Starter Yearly',
                    displayOrder: 4,
                    isDefault: false,
                    duration: 12,
                    duration_type: ENUM_PLAN_DURATION_TYPE.YEARLY,
                    recurring: true,
                    trial: false,
                    is_lifetime: false,
                    features: [
                        'Everything in HRM Starter',
                        '2 months free (billed annually)',
                        'Save up to 16% vs monthly billing',
                        'Holiday calendar with UK bank holiday import',
                        'Document storage with expiry alerts',
                        'Leave requests & approval workflow',
                        'Employee self-service portal',
                        'Email notifications',
                    ],
                    // Yearly price = monthly × 10 (2 months free)
                    location_pricing: [
                        { locations: 3,   price: 190, platform_fee: 100 },
                        { locations: 10,  price: 170, platform_fee: 100 },
                        { locations: 30,  price: 150, platform_fee: 100 },
                        { locations: 100, price: 130, platform_fee: 100 },
                    ],
                    tools: starterTools,
                    metadata: { slug: 'hrm-starter-yearly', billing_cycle: 'yearly', monthly_equivalent: 'hrm-starter' },
                },
                {
                    name: 'HRM Professional Yearly',
                    displayOrder: 5,
                    isDefault: false,
                    duration: 12,
                    duration_type: ENUM_PLAN_DURATION_TYPE.YEARLY,
                    recurring: true,
                    trial: false,
                    is_lifetime: false,
                    features: [
                        'Everything in HRM Professional',
                        '2 months free (billed annually)',
                        'Save up to 16% vs monthly billing',
                        'Employment contracts with digital signature',
                        'Attendance tracking with clock in/out',
                        'Shift & rota builder',
                        'Bradford factor monitoring',
                        'Monthly attendance reports',
                    ],
                    location_pricing: [
                        { locations: 3,   price: 490, platform_fee: 260 },
                        { locations: 10,  price: 440, platform_fee: 260 },
                        { locations: 30,  price: 390, platform_fee: 260 },
                        { locations: 100, price: 340, platform_fee: 260 },
                    ],
                    tools: professionalTools,
                    metadata: { slug: 'hrm-professional-yearly', billing_cycle: 'yearly', monthly_equivalent: 'hrm-professional' },
                },
                {
                    name: 'HRM Enterprise Yearly',
                    displayOrder: 6,
                    isDefault: false,
                    duration: 12,
                    duration_type: ENUM_PLAN_DURATION_TYPE.YEARLY,
                    recurring: true,
                    trial: false,
                    is_lifetime: false,
                    features: [
                        'Everything in HRM Enterprise',
                        '2 months free (billed annually)',
                        'Save up to 16% vs monthly billing',
                        'Home Office Compliance (UK)',
                        'Immigration record management',
                        'Right to Work (RTW) check log',
                        'UKVI reportable event tracking',
                        'Visa & BRP expiry alerts',
                        'GDPR data retention automation',
                        'Dedicated onboarding support',
                    ],
                    location_pricing: [
                        { locations: 3,   price: 790, platform_fee: 440 },
                        { locations: 10,  price: 710, platform_fee: 440 },
                        { locations: 30,  price: 630, platform_fee: 440 },
                        { locations: 100, price: 550, platform_fee: 440 },
                    ],
                    tools: enterpriseTools,
                    metadata: { slug: 'hrm-enterprise-yearly', billing_cycle: 'yearly', monthly_equivalent: 'hrm-enterprise' },
                },

                // ── TRIAL PLAN (14 days, Professional features, £0) ────────────
                {
                    name: 'HRM Professional Trial',
                    displayOrder: 0,
                    isDefault: false,
                    duration: 14,
                    duration_type: ENUM_PLAN_DURATION_TYPE.TRIAL,
                    recurring: false,
                    trial: true,
                    is_lifetime: false,
                    features: [
                        '14-day free trial — no credit card required',
                        'Full access to HRM Professional features',
                        'Holiday calendar & document management',
                        'Leave management & approval workflows',
                        'Contracts with digital signature',
                        'Attendance tracking & shift builder',
                        'Automatic upgrade reminder at day 10',
                    ],
                    location_pricing: [
                        { locations: 3,   price: 0, platform_fee: 0 },
                        { locations: 10,  price: 0, platform_fee: 0 },
                        { locations: 30,  price: 0, platform_fee: 0 },
                        { locations: 100, price: 0, platform_fee: 0 },
                    ],
                    tools: professionalTools,
                    metadata: { slug: 'hrm-professional-trial', billing_cycle: 'trial', upgrades_to: 'hrm-professional' },
                },

                // ── LIFETIME PLAN (one-time, Enterprise features) ──────────────
                {
                    name: 'HRM Enterprise Lifetime',
                    displayOrder: 7,
                    isDefault: false,
                    duration: 0,
                    duration_type: ENUM_PLAN_DURATION_TYPE.LIFETIME,
                    recurring: false,
                    trial: false,
                    is_lifetime: true,
                    features: [
                        'One-time payment — never pay again',
                        'All 7 HRM modules included forever',
                        'Home Office Compliance (UK)',
                        'Immigration & Right to Work records',
                        'UKVI reportable event tracking',
                        'Visa & BRP expiry alerts',
                        'GDPR data retention automation',
                        'Lifetime software updates',
                        'Priority onboarding & support',
                    ],
                    // One-time price ≈ 24× monthly Enterprise pricing
                    location_pricing: [
                        { locations: 3,   price: 1499, platform_fee: 0 },
                        { locations: 10,  price: 1299, platform_fee: 0 },
                        { locations: 30,  price: 1099, platform_fee: 0 },
                        { locations: 100, price: 899,  platform_fee: 0 },
                    ],
                    tools: enterpriseTools,
                    metadata: { slug: 'hrm-enterprise-lifetime', billing_cycle: 'lifetime' },
                },
            ];

            // ── Create / update plans ──────────────────────────────────────────
            let created = 0;
            let skipped = 0;

            for (const plan of plans) {
                const exists = await this.planService.existByName(plan.name);
                if (exists) {
                    console.log(`  - Skipping "${plan.name}" (already exists)`);
                    skipped++;
                    continue;
                }

                await this.planService.create({
                    name: plan.name,
                    location_pricing: plan.location_pricing,
                    features: plan.features,
                    status: ENUM_PLAN_STATUS.ACTIVE,
                    isDefault: plan.isDefault,
                    displayOrder: plan.displayOrder,
                    duration: plan.duration,
                    duration_type: plan.duration_type,
                    recurring: plan.recurring,
                    trial: plan.trial,
                    is_lifetime: plan.is_lifetime,
                    tools: plan.tools,
                    metadata: plan.metadata,
                });

                const billingLabel = plan.trial ? '14-day trial' :
                    plan.is_lifetime ? 'lifetime' :
                    plan.duration_type === ENUM_PLAN_DURATION_TYPE.YEARLY ? 'yearly' : 'monthly';
                console.log(`  + Created "${plan.name}" [${billingLabel}]`);
                console.log(`      Tools: ${plan.tools.map(t => t.name).join(', ')}`);
                console.log(`      Price: £${plan.location_pricing[0].price} (1–${plan.location_pricing[0].locations} locations)`);
                created++;
            }

            console.log('');
            console.log('=== Seed Summary ===');
            console.log(`  Created : ${created}`);
            console.log(`  Skipped : ${skipped}`);
            console.log('');
            console.log('HRM plans seeding completed successfully!');

        } catch (error) {
            console.error('Error during HRM plans seeding:', error);
            throw error;
        }
    }

    @Command({
        command: 'remove:hrm-plans',
        describe: 'Remove HRM subscription plans from the database',
    })
    async remove(): Promise<void> {
        try {
            console.log('=== Removing HRM Plans ===');
            console.log('');

            for (const name of ALL_PLAN_NAMES) {
                // Find by name (more reliable than querying JSONB metadata)
                const plan = await this.planService.findOneByName(name);

                if (plan) {
                    await this.planService.deleteMany({ _id: plan._id });
                    console.log(`  ✅ Removed "${plan.name}"`);
                } else {
                    console.log(`  - Not found: "${name}" (skipping)`);
                }
            }

            console.log('');
            console.log('HRM plans removal completed.');
        } catch (error) {
            console.error('Error during HRM plans removal:', error);
            throw error;
        }
    }
}
