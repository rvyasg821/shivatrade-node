import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';
import { PaymentService } from '@modules/payment/services/payment.service';
import { UserService } from '@modules/user/services/user.service';
import { CompanyService } from '@modules/company/services/company.service';
import { PlanService } from '@modules/plan/services/plan.service';
import { DiscountService } from '@modules/discount/services/discount.service';
import { ICronService } from '../interfaces/cron.interface';
import {
    ENUM_PAYMENT_GATEWAY,
    ENUM_PAYMENT_METHOD,
} from '@modules/payment/repository/entities/payment.entity';
import { EnhancedEmailService } from '@modules/email/services/enhanced-email.service';
import { CardService } from '@modules/card/services/card.service';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';
import { v4 as uuid } from 'uuid';
import { ENUM_DISCOUNT_TYPE } from '@modules/discount/repository/entities/discount.entity';
import { ENUM_USER_INACTIVE_REASON } from '@modules/user/enums/user.enum';

// Currency symbol mapping
const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: '$',
    GBP: '£',
    EUR: '€',
    INR: '₹',
    JPY: '¥',
    AUD: 'A$',
    CAD: 'C$',
};

// Interface for payment result tracking
interface IPaymentResult {
    subscriptionId: string;
    companyName: string;
    customerName: string;
    email: string;
    planName: string;
    amount: number;
    gateway: string;
    success: boolean;
    transactionId?: string;
    errorMessage?: string;
    nextBillingDate?: Date;
}

/**
 * Service for handling subscription-related cron jobs
 */
@Injectable()
export class SubscriptionCronService implements ICronService {
    private readonly logger = new Logger(SubscriptionCronService.name);
    private readonly currencySymbol: string;
    private readonly adminEmail: string;
    private readonly appName: string;

    constructor(
        private readonly subscriptionService: SubscriptionService,
        private readonly paymentService: PaymentService,
        private readonly userService: UserService,
        private readonly companyService: CompanyService,
        private readonly planService: PlanService,
        private readonly discountService: DiscountService,
        private readonly emailService: EnhancedEmailService,
        private readonly cardService: CardService,
        private readonly configService: ConfigService
    ) {
        // Get currency symbol from stripe config
        const currencyCode = this.configService.get<string>('stripe.currency') || 'USD';
        this.currencySymbol = CURRENCY_SYMBOLS[currencyCode.toUpperCase()] || '$';
        // Get admin email from environment
        this.adminEmail = process.env.ADMIN_EMAIL || '';
        this.appName = process.env.APP_NAME || 'ShivaTrade';
    }

    /**
     * Guard: only run cron on the primary instance when running in PM2 cluster mode.
     * PM2 sets NODE_APP_INSTANCE=0 for the first worker, 1 for second, etc.
     * If not in cluster mode, NODE_APP_INSTANCE is undefined — always run.
     * Also respects CRON_ENABLED=false to disable crons entirely.
     */
    private shouldRunCron(): boolean {
        // Single-tenant mode: subscription/billing crons have nothing to do.
        if ((process.env.APP_MODE || 'single') === 'single') {
            this.logger.debug('Subscription cron skipped — single-tenant mode');
            return false;
        }
        if (process.env.CRON_ENABLED === 'false') return false;
        const instance = process.env.NODE_APP_INSTANCE;
        if (instance !== undefined && instance !== '0') return false;
        return true;
    }

    // @Cron(CronExpression.EVERY_30_SECONDS)
    // async testingCron(): Promise<void> {
    //     console.log('Starting testingCron cron job', new Date());
    // }

    @Cron(CronExpression.EVERY_DAY_AT_3AM)
    async checkCustomerSubscription(): Promise<void> {
        if (!this.shouldRunCron()) return;
        console.log('Starting checkCustomerSubscription cron job');

        try {
            // Get subscriptions that are expiring soon (within 7 days)
            const expiringSubscriptions =
                await this.subscriptionService.findExpiringSoon(7);

            console.log(
                `Found ${expiringSubscriptions.length} subscriptions expiring within 7 days`
            );

            for (const subscription of expiringSubscriptions) {
                try {
                    console.warn(
                        `Subscription ${subscription._id} for user ${subscription.user_id} is expiring soon on ${subscription.end_date}`
                    );

                    // Send notification to customer about expiring subscription
                    await this.sendExpiringSubscriptionNotification(
                        subscription
                    );
                } catch (error) {
                    console.error(
                        `Error processing expiring subscription ${subscription._id}: ${error.message}`,
                        error.stack
                    );
                }
            }

            // Check for expired trial subscriptions
            const expiredTrials =
                await this.subscriptionService.checkTrialExpiry();

            console.log(
                `Found ${expiredTrials.length} expired trial subscriptions`
            );

            for (const subscription of expiredTrials) {
                try {
                    console.log(
                        `Processing expired trial subscription ${subscription._id}`
                    );

                    // Deactivate expired trial subscription
                    await this.handleExpiredTrialSubscription(subscription);
                } catch (error) {
                    console.error(
                        `Error processing expired trial subscription ${subscription._id}: ${error.message}`,
                        error.stack
                    );
                }
            }

            console.log(
                `Completed checkCustomerSubscription cron job. Processed ${expiringSubscriptions.length} expiring and ${expiredTrials.length} expired trial subscriptions.`
            );

            // Send admin summary email
            await this.sendAdminCronSummaryEmail(
                'Subscription Check',
                expiringSubscriptions.length + expiredTrials.length,
                expiringSubscriptions.length, // Send reminders is considered "success"
                0, // No failures in this context
                undefined,
                await this.formatExpiringSubscriptionsForEmail(expiringSubscriptions),
                await this.formatExpiredTrialsForEmail(expiredTrials)
            );
        } catch (error) {
            console.error(
                `Error in checkCustomerSubscription cron job: ${error.message}`,
                error.stack
            );
            // Send admin error notification
            await this.sendAdminCronErrorEmail('Subscription Check', error.message);
        }
    }

    @Cron(CronExpression.EVERY_DAY_AT_2AM)
    async deductCustomerRecurringCharge(): Promise<void> {
        if (!this.shouldRunCron()) return;
        const startTime = Date.now();
        console.log('Starting deductCustomerRecurringCharge cron job');

        const paymentResults: IPaymentResult[] = [];
        let totalAmount = 0;

        try {
            // Get all active recurring subscriptions
            const subscriptions =
                await this.subscriptionService.findAllActiveTodaysNextBillingDate();

            console.log(
                `Found ${subscriptions.length} recurring subscriptions for processing`
            );

            let processedCount = 0;
            let successCount = 0;
            let failedCount = 0;

            for (const subscription of subscriptions) {
                const paymentResult: IPaymentResult = {
                    subscriptionId: subscription._id.toString(),
                    companyName: '',
                    customerName: '',
                    email: '',
                    planName: subscription.plan_name || '',
                    amount: subscription.final_price || 0,
                    gateway: '',
                    success: false,
                };

                try {
                    // Get user and company info for tracking
                    const user = await this.userService.findOneById(subscription.user_id?.toString());
                    const company = await this.companyService.findOneById(subscription.company_id?.toString());

                    paymentResult.companyName = company?.company_name || '';
                    paymentResult.customerName = user?.name || '';
                    paymentResult.email = user?.email || '';

                    // Check if it's time to charge the customer (next_date has passed)
                    console.log(
                        `Processing payment for subscription ${subscription._id}`
                    );
                    processedCount++;

                    // Get user's card to determine gateway (PayPal or Stripe)
                    const card = await this.cardService.findOneSort({
                        user_id: subscription.user_id.toString(),
                    });

                    if (!card) {
                        throw new Error('No saved card found for recurring payment');
                    }

                    const gateway = card.gateway?.toLowerCase() || 'paypal';
                    paymentResult.gateway = gateway.toUpperCase();

                    // Prepare payment data based on subscription details
                    // Use TAX_VALUE from env for recurring payments (not stored subscription tax)
                    const envTaxRate = this.configService.get<number>('TAX_VALUE') || 0;
                    const subtotal = (subscription.plan_price || subscription.platform_price || 0) + (subscription.tools_price || 0);

                    // Check if discount should be applied for this recurring payment
                    let discountPrice = 0;
                    let shouldApplyDiscount = false;

                    if (subscription.discount_id && subscription.discount_code) {
                        try {
                            // Get the discount applied record for this subscription
                            const discountApplied = await this.discountService.getDiscountAppliedBySubscription(
                                subscription._id.toString()
                            );

                            if (discountApplied && !discountApplied.is_exhausted) {
                                // Get the discount details
                                const discount = await this.discountService.findOneById(
                                    discountApplied.discount_id.toString()
                                );

                                if (discount) {
                                    // Process recurring discount (updates remaining_months, etc.)
                                    const result = await this.discountService.processRecurringDiscount(
                                        discountApplied,
                                        discount
                                    );

                                    shouldApplyDiscount = result.shouldApply;

                                    if (shouldApplyDiscount) {
                                        // Calculate discount amount
                                        if (discount.discount_type === ENUM_DISCOUNT_TYPE.PERCENTAGE) {
                                            discountPrice = (subtotal * discount.discount_value) / 100;
                                        } else {
                                            discountPrice = discount.discount_value;
                                        }
                                        // Cap discount at subtotal
                                        if (discountPrice > subtotal) {
                                            discountPrice = subtotal;
                                        }
                                        discountPrice = Number(discountPrice.toFixed(2));
                                        console.log(
                                            `💸 Applying discount for recurring payment: ${discount.discount_code} = ${discountPrice} (remaining months: ${result.discountApplied.remaining_months})`
                                        );
                                    } else {
                                        console.log(
                                            `⏹️ Discount exhausted for subscription ${subscription._id}, no discount applied`
                                        );
                                    }
                                }
                            }
                        } catch (discountError) {
                            console.error(
                                `Error processing discount for subscription ${subscription._id}: ${discountError.message}`
                            );
                            // Continue without discount if error
                        }
                    }

                    const total = subtotal - discountPrice;
                    const calculatedTaxValue = envTaxRate > 0 ? (total * envTaxRate) / 100 : 0;
                    const calculatedFinalPrice = total + calculatedTaxValue;

                    // Get discount duration info for payment record
                    let discountDurationType = null;
                    let discountDurationMonths = null;
                    let discountRemainingMonths = null;
                    let discountName = null;

                    if (shouldApplyDiscount && subscription.discount_id) {
                        try {
                            const discountApplied = await this.discountService.getDiscountAppliedBySubscription(
                                subscription._id.toString()
                            );
                            const discount = await this.discountService.findOneById(
                                subscription.discount_id.toString()
                            );
                            if (discount) {
                                discountDurationType = discount.duration_type || null;
                                discountDurationMonths = discount.duration_months || null;
                                discountRemainingMonths = discountApplied?.remaining_months || null;
                                discountName = discount.name || discount.discount_code || null;
                            }
                        } catch (err) {
                            console.error('Error fetching discount duration info:', err.message);
                        }
                    }

                    const paymentData = {
                        user_id: subscription.user_id.toString(),
                        _id: uuid(),
                        company_id: subscription.company_id.toString(),
                        plan_id: subscription.plan_id.toString(),
                        subscription_id: subscription._id.toString(),
                        price: subscription.platform_price || subscription.plan_price || 0,
                        plan_price: subscription.plan_price || subscription.platform_price || 0,
                        tools_price: subscription.tools_price || 0,
                        total_price: subtotal,
                        total: total,
                        discount_price: discountPrice,
                        discount_code: shouldApplyDiscount ? subscription.discount_code : null,
                        discount_id: shouldApplyDiscount ? subscription.discount_id : null,
                        discount_duration_type: discountDurationType,
                        discount_duration_months: discountDurationMonths,
                        discount_remaining_months: discountRemainingMonths,
                        discount_name: discountName,
                        final_price: calculatedFinalPrice,
                        tax_value: calculatedTaxValue,
                        gateway: gateway === 'stripe' ? ENUM_PAYMENT_GATEWAY.STRIPE : ENUM_PAYMENT_GATEWAY.PAYPAL,
                        method: ENUM_PAYMENT_METHOD.CARD,
                        tools: subscription.tools || [],
                        recurring: subscription.recurring,
                        currency: this.configService.get<string>('stripe.currency') || 'USD',
                    };

                    // Update payment result amount to reflect actual charge (with discount if applied)
                    paymentResult.amount = calculatedFinalPrice;

                    console.log(`💰 Recurring payment pricing: subtotal=${subtotal}, discount=${discountPrice}, total=${total}, taxRate=${envTaxRate}%, tax=${calculatedTaxValue}, final=${calculatedFinalPrice}`);

                    let paymentResponse: any;

                    try {
                        // Process payment based on gateway
                        if (gateway === 'stripe') {
                            paymentResponse = await this.paymentService.processStripeCardTokenPayment(paymentData);
                        } else {
                            paymentResponse = await this.paymentService.processPayPalCardTokenPayment(paymentData);
                        }

                        if (
                            paymentResponse &&
                            (paymentResponse.status === 'completed' || paymentResponse.status === 'succeeded')
                        ) {
                            console.log(
                                `Successfully charged customer for subscription ${subscription._id} via ${gateway.toUpperCase()}`
                            );
                            successCount++;
                            paymentResult.success = true;
                            paymentResult.transactionId = paymentResponse.transaction_id || paymentResponse.payment_intent_id || '';
                            totalAmount += paymentResult.amount;

                            // Calculate next payment date based on plan duration
                            const nextPaymentDate =
                                this.calculateNextPaymentDate(subscription);
                            paymentResult.nextBillingDate = nextPaymentDate;

                            // Update subscription with next payment date
                            await this.subscriptionService.update(
                                subscription,
                                {
                                    next_date: nextPaymentDate,
                                    status: true,
                                }
                            );

                            // Reactivate users who were deactivated due to subscription expiry
                            try {
                                const renewedCompany = await this.companyService.findOneById(subscription.company_id?.toString());
                                if (renewedCompany) {
                                    await this.userService.reactivateCompanyUsers(
                                        String(renewedCompany._id),
                                        ENUM_USER_INACTIVE_REASON.SUBSCRIPTION_EXPIRED
                                    );
                                }
                            } catch (reactivateErr) {
                                this.logger.error('Failed to reactivate users on renewal:', reactivateErr);
                            }

                            // Sync to appointment app for renewal (async, non-blocking)
                            this.dispatchAppointmentSyncForRenewal(subscription).catch(err =>
                                this.logger.error('Failed to dispatch renewal sync:', err)
                            );

                            // Send customer notification
                            try {
                                await this.sendPaymentChargedSubscriptionNotification(subscription);
                            } catch (error) { }

                            // Send admin notification for successful payment
                            await this.sendAdminPaymentNotification(paymentResult, nextPaymentDate);

                            // Generate and send invoice for recurring payment
                            const recurringPaymentId = paymentResponse?.payment?._id?.toString() || paymentResponse?.payment_id;
                            if (recurringPaymentId) {
                                this.paymentService.generateRecurringInvoice(recurringPaymentId, subscription).catch(err =>
                                    this.logger.error(`Failed to generate recurring invoice: ${err.message}`)
                                );
                            }

                        } else {
                            const errorMsg = paymentResponse?.message || 'Unknown error';
                            console.error(
                                `Failed to charge customer for subscription ${subscription._id}: ${errorMsg}`
                            );
                            failedCount++;
                            paymentResult.errorMessage = errorMsg;

                            // Handle failed payment Notification - possibly notify customer or suspend service
                            await this.subscriptionService.update(
                                subscription,
                                {
                                    status: false,
                                }
                            );

                            // Deactivate company users (except Company Admin) on payment failure
                            try {
                                const failedCompany = await this.companyService.findOneById(subscription.company_id?.toString());
                                if (failedCompany) {
                                    await this.userService.deactivateCompanyUsers(
                                        String(failedCompany._id),
                                        ENUM_USER_INACTIVE_REASON.SUBSCRIPTION_EXPIRED,
                                        true,
                                        subscription.user_id?.toString()
                                    );
                                }
                            } catch (deactivateErr) {
                                this.logger.error('Failed to deactivate users on payment failure:', deactivateErr);
                            }

                            // Sync deactivation to appointment app (async, non-blocking)
                            this.dispatchAppointmentSyncForDeactivation(subscription).catch(err =>
                                this.logger.error('Failed to dispatch deactivation sync:', err)
                            );

                            await this.sendPaymentFailedForSubscriptionNotification(subscription);

                            // Send admin notification for failed payment
                            await this.sendAdminPaymentNotification(paymentResult);
                        }
                    } catch (paymentError) {
                        console.error(
                            `Payment processing failed for subscription ${subscription._id}: ${paymentError.message}`
                        );
                        failedCount++;
                        paymentResult.errorMessage = paymentError.message;

                        await this.subscriptionService.update(subscription, {
                            status: false,
                        });

                        // Deactivate company users (except Company Admin) on payment error
                        try {
                            const errorCompany = await this.companyService.findOneById(subscription.company_id?.toString());
                            if (errorCompany) {
                                await this.userService.deactivateCompanyUsers(
                                    String(errorCompany._id),
                                    ENUM_USER_INACTIVE_REASON.SUBSCRIPTION_EXPIRED,
                                    true,
                                    subscription.user_id?.toString()
                                );
                            }
                        } catch (deactivateErr) {
                            this.logger.error('Failed to deactivate users on payment error:', deactivateErr);
                        }

                        // Sync deactivation to appointment app (async, non-blocking)
                        this.dispatchAppointmentSyncForDeactivation(subscription).catch(err =>
                            this.logger.error('Failed to dispatch deactivation sync:', err)
                        );

                        await this.sendPaymentFailedForSubscriptionNotification(subscription);

                        // Send admin notification for failed payment
                        await this.sendAdminPaymentNotification(paymentResult);
                    }
                } catch (error) {
                    console.error(
                        `Error processing payment for subscription ${subscription._id}: ${error.message}`,
                        error.stack
                    );
                    failedCount++;
                    paymentResult.errorMessage = error.message;

                    await this.subscriptionService.update(subscription, {
                        status: false,
                    });

                    // Sync deactivation to appointment app (async, non-blocking)
                    this.dispatchAppointmentSyncForDeactivation(subscription).catch(err =>
                        this.logger.error('Failed to dispatch deactivation sync:', err)
                    );

                    await this.sendPaymentFailedForSubscriptionNotification(
                        subscription
                    );
                }

                // Add to results for summary
                paymentResults.push(paymentResult);
            }

            const duration = `${((Date.now() - startTime) / 1000).toFixed(2)}s`;
            console.log(
                `Completed deductCustomerRecurringCharge cron job. ` +
                `Processed: ${processedCount}, Success: ${successCount}, Failed: ${failedCount} ` +
                `out of ${subscriptions.length} subscriptions. Duration: ${duration}`
            );

            // Send admin summary email
            await this.sendAdminRecurringPaymentSummary(
                processedCount,
                successCount,
                failedCount,
                totalAmount,
                paymentResults,
                duration
            );
        } catch (error) {
            console.error(
                `Error in deductCustomerRecurringCharge cron job: ${error.message}`,
                error.stack
            );
            // Send admin error notification
            await this.sendAdminCronErrorEmail('Recurring Payment Processing', error.message);
        }
    }

    @Cron(CronExpression.EVERY_DAY_AT_1AM)
    async checkAndStartNewCustomerPlan(): Promise<void> {
        if (!this.shouldRunCron()) return;
        console.log('Starting checkAndStartNewCustomerPlan cron job');

        try {
            // Get all pending provisioning subscriptions
            const pendingSubscriptions =
                await this.subscriptionService.findPendingProvisioningSubscriptions();

            console.log(
                `Found ${pendingSubscriptions.length} pending subscriptions for processing`
            );

            let processedCount = 0;

            for (const subscription of pendingSubscriptions) {
                if (subscription.trial || subscription.is_lifetime || !subscription.status) {
                    continue;
                }
                try {
                    console.log(
                        `Processing pending subscription ${subscription._id} with provisioning status: ${subscription.provisioningStatus}`
                    );

                    // Process pending subscriptions based on their current state
                    switch (subscription.provisioningStatus) {
                        case 'pending':
                            console.log(
                                `Subscription ${subscription._id} is pending provisioning`
                            );
                            // Attempt to provision the subscription
                            await this.provisionSubscriptionTools(subscription);
                            processedCount++;
                            break;

                        case 'failed':
                            console.log(
                                `Subscription ${subscription._id} has failed provisioning`
                            );
                            // Attempt to retry provisioning
                            await this.retrySubscriptionProvisioning(
                                subscription
                            );
                            processedCount++;
                            break;

                        default:
                            console.log(
                                `Subscription ${subscription._id} has unknown provisioning status: ${subscription.provisioningStatus}`
                            );
                    }
                } catch (error) {
                    console.error(
                        `Error processing subscription ${subscription._id}: ${error.message}`,
                        error.stack
                    );
                }
            }

            console.log(
                `Completed checkAndStartNewCustomerPlan cron job. Processed ${processedCount} subscriptions out of ${pendingSubscriptions.length} pending subscriptions.`
            );

            // Send admin summary email (only if there were pending subscriptions)
            if (pendingSubscriptions.length > 0) {
                await this.sendAdminCronSummaryEmail(
                    'Plan Provisioning',
                    pendingSubscriptions.length,
                    processedCount,
                    pendingSubscriptions.length - processedCount
                );
            }
        } catch (error) {
            console.error(
                `Error in checkAndStartNewCustomerPlan cron job: ${error.message}`,
                error.stack
            );
            // Send admin error notification
            await this.sendAdminCronErrorEmail('Plan Provisioning', error.message);
        }
    }

    private async provisionSubscriptionTools(subscription: any): Promise<void> {
        try {
            // Update provisioning status to provisioning
            await this.subscriptionService.updateSubscriptionProvisioningStatus(
                subscription._id.toString(),
                'provisioning'
            );

            // tool provisioning
            console.log(
                `PROVISIONING: Tools would be provisioned for subscription ${subscription._id}`
            );

            await this.subscriptionService.update(
                subscription,
                {
                    status: true
                }
            );

            // Update provisioning status to provisioned
            await this.subscriptionService.updateSubscriptionProvisioningStatus(
                subscription._id.toString(),
                'provisioned'
            );

            console.log(
                `Successfully provisioned tools for subscription ${subscription._id}`
            );
        } catch (error) {
            // Update provisioning status to failed
            await this.subscriptionService.updateSubscriptionProvisioningStatus(
                subscription._id.toString(),
                'failed',
                error.message || 'Tool provisioning failed'
            );

            console.error(
                `Tool provisioning failed for subscription ${subscription._id}: ${error.message}`
            );
        }
    }

    private async retrySubscriptionProvisioning(
        subscription: any
    ): Promise<void> {
        try {
            // Use the existing retry method from subscription service
            await this.subscriptionService.retryProvisioningForSubscription(
                subscription._id.toString()
            );

            // Attempt to provision tools again
            await this.provisionSubscriptionTools(subscription);

            console.log(
                `Retry provisioning initiated for subscription ${subscription._id}`
            );
        } catch (error) {
            console.error(
                `Failed to retry provisioning for subscription ${subscription._id}: ${error.message}`
            );
        }
    }

    private async sendExpiringSubscriptionNotification(
        subscription: any
    ): Promise<void> {
        try {
            // Get user details
            const user = await this.userService.findOneById(
                subscription.user_id.toString()
            );
            if (!user) {
                console.warn(
                    `User not found for subscription ${subscription._id}`
                );
                return;
            }
            const plan = await this.planService.findOneById(
                subscription.plan_id.toString()
            );
            if (!plan) {
                console.warn(
                    `Plan not found for subscription ${subscription._id}`
                );
                return;
            }
            const lastCard = await this.cardService.findOne(
                {
                    user_id: subscription.user_id.toString(),
                },
                {
                    order: {
                        createdAt: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC,
                    },
                }
            );
            if (!lastCard) {
                console.warn(
                    `Card not found for subscription ${subscription._id}`
                );
                return;
            }

            try {
                const to = user.email;
                const name = user.name;
                const subject = 'Subscription Payment Reminder!';
                const templateFile = 'recurring_payment_reminder.hjs';
                const templateData = {
                    name: name,
                    email: to,
                    next_date: subscription.next_date,
                    days_left: 18,
                    plan_name: plan.name,
                    plan_type: plan.duration_type,
                    plan_price: `${this.currencySymbol}${plan.location_pricing?.[0]?.special_price || plan.location_pricing?.[0]?.price || 0}`,
                    card_last4: `**** **** **** ${lastCard.last4}`,
                    gateway: lastCard.gateway,
                    domain: `${process.env.FRONT_URL || 'http://localhost:3000'}/login`,
                };

                await this.emailService.sendEmailWithProvider(
                    to,
                    name,
                    subject,
                    templateFile,
                    templateData,
                    undefined,
                    undefined,
                    undefined,
                    subscription.company_id?.toString(),
                );
            } catch (error) {
                console.error(
                    `Failed to send expiring subscription notification: ${error.message}`
                );
            }
        } catch (error) {
            console.error(
                `Failed to send expiring subscription notification: ${error.message}`
            );
        }
    }

    private async sendPaymentChargedSubscriptionNotification(
        subscription: any
    ): Promise<void> {
        try {
            // Get user details
            const user = await this.userService.findOneById(
                subscription.user_id.toString()
            );
            if (!user) {
                console.warn(
                    `User not found for subscription ${subscription._id}`
                );
                return;
            }
            const payment = await this.paymentService.findOne(
                {
                    subscription_id: subscription._id.toString(),
                },
                {
                    order: {
                        createdAt: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC,
                    },
                }
            );
            if (!payment) {
                console.warn(
                    `Payment not found for subscription ${subscription._id}`
                );
                return;
            }
            try {
                const to = user.email;
                const name = user.name;
                const subject = `Subscription recurring  ${payment.postDateTime}`;
                const templateFile = 'customer_subscription_recurring.hjs';
                const templateData = {
                    name: name,
                    email: to,
                    transation_id: payment._id?.toString(),
                    method: payment.method,
                    gateway: payment.gateway,
                    postDateTime: payment.postDateTime,
                    status: 'Successful',
                    next_date: subscription.next_date,
                    content:
                        `Thank you for your payment! Your subscription has been successfully renewed and your account remains active. You can view your invoices and manage your billing details by logging into your <a href='${process.env.FRONT_URL || 'http://localhost:3000'}/login' style='color:#008ecc; text-decoration:none; font-weight:600;'>ShivaTrade dashboard</a>.`,
                };

                await this.emailService.sendEmailWithProvider(
                    to,
                    name,
                    subject,
                    templateFile,
                    templateData,
                    undefined,
                    undefined,
                    undefined,
                    subscription.company_id?.toString(),
                );
            } catch (error) { }
        } catch (error) {
            console.error(
                `Failed to send expiring subscription notification: ${error.message}`
            );
        }
    }

    private async sendPaymentFailedForSubscriptionNotification(
        subscription: any
    ): Promise<void> {
        try {
            // Get user details
            const user = await this.userService.findOneById(
                subscription.user_id.toString()
            );
            if (!user) {
                console.warn(
                    `User not found for subscription ${subscription._id}`
                );
                return;
            }
            try {
                const to = user.email;
                const name = user.name;
                const subject = 'Subscription Ended - Payment Issue!';
                const templateFile = 'payment_failed.hjs';
                const templateData = {
                    name: name,
                };

                await this.emailService.sendEmailWithProvider(
                    to,
                    name,
                    subject,
                    templateFile,
                    templateData,
                    undefined,
                    undefined,
                    undefined,
                    subscription.company_id?.toString(),
                );
            } catch (error) { }
        } catch (error) {
            console.error(
                `Failed to send expiring subscription notification: ${error.message}`
            );
        }
    }

    private async handleExpiredTrialSubscription(
        subscription: any
    ): Promise<void> {
        try {
            // Deactivate the subscription
            await this.subscriptionService.updateStatus(subscription, false);

            // Sync deactivation to appointment app (async, non-blocking)
            this.dispatchAppointmentSyncForDeactivation(subscription).catch(err =>
                this.logger.error('Failed to dispatch deactivation sync for expired trial:', err)
            );

            // Get user details
            const user = await this.userService.findOneById(
                subscription.user_id.toString()
            );
            if (!user) {
                console.warn(
                    `User not found for subscription ${subscription._id}`
                );
                return;
            }

            // Deactivate company users (except Company Admin who can still renew)
            try {
                const company = await this.companyService.findOneByUserId(subscription.user_id);
                if (company) {
                    await this.userService.deactivateCompanyUsers(
                        String(company._id),
                        ENUM_USER_INACTIVE_REASON.SUBSCRIPTION_EXPIRED,
                        true, // exclude Company Admin
                        subscription.user_id.toString()
                    );
                    console.log(`Deactivated company users for expired trial, companyId: ${company._id}`);
                }
            } catch (deactivateError) {
                console.error(`Failed to deactivate company users for expired trial: ${deactivateError.message}`);
            }

            try {
                const to = user.email;
                const name = user.name;
                const subject = 'Your subscription has expired!';
                const templateFile = 'customer_subscription_expired.hjs';
                const templateData = {
                    name: name,
                    email: to,
                };

                await this.emailService.sendEmailWithProvider(
                    to,
                    name,
                    subject,
                    templateFile,
                    templateData,
                    undefined,
                    undefined,
                    undefined,
                    subscription.company_id?.toString(),
                );
            } catch (error) { }

            console.log(
                `Deactivated expired trial subscription ${subscription._id}`
            );
        } catch (error) {
            console.error(
                `Failed to handle expired trial subscription: ${error.message}`
            );
        }
    }

    private calculateNextPaymentDate(subscription: any): Date {
        const nextDate = new Date();

        // plan_type_value typically stores the duration in days (e.g., 30 for monthly, 365 for yearly)
        // For billing purposes, we add 1 period based on plan_type, not the raw day value
        const planTypeValue = subscription.plan_type_value || 1;

        // If we have plan type, use it to calculate next payment date
        if (subscription.plan_type) {
            const planType = subscription.plan_type.toUpperCase();

            switch (planType) {
                case 'DAILY':
                case 'DAY':
                    // For daily plans, use the value as number of days
                    nextDate.setDate(nextDate.getDate() + (planTypeValue > 0 && planTypeValue <= 31 ? planTypeValue : 1));
                    break;
                case 'WEEKLY':
                case 'WEEK':
                    // For weekly plans, add 1 week (7 days)
                    nextDate.setDate(nextDate.getDate() + 7);
                    break;
                case 'MONTHLY':
                case 'MONTH':
                    // For monthly plans, always add 1 month regardless of plan_type_value (which stores days like 30)
                    nextDate.setMonth(nextDate.getMonth() + 1);
                    break;
                case 'YEARLY':
                case 'YEAR':
                    // For yearly plans, always add 1 year regardless of plan_type_value (which stores days like 365)
                    nextDate.setFullYear(nextDate.getFullYear() + 1);
                    break;
                default:
                    // Default to monthly if plan type is not recognized
                    console.warn(`Unknown plan_type: ${subscription.plan_type}, defaulting to monthly`);
                    nextDate.setMonth(nextDate.getMonth() + 1);
            }

            console.log(`📅 Next billing date calculated: ${nextDate.toISOString()} (plan_type: ${planType})`);
        } else {
            // Default to monthly if no plan type information is available
            nextDate.setMonth(nextDate.getMonth() + 1);
        }

        return nextDate;
    }

    /**
     * Dispatch sync to appointment app for subscription renewal
     */
    private async dispatchAppointmentSyncForRenewal(subscription: any): Promise<void> {
        try {
            const company = await this.companyService.findOneById(subscription.company_id?.toString());
            const user = await this.userService.findOneById(subscription.user_id?.toString());
            const plan = await this.planService.findOneById(subscription.plan_id?.toString());

            if (!company || !user) {
                this.logger.warn('Missing company or user for subscription renewal sync');
                return;
            }

            const companyData = {
                _id: company._id?.toString(),
                company_name: company.company_name || '',
                contact_name: company.contact_name || '',
                email: company.email || user.email || '',
                mobile: company.mobile || '',
                website: company.website || '',
                country: company.country || '',
                selected_country: company.selected_country || company.country || '',
                country_code: company.country_code || null,
                currency: company.currency || 'USD',
                timezone: company.timezone || 'UTC',
                status: company.status,
            };

            const userData = {
                _id: user._id?.toString(),
                name: user.name || '',
                email: user.email || '',
                mobile: user.mobile || '',
            };

            const subscriptionSyncData = {
                _id: subscription._id?.toString(),
                user_id: user._id?.toString() || '',
                company_id: company._id?.toString() || '',
                plan_id: plan?._id?.toString() || '',
                plan_name: plan?.name || '',
                plan_type: subscription.plan_type || 'monthly',
                locations: subscription.locations || 1,
                plan_price: subscription.plan_price || 0,
                tools_price: subscription.tools_price || 0,
                subtotal: subscription.subtotal || 0,
                discount_price: subscription.discount_price || 0,
                tax_price: subscription.tax_price || 0,
                final_price: subscription.final_price || 0,
                tools: subscription.tools || [],
                start_date: subscription.start_date,
                end_date: subscription.end_date,
                status: true, // Renewed - active
                trial: subscription.trial || false,
                trial_days: subscription.trial_days || 0,
                is_lifetime: subscription.is_lifetime || false,
            };

            this.logger.log(`✅ Subscription renewed successfully: ${subscription._id}`);
        } catch (error) {
            this.logger.error(`Failed to process subscription renewal: ${error.message}`);
        }
    }

    /**
     * Dispatch sync to appointment app for subscription cancellation/deactivation
     */
    private async dispatchAppointmentSyncForDeactivation(subscription: any): Promise<void> {
        try {
            const company = await this.companyService.findOneById(subscription.company_id?.toString());
            const user = await this.userService.findOneById(subscription.user_id?.toString());
            const plan = await this.planService.findOneById(subscription.plan_id?.toString());

            if (!company || !user) {
                this.logger.warn('Missing company or user for subscription deactivation sync');
                return;
            }

            const companyData = {
                _id: company._id?.toString(),
                company_name: company.company_name || '',
                contact_name: company.contact_name || '',
                email: company.email || user.email || '',
                mobile: company.mobile || '',
                website: company.website || '',
                country: company.country || '',
                selected_country: company.selected_country || company.country || '',
                country_code: company.country_code || null,
                currency: company.currency || 'USD',
                timezone: company.timezone || 'UTC',
                status: company.status,
            };

            const userData = {
                _id: user._id?.toString(),
                name: user.name || '',
                email: user.email || '',
                mobile: user.mobile || '',
            };

            const subscriptionSyncData = {
                _id: subscription._id?.toString(),
                user_id: user._id?.toString() || '',
                company_id: company._id?.toString() || '',
                plan_id: plan?._id?.toString() || '',
                plan_name: plan?.name || '',
                plan_type: subscription.plan_type || 'monthly',
                locations: subscription.locations || 1,
                plan_price: subscription.plan_price || 0,
                tools_price: subscription.tools_price || 0,
                subtotal: subscription.subtotal || 0,
                discount_price: subscription.discount_price || 0,
                tax_price: subscription.tax_price || 0,
                final_price: subscription.final_price || 0,
                tools: subscription.tools || [],
                start_date: subscription.start_date,
                end_date: subscription.end_date,
                status: false, // Deactivated
                trial: subscription.trial || false,
                trial_days: subscription.trial_days || 0,
                is_lifetime: subscription.is_lifetime || false,
            };

            this.logger.log(`✅ Subscription deactivated successfully: ${subscription._id}`);
        } catch (error) {
            this.logger.error(`Failed to process subscription deactivation: ${error.message}`);
        }
    }

    /**
     * Send admin summary email for cron job completion
     */
    private async sendAdminCronSummaryEmail(
        cronJobName: string,
        totalProcessed: number,
        successCount: number,
        failedCount: number,
        payments?: IPaymentResult[],
        expiringSubscriptions?: any[],
        expiredTrials?: any[]
    ): Promise<void> {
        if (!this.adminEmail) {
            this.logger.warn('ADMIN_EMAIL not configured, skipping admin notification');
            return;
        }

        try {
            const templateData = {
                cronJobName,
                cronJobIcon: this.getCronJobIcon(cronJobName),
                executionTime: new Date().toISOString(),
                totalProcessed,
                successCount,
                failedCount,
                hasFailures: failedCount > 0,
                summaryBoxClass: failedCount > 0 ? 'warning-box' : 'success-box',
                payments: payments?.slice(0, 20), // Limit to 20 for email
                expiringSubscriptions: expiringSubscriptions?.slice(0, 20),
                expiringCount: expiringSubscriptions?.length || 0,
                expiredTrials: expiredTrials?.slice(0, 20),
                expiredTrialsCount: expiredTrials?.length || 0,
                currencySymbol: this.currencySymbol,
                appName: this.appName,
                logo: process.env.FRONT_LOGO_URL || '',
                frontUrl: process.env.FRONT_URL || 'https://app.shivatrade.com',
            };

            await this.emailService.sendEmailWithProvider(
                this.adminEmail,
                'Admin',
                `[${this.appName}] ${cronJobName} Cron Job Report - ${new Date().toLocaleDateString()}`,
                'admin-cron-summary.hjs',
                templateData
            );

            this.logger.log(`Admin cron summary email sent to ${this.adminEmail}`);
        } catch (error) {
            this.logger.error(`Failed to send admin cron summary email: ${error.message}`);
        }
    }

    /**
     * Send admin summary email for recurring payment processing
     */
    private async sendAdminRecurringPaymentSummary(
        processedCount: number,
        successCount: number,
        failedCount: number,
        totalAmount: number,
        paymentResults: IPaymentResult[],
        duration: string
    ): Promise<void> {
        if (!this.adminEmail) {
            this.logger.warn('ADMIN_EMAIL not configured, skipping admin notification');
            return;
        }

        try {
            const templateData = {
                cronJobName: 'Recurring Payment Processing',
                cronJobIcon: '💳',
                executionTime: new Date().toISOString(),
                totalProcessed: processedCount,
                successCount,
                failedCount,
                hasFailures: failedCount > 0,
                summaryBoxClass: failedCount > 0 ? 'warning-box' : 'success-box',
                totalAmount: totalAmount.toFixed(2),
                duration,
                payments: paymentResults.slice(0, 50), // Limit to 50 for email
                currencySymbol: this.currencySymbol,
                appName: this.appName,
                logo: process.env.FRONT_LOGO_URL || '',
                frontUrl: process.env.FRONT_URL || 'https://app.shivatrade.com',
            };

            await this.emailService.sendEmailWithProvider(
                this.adminEmail,
                'Admin',
                `[${this.appName}] Recurring Payments Report - ${successCount} Success, ${failedCount} Failed - ${new Date().toLocaleDateString()}`,
                'admin-cron-summary.hjs',
                templateData
            );

            this.logger.log(`Admin recurring payment summary email sent to ${this.adminEmail}`);
        } catch (error) {
            this.logger.error(`Failed to send admin recurring payment summary email: ${error.message}`);
        }
    }

    /**
     * Send admin notification for individual payment (success or failure)
     */
    private async sendAdminPaymentNotification(
        paymentResult: IPaymentResult,
        nextBillingDate?: Date
    ): Promise<void> {
        if (!this.adminEmail) {
            return;
        }

        try {
            const templateData = {
                success: paymentResult.success,
                companyName: paymentResult.companyName,
                customerName: paymentResult.customerName,
                customerEmail: paymentResult.email,
                planName: paymentResult.planName,
                amount: paymentResult.amount.toFixed(2),
                gateway: paymentResult.gateway,
                transactionId: paymentResult.transactionId || '',
                nextBillingDate: nextBillingDate ? nextBillingDate.toLocaleDateString() : '',
                errorMessage: paymentResult.errorMessage || '',
                processedAt: new Date().toISOString(),
                currencySymbol: this.currencySymbol,
                appName: this.appName,
                logo: process.env.FRONT_LOGO_URL || '',
                frontUrl: process.env.FRONT_URL || 'https://app.shivatrade.com',
            };

            const subject = paymentResult.success
                ? `[${this.appName}] ${this.currencySymbol}${paymentResult.amount.toFixed(2)} Payment Captured - ${paymentResult.companyName}`
                : `[${this.appName}] Payment Failed - ${paymentResult.companyName}`;

            await this.emailService.sendEmailWithProvider(
                this.adminEmail,
                'Admin',
                subject,
                'admin-recurring-payment.hjs',
                templateData
            );

            this.logger.log(`Admin payment notification sent for subscription ${paymentResult.subscriptionId}`);
        } catch (error) {
            this.logger.error(`Failed to send admin payment notification: ${error.message}`);
        }
    }

    /**
     * Send admin error notification for cron job failure
     */
    private async sendAdminCronErrorEmail(cronJobName: string, errorMessage: string): Promise<void> {
        if (!this.adminEmail) {
            return;
        }

        try {
            const templateData = {
                cronJobName,
                cronJobIcon: '❌',
                executionTime: new Date().toISOString(),
                totalProcessed: 0,
                successCount: 0,
                failedCount: 1,
                hasFailures: true,
                summaryBoxClass: 'error-box',
                errors: [{ subscriptionId: 'CRON_JOB', message: errorMessage }],
                errorsCount: 1,
                currencySymbol: this.currencySymbol,
                appName: this.appName,
                logo: process.env.FRONT_LOGO_URL || '',
                frontUrl: process.env.FRONT_URL || 'https://app.shivatrade.com',
            };

            await this.emailService.sendEmailWithProvider(
                this.adminEmail,
                'Admin',
                `[${this.appName}] CRON ERROR: ${cronJobName} Failed - ${new Date().toLocaleDateString()}`,
                'admin-cron-summary.hjs',
                templateData
            );

            this.logger.log(`Admin cron error email sent for ${cronJobName}`);
        } catch (error) {
            this.logger.error(`Failed to send admin cron error email: ${error.message}`);
        }
    }

    /**
     * Format expiring subscriptions data for email
     */
    private async formatExpiringSubscriptionsForEmail(subscriptions: any[]): Promise<any[]> {
        const formatted = [];
        for (const sub of subscriptions) {
            try {
                const user = await this.userService.findOneById(sub.user_id?.toString());
                const company = await this.companyService.findOneById(sub.company_id?.toString());
                formatted.push({
                    companyName: company?.company_name || 'N/A',
                    email: user?.email || 'N/A',
                    planName: sub.plan_name || 'N/A',
                    expiryDate: sub.next_date ? new Date(sub.next_date).toLocaleDateString() : 'N/A',
                });
            } catch (error) {
                formatted.push({
                    companyName: 'Error loading',
                    email: 'Error loading',
                    planName: sub.plan_name || 'N/A',
                    expiryDate: 'N/A',
                });
            }
        }
        return formatted;
    }

    /**
     * Format expired trials data for email
     */
    private async formatExpiredTrialsForEmail(subscriptions: any[]): Promise<any[]> {
        const formatted = [];
        for (const sub of subscriptions) {
            try {
                const user = await this.userService.findOneById(sub.user_id?.toString());
                const company = await this.companyService.findOneById(sub.company_id?.toString());
                formatted.push({
                    companyName: company?.company_name || 'N/A',
                    email: user?.email || 'N/A',
                    planName: sub.plan_name || 'N/A',
                    expiredDate: sub.end_date ? new Date(sub.end_date).toLocaleDateString() : 'N/A',
                });
            } catch (error) {
                formatted.push({
                    companyName: 'Error loading',
                    email: 'Error loading',
                    planName: sub.plan_name || 'N/A',
                    expiredDate: 'N/A',
                });
            }
        }
        return formatted;
    }

    /**
     * Get icon for cron job name
     */
    private getCronJobIcon(cronJobName: string): string {
        const icons: Record<string, string> = {
            'Subscription Check': '🔔',
            'Recurring Payment Processing': '💳',
            'Plan Provisioning': '⚙️',
        };
        return icons[cronJobName] || '📋';
    }
}
