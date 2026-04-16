import {
    Controller,
    Get,
    Post,
    Query,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SubscriptionCronService } from '../services/subscription-cron.service';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';
import { UserService } from '@modules/user/services/user.service';
import { CompanyService } from '@modules/company/services/company.service';
import { PlanService } from '@modules/plan/services/plan.service';
import { CardService } from '@modules/card/services/card.service';


@ApiTags('Admin - Cron Management')
@Controller({
    version: '1',
    path: '/admin/cron',
})
export class CronAdminController {
    constructor(
        private readonly subscriptionCronService: SubscriptionCronService,
        private readonly subscriptionService: SubscriptionService,
        private readonly userService: UserService,
        private readonly companyService: CompanyService,
        private readonly planService: PlanService,
        private readonly cardService: CardService,
    ) {}

    /**
     * Get cron job status and schedule information
     */
    @Get('/status')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Get cron jobs status and schedule' })
    async getCronStatus() {
        const now = new Date();
        const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        return {
            statusCode: HttpStatus.OK,
            message: 'Cron jobs status',
            data: {
                serverTime: now.toISOString(),
                serverTimezone,
                localTime: now.toLocaleString('en-GB', { timeZone: serverTimezone }),
                cronJobs: [
                    {
                        name: 'checkAndStartNewCustomerPlan',
                        schedule: 'Every day at 1:00 AM',
                        cronExpression: '0 1 * * *',
                        description: 'Process pending subscription provisioning',
                        nextRun: this.getNextRunTime(1),
                    },
                    {
                        name: 'deductCustomerRecurringCharge',
                        schedule: 'Every day at 2:00 AM',
                        cronExpression: '0 2 * * *',
                        description: 'Process recurring payments (PayPal & Stripe)',
                        nextRun: this.getNextRunTime(2),
                    },
                    {
                        name: 'checkCustomerSubscription',
                        schedule: 'Every day at 3:00 AM',
                        cronExpression: '0 3 * * *',
                        description: 'Check expiring subscriptions and expired trials',
                        nextRun: this.getNextRunTime(3),
                    },
                ],
                adminEmail: process.env.ADMIN_EMAIL || 'Not configured',
            },
        };
    }

    /**
     * Preview subscriptions due for recurring payment today (dry-run)
     */
    @Get('/recurring-payments/preview')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Preview subscriptions due for recurring payment today' })
    async previewRecurringPayments() {
        const subscriptions = await this.subscriptionService.findAllActiveTodaysNextBillingDate();

        const preview = await Promise.all(
            subscriptions.map(async (sub) => {
                const user = await this.userService.findOneById(sub.user_id?.toString());
                const company = await this.companyService.findOneById(sub.company_id?.toString());
                const plan = await this.planService.findOneById(sub.plan_id?.toString());
                const card = await this.cardService.findOneSort({
                    user_id: sub.user_id?.toString(),
                });

                return {
                    subscriptionId: sub._id?.toString(),
                    companyName: company?.company_name || 'N/A',
                    customerName: user?.name || 'N/A',
                    customerEmail: user?.email || 'N/A',
                    planName: plan?.name || sub.plan_name || 'N/A',
                    nextDate: sub.next_date,
                    amount: {
                        planPrice: sub.plan_price || sub.platform_price || 0,
                        toolsPrice: sub.tools_price || 0,
                        taxPrice: sub.tax_price || sub.tax_value || 0,
                        finalPrice: sub.final_price || 0,
                    },
                    gateway: card?.gateway?.toUpperCase() || 'NO CARD',
                    cardLast4: card?.last4 || 'N/A',
                    recurring: sub.recurring,
                    status: sub.status,
                };
            })
        );

        return {
            statusCode: HttpStatus.OK,
            message: `Found ${subscriptions.length} subscriptions due for payment today`,
            data: {
                count: subscriptions.length,
                totalAmount: preview.reduce((sum, p) => sum + (p.amount.finalPrice || 0), 0),
                subscriptions: preview,
            },
        };
    }

    /**
     * Preview expiring subscriptions (within 7 days)
     */
    @Get('/expiring-subscriptions/preview')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Preview subscriptions expiring within 7 days' })
    @ApiQuery({ name: 'days', required: false, type: Number, description: 'Days to check (default: 7)' })
    async previewExpiringSubscriptions(@Query('days') days?: number) {
        const daysToCheck = days || 7;
        const subscriptions = await this.subscriptionService.findExpiringSoon(daysToCheck);

        const preview = await Promise.all(
            subscriptions.map(async (sub) => {
                const user = await this.userService.findOneById(sub.user_id?.toString());
                const company = await this.companyService.findOneById(sub.company_id?.toString());

                return {
                    subscriptionId: sub._id?.toString(),
                    companyName: company?.company_name || 'N/A',
                    customerName: user?.name || 'N/A',
                    customerEmail: user?.email || 'N/A',
                    planName: sub.plan_name || 'N/A',
                    nextDate: sub.next_date,
                    endDate: sub.end_date,
                    daysUntilExpiry: Math.ceil((new Date(sub.next_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
                };
            })
        );

        return {
            statusCode: HttpStatus.OK,
            message: `Found ${subscriptions.length} subscriptions expiring within ${daysToCheck} days`,
            data: {
                count: subscriptions.length,
                subscriptions: preview,
            },
        };
    }

    /**
     * Preview expired trial subscriptions
     */
    @Get('/expired-trials/preview')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Preview expired trial subscriptions' })
    async previewExpiredTrials() {
        const subscriptions = await this.subscriptionService.checkTrialExpiry();

        const preview = await Promise.all(
            subscriptions.map(async (sub) => {
                const user = await this.userService.findOneById(sub.user_id?.toString());
                const company = await this.companyService.findOneById(sub.company_id?.toString());

                return {
                    subscriptionId: sub._id?.toString(),
                    companyName: company?.company_name || 'N/A',
                    customerName: user?.name || 'N/A',
                    customerEmail: user?.email || 'N/A',
                    planName: sub.plan_name || 'N/A',
                    endDate: sub.end_date,
                    trialDays: sub.trial_days,
                    expiredDaysAgo: Math.ceil((Date.now() - new Date(sub.end_date).getTime()) / (1000 * 60 * 60 * 24)),
                };
            })
        );

        return {
            statusCode: HttpStatus.OK,
            message: `Found ${subscriptions.length} expired trial subscriptions`,
            data: {
                count: subscriptions.length,
                subscriptions: preview,
            },
        };
    }

    /**
     * Preview pending provisioning subscriptions
     */
    @Get('/pending-provisioning/preview')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Preview subscriptions with pending provisioning' })
    async previewPendingProvisioning() {
        const subscriptions = await this.subscriptionService.findPendingProvisioningSubscriptions();

        const preview = await Promise.all(
            subscriptions.map(async (sub) => {
                const user = await this.userService.findOneById(sub.user_id?.toString());
                const company = await this.companyService.findOneById(sub.company_id?.toString());

                return {
                    subscriptionId: sub._id?.toString(),
                    companyName: company?.company_name || 'N/A',
                    customerName: user?.name || 'N/A',
                    customerEmail: user?.email || 'N/A',
                    planName: sub.plan_name || 'N/A',
                    provisioningStatus: sub.provisioningStatus,
                    provisioningError: sub.provisioningError || null,
                    createdAt: sub.createdAt,
                };
            })
        );

        return {
            statusCode: HttpStatus.OK,
            message: `Found ${subscriptions.length} subscriptions with pending provisioning`,
            data: {
                count: subscriptions.length,
                subscriptions: preview,
            },
        };
    }

    /**
     * Manually trigger recurring payment cron (with optional dry-run)
     */
    @Post('/recurring-payments/run')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Manually trigger recurring payment processing' })
    @ApiQuery({ name: 'dryRun', required: false, type: Boolean, description: 'Preview only, do not process payments' })
    async runRecurringPayments(@Query('dryRun') dryRun?: string) {
        const isDryRun = dryRun === 'true';

        if (isDryRun) {
            // Return preview instead of processing
            return this.previewRecurringPayments();
        }

        // Actually run the cron job
        const startTime = Date.now();
        await this.subscriptionCronService.deductCustomerRecurringCharge();
        const duration = Date.now() - startTime;

        return {
            statusCode: HttpStatus.OK,
            message: 'Recurring payment cron job executed successfully',
            data: {
                executedAt: new Date().toISOString(),
                durationMs: duration,
                durationFormatted: `${(duration / 1000).toFixed(2)}s`,
            },
        };
    }

    /**
     * Manually trigger subscription check cron (with optional dry-run)
     */
    @Post('/subscription-check/run')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Manually trigger subscription check (expiring + trials)' })
    @ApiQuery({ name: 'dryRun', required: false, type: Boolean, description: 'Preview only, do not process' })
    async runSubscriptionCheck(@Query('dryRun') dryRun?: string) {
        const isDryRun = dryRun === 'true';

        if (isDryRun) {
            // Return combined preview
            const [expiring, trials] = await Promise.all([
                this.previewExpiringSubscriptions(),
                this.previewExpiredTrials(),
            ]);

            return {
                statusCode: HttpStatus.OK,
                message: 'Subscription check preview (dry-run)',
                data: {
                    expiringSubscriptions: expiring.data,
                    expiredTrials: trials.data,
                },
            };
        }

        // Actually run the cron job
        const startTime = Date.now();
        await this.subscriptionCronService.checkCustomerSubscription();
        const duration = Date.now() - startTime;

        return {
            statusCode: HttpStatus.OK,
            message: 'Subscription check cron job executed successfully',
            data: {
                executedAt: new Date().toISOString(),
                durationMs: duration,
                durationFormatted: `${(duration / 1000).toFixed(2)}s`,
            },
        };
    }

    /**
     * Manually trigger provisioning cron (with optional dry-run)
     */
    @Post('/provisioning/run')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Manually trigger subscription provisioning' })
    @ApiQuery({ name: 'dryRun', required: false, type: Boolean, description: 'Preview only, do not process' })
    async runProvisioning(@Query('dryRun') dryRun?: string) {
        const isDryRun = dryRun === 'true';

        if (isDryRun) {
            return this.previewPendingProvisioning();
        }

        // Actually run the cron job
        const startTime = Date.now();
        await this.subscriptionCronService.checkAndStartNewCustomerPlan();
        const duration = Date.now() - startTime;

        return {
            statusCode: HttpStatus.OK,
            message: 'Provisioning cron job executed successfully',
            data: {
                executedAt: new Date().toISOString(),
                durationMs: duration,
                durationFormatted: `${(duration / 1000).toFixed(2)}s`,
            },
        };
    }

    /**
     * Update a subscription's next_date for testing
     */
    @Post('/test/set-next-date-today')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Set a subscription next_date to today for testing' })
    @ApiQuery({ name: 'subscriptionId', required: true, type: String })
    async setNextDateToday(@Query('subscriptionId') subscriptionId: string) {
        if (!subscriptionId) {
            return {
                statusCode: HttpStatus.BAD_REQUEST,
                message: 'subscriptionId is required',
            };
        }

        const subscription = await this.subscriptionService.findOneById(subscriptionId);
        if (!subscription) {
            return {
                statusCode: HttpStatus.NOT_FOUND,
                message: 'Subscription not found',
            };
        }

        const today = new Date();
        today.setHours(12, 0, 0, 0); // Set to noon today

        await this.subscriptionService.update(subscription, {
            next_date: today,
            recurring: true, // Ensure recurring is enabled
        });

        return {
            statusCode: HttpStatus.OK,
            message: 'Subscription next_date updated to today for testing',
            data: {
                subscriptionId,
                previousNextDate: subscription.next_date,
                newNextDate: today.toISOString(),
                note: 'Run /admin/cron/recurring-payments/run to process this payment',
            },
        };
    }

    /**
     * Get dashboard summary for admin panel
     */
    @Get('/dashboard')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Get cron dashboard summary for admin panel' })
    async getDashboard() {
        const [
            recurringPreview,
            expiringPreview,
            trialsPreview,
            provisioningPreview,
        ] = await Promise.all([
            this.subscriptionService.findAllActiveTodaysNextBillingDate(),
            this.subscriptionService.findExpiringSoon(7),
            this.subscriptionService.checkTrialExpiry(),
            this.subscriptionService.findPendingProvisioningSubscriptions(),
        ]);

        const totalRecurringAmount = recurringPreview.reduce(
            (sum, sub) => sum + (sub.final_price || 0),
            0
        );

        return {
            statusCode: HttpStatus.OK,
            message: 'Cron dashboard summary',
            data: {
                serverTime: new Date().toISOString(),
                summary: {
                    recurringPaymentsDueToday: {
                        count: recurringPreview.length,
                        totalAmount: totalRecurringAmount,
                        currency: process.env.STRIPE_CURRENCY || 'GBP',
                    },
                    subscriptionsExpiringSoon: {
                        count: expiringPreview.length,
                        withinDays: 7,
                    },
                    expiredTrials: {
                        count: trialsPreview.length,
                    },
                    pendingProvisioning: {
                        count: provisioningPreview.length,
                    },
                },
                cronSchedule: {
                    provisioning: '1:00 AM daily',
                    recurringPayments: '2:00 AM daily',
                    subscriptionCheck: '3:00 AM daily',
                },
                adminEmail: process.env.ADMIN_EMAIL || 'Not configured',
            },
        };
    }

    /**
     * Helper to calculate next run time
     */
    private getNextRunTime(hour: number): string {
        const now = new Date();
        const next = new Date();
        next.setHours(hour, 0, 0, 0);

        if (now >= next) {
            next.setDate(next.getDate() + 1);
        }

        return next.toISOString();
    }
}
