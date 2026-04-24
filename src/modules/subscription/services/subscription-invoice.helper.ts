import { Injectable, Logger } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { ISelectedTool, SubscriptionDoc } from '../repository/entities/subscription.entity';
import { UserService } from '@modules/user/services/user.service';
import { PlanService } from '@modules/plan/services/plan.service';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { NodemailerService } from '@modules/email/services/nodemailer.service';

// Currency symbol mapping
const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: '$',
    GBP: '£',
    EUR: '€',
    INR: '₹',
    JPY: '¥',
    CNY: '¥',
    AUD: 'A$',
    CAD: 'C$',
    CHF: 'CHF',
    NZD: 'NZ$',
    SGD: 'S$',
    HKD: 'HK$',
};

export interface InvoicePayload {
    full_inv_number: string;
    inv_path: string;
    date: Date;
    user: {
        name: string;
        email: string;
        mobile?: string;
    };
    plan: {
        name: string;
        description?: string;
    };
    tools: Array<ISelectedTool>;
    price: number;
    special_price?: number;
    discount_price?: number;
    discount_code?: string;
    discount_name?: string;
    discount_duration_type?: string;  // 'forever', 'first_payment', 'limited_months'
    discount_duration_months?: number;
    discount_remaining_months?: number;
    tax_value: number;
    description?: string;
    plan_price?: number;
    locations?: number;
}

@Injectable()
export class SubscriptionInvoiceHelper {
    private readonly logger = new Logger(SubscriptionInvoiceHelper.name);
    private readonly currencySymbol: string;

    constructor(
        private readonly invoiceService: InvoiceService,
        private readonly userService: UserService,
        private readonly planService: PlanService,
        private readonly configService: ConfigService,
        private readonly nodemailerService: NodemailerService,
    ) {
        // Get currency symbol from stripe config
        const currencyCode = this.configService.get<string>('stripe.currency') || 'USD';
        this.currencySymbol = CURRENCY_SYMBOLS[currencyCode.toUpperCase()] || '$';
    }

    /**
     * Get currency symbol
     */
    getCurrencySymbol(): string {
        return this.currencySymbol;
    }

    /**
     * Generate invoice for a subscription purchase
     * @param subscription The subscription document
     * @param paymentData Payment information
     * @returns Path to the generated invoice PDF
     */
    async generateSubscriptionInvoice(
        subscription: SubscriptionDoc,
        paymentData: {
            inv_number: number;
            full_inv_number: string;
            special_price?: number;
            discount_price?: number;
        }
    ): Promise<string> {
        try {
            this.logger.log(`Generating invoice for subscription: ${subscription._id}`);

            // Fetch user details
            const user = await this.userService.findOneById(subscription.user_id.toString());
            if (!user) {
                throw new Error(`User not found: ${subscription.user_id}`);
            }

            // Fetch plan details
            const plan = await this.planService.findOneById(subscription.plan_id.toString());
            if (!plan) {
                throw new Error(`Plan not found: ${subscription.plan_id}`);
            }

            // Generate invoice filename
            const invoiceFilename = `invoice-${paymentData.full_inv_number}.pdf`;
            const invoicePath = path.join('invoices', invoiceFilename);

            // Get locations from subscription
            const locations = (subscription as any).locations || 1;

            // Find the appropriate location tier for plan price
            const locationTiers = plan.location_pricing || [];
            const sortedTiers = [...locationTiers].sort((a, b) => b.locations - a.locations);
            const matchingTier = sortedTiers.find(tier => tier.locations <= locations) || locationTiers[0];
            const planPrice = matchingTier?.special_price || matchingTier?.price || 0;

            // Prepare invoice payload
            const invoicePayload: InvoicePayload = {
                full_inv_number: paymentData.full_inv_number,
                inv_path: invoiceFilename,
                date: new Date(),
                user: {
                    name: user.name || `${user.first_name} ${user.last_name}`,
                    email: user.email,
                    mobile: user.mobile,
                },
                plan: {
                    name: plan.name,
                    description: plan.duration_type,
                },
                tools: subscription.tools,
                price: subscription.subtotal,
                special_price: paymentData.special_price || 0,
                discount_price: paymentData.discount_price,
                discount_code: (subscription as any).discount_code,
                discount_name: (subscription as any).discount_name,
                discount_duration_type: (subscription as any).discount_duration_type,
                discount_duration_months: (subscription as any).discount_duration_months,
                discount_remaining_months: (subscription as any).discount_remaining_months,
                tax_value: subscription.tax_price,
                plan_price: planPrice,
                locations: locations,
                description: this.generateInvoiceDescription(subscription, plan),
            };

            // Generate the invoice PDF
            const invoiceFilePath = await this.invoiceService.generateSubscriptionInvoice(invoicePayload);

            this.logger.log(`Invoice generated successfully: ${invoiceFilePath}`);

            // Note: Email sending is handled by the caller
            // Removed duplicate email send from here

            return invoiceFilePath;
        } catch (error) {
            this.logger.error(`Failed to generate invoice: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Generate invoice description based on subscription details
     */
    private generateInvoiceDescription(subscription: SubscriptionDoc, plan: any): string {
        const parts: string[] = [];

        // Add plan name
        parts.push(plan.name);

        // Add plan type and duration
        if (subscription.plan_type && subscription.plan_type_value) {
            const duration = subscription.plan_type_value;
            const type = subscription.plan_type.toLowerCase();
            parts.push(`(${duration} ${type}${duration > 1 ? 's' : ''})`);
        }

        // Add locations
        const locations = (subscription as any).locations || 1;
        if (locations > 0) {
            parts.push(`- ${locations} ${locations === 1 ? 'Location' : 'Locations'}`);
        }

        // Add trial indicator
        if (subscription.trial) {
            parts.push('- Trial');
        }

        // Add lifetime indicator
        if (subscription.is_lifetime) {
            parts.push('- Lifetime');
        }

        // Add tools if any
        if (subscription.tools && subscription.tools.length > 0) {
            const toolNames = subscription.tools.map(tool => tool.name).join(', ');
            parts.push(`with tools: ${toolNames}`);
        }

        return parts.join(' ');
    }

    /**
     * Generate invoice number
     * @param lastInvoiceNumber The last invoice number used
     * @returns New invoice number and formatted invoice number
     */
    generateInvoiceNumber(lastInvoiceNumber: number = 0): {
        inv_number: number;
        full_inv_number: string;
    } {
        const newInvoiceNumber = lastInvoiceNumber + 1;
        const prefix = this.configService.get<string>('INVOICE_PREFIX') || 'INV';
        const year = new Date().getFullYear();
        const paddedNumber = String(newInvoiceNumber).padStart(6, '0');

        return {
            inv_number: newInvoiceNumber,
            full_inv_number: `${prefix}-${year}-${paddedNumber}`,
        };
    }

    /**
     * Send invoice via email
     * @param userEmail User's email address
     * @param userName User's name
     * @param invoiceFilePath Path to the invoice PDF
     * @param invoiceNumber Invoice number for reference
     * @param planName Name of the plan
     * @param amount Total amount
     * @param locations Number of locations (optional)
     * @param discountData Optional discount information
     */
    async sendInvoiceEmail(
        userEmail: string,
        userName: string,
        invoiceFilePath: string,
        invoiceNumber: string,
        planName: string,
        amount: string,
        locations?: number,
        discountData?: {
            discount_price?: number;
            discount_code?: string;
            discount_duration_type?: string;
            discount_duration_months?: number;
            discount_remaining_months?: number;
        }
    ): Promise<void> {
        try {
            const emailSubject = `Invoice ${invoiceNumber} - Subscription Purchase`;

            // Prepare discount info for email template
            const discountApplied = discountData && discountData.discount_price && discountData.discount_price > 0;
            let discountDurationInfo = '';
            let discountDurationColor = '#6b7280';

            if (discountApplied && discountData.discount_duration_type) {
                const durationType = discountData.discount_duration_type;
                const durationMonths = discountData.discount_duration_months;
                const remainingMonths = discountData.discount_remaining_months;

                if (durationType === 'forever') {
                    discountDurationInfo = 'Discount applies to all future payments';
                    discountDurationColor = '#10b981';
                } else if (durationType === 'first_payment') {
                    discountDurationInfo = 'Discount applied to this payment only';
                    discountDurationColor = '#f59e0b';
                } else if (durationType === 'limited_months' && durationMonths) {
                    if (remainingMonths !== null && remainingMonths !== undefined) {
                        discountDurationInfo = `Discount valid for ${remainingMonths} more payment${remainingMonths === 1 ? '' : 's'} (of ${durationMonths} total)`;
                    } else {
                        discountDurationInfo = `Discount valid for ${durationMonths} payment${durationMonths === 1 ? '' : 's'}`;
                    }
                    discountDurationColor = '#3b82f6';
                }
            }

            // Use the new template
            await this.nodemailerService.sendEmailWithTemplate(
                userEmail,
                emailSubject,
                'subscription_invoice.hjs',
                {
                    name: userName,
                    invoiceNumber: invoiceNumber,
                    planName: planName,
                    amount: amount,
                    locations: locations || 1,
                    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                    dashboardUrl: this.configService.get<string>('FRONTEND_URL') || 'https://app.shivatrade.com/apps/dashboard',
                    // Discount info
                    discountApplied: discountApplied,
                    discountCode: discountData?.discount_code || '',
                    discountAmount: discountApplied ? `${this.currencySymbol}${discountData.discount_price.toFixed(2)}` : '',
                    discountDurationInfo: discountDurationInfo,
                    discountDurationColor: discountDurationColor,
                },
                [], // bcc
                [
                    {
                        filename: `invoice-${invoiceNumber}.pdf`,
                        path: invoiceFilePath,
                    },
                ]
            );

            console.log(`Invoice email sent successfully to ${userEmail}`);
        } catch (error) {
            console.error(`Failed to send invoice email: ${error.message}`, error.stack);
            // Don't throw error - invoice generation should succeed even if email fails
        }
    }
}
