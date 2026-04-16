import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
    private readonly logger = new Logger(StripeService.name);
    private stripe: Stripe;
    private mode: string;

    constructor(private readonly configService: ConfigService) {
        this.mode = this.configService.get<string>('stripe.mode');
        const secretKey = this.configService.get<string>(
            `stripe.secretKey.${this.mode}`
        );

        if (!secretKey) {
            this.logger.warn(
                `Stripe secret key not configured for mode: ${this.mode}`
            );
        } else {
            this.stripe = new Stripe(secretKey, {
                apiVersion: '2026-02-25.clover',
            });
            this.logger.log(`Stripe initialized in ${this.mode} mode`);
        }
    }

    /**
     * Get publishable key for frontend
     */
    getPublishableKey(): string {
        const publishableKey = this.configService.get<string>(
            `stripe.publishableKey.${this.mode}`
        );
        return publishableKey;
    }

    /**
     * Get Stripe currency
     */
    getCurrency(): string {
        return this.configService.get<string>('stripe.currency') || 'USD';
    }

    /**
     * Create or retrieve Stripe customer
     */
    async createOrGetCustomer(
        userId: string,
        email: string,
        name?: string
    ): Promise<Stripe.Customer> {
        try {
            // Check if customer exists with this email
            const existingCustomers = await this.stripe.customers.list({
                email,
                limit: 1,
            });

            if (existingCustomers.data.length > 0) {
                this.logger.log(
                    `Found existing customer: ${existingCustomers.data[0].id}`
                );
                return existingCustomers.data[0];
            }

            // Create new customer
            const customer = await this.stripe.customers.create({
                email,
                name,
                metadata: {
                    user_id: userId,
                },
            });

            this.logger.log(`Created new customer: ${customer.id}`);
            return customer;
        } catch (error) {
            this.logger.error('Error creating/getting customer:', error);
            throw error;
        }
    }

    /**
     * Attach payment method to customer
     */
    async attachPaymentMethod(
        paymentMethodId: string,
        customerId: string
    ): Promise<Stripe.PaymentMethod> {
        try {
            const paymentMethod = await this.stripe.paymentMethods.attach(
                paymentMethodId,
                {
                    customer: customerId,
                }
            );

            this.logger.log(
                `Attached payment method ${paymentMethodId} to customer ${customerId}`
            );
            return paymentMethod;
        } catch (error) {
            this.logger.error('Error attaching payment method:', error);
            throw error;
        }
    }

    /**
     * Get payment method details
     */
    async getPaymentMethod(
        paymentMethodId: string
    ): Promise<Stripe.PaymentMethod> {
        try {
            return await this.stripe.paymentMethods.retrieve(paymentMethodId);
        } catch (error) {
            this.logger.error('Error retrieving payment method:', error);
            throw error;
        }
    }

    /**
     * Create payment intent (one-time payment + optionally save card)
     */
    async createPaymentIntent(
        amount: number, // in dollars
        currency: string,
        customerId: string,
        paymentMethodId: string,
        metadata: Record<string, string>,
        saveCard: boolean = true
    ): Promise<Stripe.PaymentIntent> {
        try {
            const params: Stripe.PaymentIntentCreateParams = {
                amount: Math.round(amount * 100), // Convert to cents
                currency: currency.toLowerCase(),
                customer: customerId,
                payment_method: paymentMethodId,
                confirm: true, // Immediately confirm
                off_session: false,
                metadata,
                automatic_payment_methods: {
                    enabled: true,
                    allow_redirects: 'never', // Disable redirect-based payment methods
                },
            };

            // Save card for future use
            if (saveCard) {
                params.setup_future_usage = 'off_session';
            }

            const paymentIntent =
                await this.stripe.paymentIntents.create(params);

            this.logger.log(
                `Created payment intent: ${paymentIntent.id}, status: ${paymentIntent.status}`
            );
            return paymentIntent;
        } catch (error) {
            this.logger.error('Error creating payment intent:', error);
            throw error;
        }
    }

    /**
     * Charge saved payment method (for recurring payments)
     */
    async chargePaymentMethod(
        amount: number,
        currency: string,
        customerId: string,
        paymentMethodId: string,
        metadata: Record<string, string>
    ): Promise<Stripe.PaymentIntent> {
        try {
            const paymentIntent = await this.stripe.paymentIntents.create({
                amount: Math.round(amount * 100),
                currency: currency.toLowerCase(),
                customer: customerId,
                payment_method: paymentMethodId,
                off_session: true, // Indicates recurring charge
                confirm: true,
                metadata,
            });

            this.logger.log(
                `Charged payment method: ${paymentMethodId}, amount: ${amount}, status: ${paymentIntent.status}`
            );
            return paymentIntent;
        } catch (error) {
            this.logger.error('Error charging payment method:', error);
            throw error;
        }
    }

    /**
     * Retrieve payment intent
     */
    async getPaymentIntent(
        paymentIntentId: string
    ): Promise<Stripe.PaymentIntent> {
        try {
            return await this.stripe.paymentIntents.retrieve(paymentIntentId);
        } catch (error) {
            this.logger.error('Error retrieving payment intent:', error);
            throw error;
        }
    }

    /**
     * Retrieve full charge details including Stripe fee breakdown.
     * Uses expand to get balance_transaction in a single API call.
     */
    async retrieveChargeDetails(chargeId: string): Promise<{
        charge_id: string;
        amount: number;
        amount_captured: number;
        currency: string;
        status: string;
        stripe_fee: number;
        net_amount: number;
        balance_transaction_id: string | null;
        fee_details: Array<{ type: string; amount: number; currency: string; description: string }>;
        payment_method_details: any;
        receipt_url: string | null;
    }> {
        try {
            const charge = await this.stripe.charges.retrieve(chargeId, {
                expand: ['balance_transaction'],
            });

            const balanceTxn = charge.balance_transaction as Stripe.BalanceTransaction | null;

            return {
                charge_id: charge.id,
                amount: charge.amount,
                amount_captured: charge.amount_captured,
                currency: charge.currency,
                status: charge.status,
                stripe_fee: balanceTxn?.fee ?? 0,
                net_amount: balanceTxn?.net ?? 0,
                balance_transaction_id: balanceTxn?.id ?? null,
                fee_details: (balanceTxn?.fee_details ?? []).map((fd) => ({
                    type: fd.type,
                    amount: fd.amount,
                    currency: fd.currency,
                    description: fd.description ?? '',
                })),
                payment_method_details: charge.payment_method_details ?? null,
                receipt_url: charge.receipt_url ?? null,
            };
        } catch (error) {
            this.logger.error(`Error retrieving charge details for ${chargeId}:`, error);
            throw error;
        }
    }

    /**
     * Build enriched payment response from a PaymentIntent.
     * Retrieves charge + balance transaction to get Stripe fee breakdown.
     * Returns a flat object suitable for storing in payment.response JSONB field.
     */
    async buildEnrichedPaymentResponse(paymentIntent: Stripe.PaymentIntent): Promise<Record<string, any>> {
        const base: Record<string, any> = {
            paymentIntent: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: paymentIntent.status,
        };

        try {
            // latest_charge can be a string (charge ID) or an expanded Charge object
            const chargeId = typeof paymentIntent.latest_charge === 'string'
                ? paymentIntent.latest_charge
                : (paymentIntent.latest_charge as any)?.id;

            if (chargeId) {
                const chargeDetails = await this.retrieveChargeDetails(chargeId);
                return {
                    ...base,
                    charge_id: chargeDetails.charge_id,
                    amount_captured: chargeDetails.amount_captured,
                    stripe_fee: chargeDetails.stripe_fee,
                    net_amount: chargeDetails.net_amount,
                    balance_transaction_id: chargeDetails.balance_transaction_id,
                    fee_details: chargeDetails.fee_details,
                    payment_method_details: chargeDetails.payment_method_details,
                    receipt_url: chargeDetails.receipt_url,
                };
            }
        } catch (error) {
            this.logger.warn(`Could not enrich payment response for ${paymentIntent.id}: ${error.message}`);
        }

        return base;
    }

    /**
     * Set default payment method for customer
     */
    async setDefaultPaymentMethod(
        customerId: string,
        paymentMethodId: string
    ): Promise<Stripe.Customer> {
        try {
            const customer = await this.stripe.customers.update(customerId, {
                invoice_settings: {
                    default_payment_method: paymentMethodId,
                },
            });

            this.logger.log(
                `Set default payment method ${paymentMethodId} for customer ${customerId}`
            );
            return customer;
        } catch (error) {
            this.logger.error('Error setting default payment method:', error);
            throw error;
        }
    }

    /**
     * List customer payment methods
     */
    async listPaymentMethods(
        customerId: string,
        type: 'card' = 'card'
    ): Promise<Stripe.PaymentMethod[]> {
        try {
            const paymentMethods = await this.stripe.paymentMethods.list({
                customer: customerId,
                type,
            });

            return paymentMethods.data;
        } catch (error) {
            this.logger.error('Error listing payment methods:', error);
            throw error;
        }
    }

    /**
     * Detach payment method from customer
     */
    async detachPaymentMethod(
        paymentMethodId: string
    ): Promise<Stripe.PaymentMethod> {
        try {
            const paymentMethod =
                await this.stripe.paymentMethods.detach(paymentMethodId);

            this.logger.log(`Detached payment method: ${paymentMethodId}`);
            return paymentMethod;
        } catch (error) {
            this.logger.error('Error detaching payment method:', error);
            throw error;
        }
    }

    /**
     * Construct webhook event from payload and signature
     */
    constructWebhookEvent(
        payload: Buffer,
        signature: string
    ): Stripe.Event {
        try {
            const webhookSecret = this.configService.get<string>(
                'stripe.webhookSecret'
            );

            if (!webhookSecret) {
                throw new Error('Stripe webhook secret not configured');
            }

            return this.stripe.webhooks.constructEvent(
                payload,
                signature,
                webhookSecret
            );
        } catch (error) {
            this.logger.error('Error constructing webhook event:', error);
            throw error;
        }
    }

    /**
     * Get customer by ID
     */
    async getCustomer(customerId: string): Promise<Stripe.Customer> {
        try {
            const customer =
                await this.stripe.customers.retrieve(customerId);
            return customer as Stripe.Customer;
        } catch (error) {
            this.logger.error('Error retrieving customer:', error);
            throw error;
        }
    }

    /**
     * Update customer
     */
    async updateCustomer(
        customerId: string,
        params: Stripe.CustomerUpdateParams
    ): Promise<Stripe.Customer> {
        try {
            return await this.stripe.customers.update(customerId, params);
        } catch (error) {
            this.logger.error('Error updating customer:', error);
            throw error;
        }
    }

    /**
     * Create refund
     */
    async createRefund(
        paymentIntentId: string,
        amount?: number,
        reason?: Stripe.RefundCreateParams.Reason
    ): Promise<Stripe.Refund> {
        try {
            const params: Stripe.RefundCreateParams = {
                payment_intent: paymentIntentId,
            };

            if (amount) {
                params.amount = Math.round(amount * 100);
            }

            if (reason) {
                params.reason = reason;
            }

            const refund = await this.stripe.refunds.create(params);

            this.logger.log(`Created refund: ${refund.id}`);
            return refund;
        } catch (error) {
            this.logger.error('Error creating refund:', error);
            throw error;
        }
    }

    /**
     * Cancel payment intent
     */
    async cancelPaymentIntent(
        paymentIntentId: string
    ): Promise<Stripe.PaymentIntent> {
        try {
            const paymentIntent = await this.stripe.paymentIntents.cancel(
                paymentIntentId
            );

            this.logger.log(`Cancelled payment intent: ${paymentIntentId}`);
            return paymentIntent;
        } catch (error) {
            this.logger.error('Error cancelling payment intent:', error);
            throw error;
        }
    }
}
