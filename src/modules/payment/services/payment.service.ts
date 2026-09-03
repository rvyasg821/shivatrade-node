import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
    IDatabaseCreateOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseSaveOptions,
} from '@common/database/interfaces/database.interface';
import { PaymentRepository } from '../repository/repositories/payment.repository';
import {
    PaymentDoc,
    PaymentEntity,
    ENUM_PAYMENT_STATUS,
    ENUM_PAYMENT_GATEWAY,
    ENUM_PAYMENT_METHOD,
} from '../repository/entities/payment.entity';
import { PaymentCreateRequestDto } from '../dtos/request/payment.create.request.dto';
import { PaymentListResponseDto } from '../dtos/response/payment.list.response.dto';
import {
    IPayPalCardPaymentRequest,
    IPaymentConfirmationRequest,
    IPaymentResponse,
    ISubscriptionUpdatePayload,
} from '../interfaces/payment-processing.interface';
import { IPayPalOrderResponse, IPayPalCaptureResponse } from '../interfaces/payment-paypal.interface';
import { IPaymentTool } from '../interfaces/payment-data.interface';
import { PayPalService } from '@common/paypal/paypal.service';
import { StripeService } from '@common/stripe/stripe.service';
import {
    IStripeCardPaymentRequest,
    IStripePaymentResponse,
    IStripeConfirmPaymentRequest,
} from '../interfaces/payment-stripe.interface';
import { CardService } from '@modules/card/services/card.service';
import { PlanService } from '@modules/plan/services/plan.service';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';
import { ToolProvisioningService } from '@modules/subscription/services/tool-provisioning.service';
import { UserService } from '@modules/user/services/user.service';
import { HelperDateService } from '@common/helper/services/helper.date.service';
import { log } from 'handlebars/runtime';
import { NodemailerService } from '@modules/email/services/nodemailer.service';
import { EnhancedEmailService } from '@modules/email/services/enhanced-email.service';
import { SubscriptionDoc } from '@modules/subscription/repository/entities/subscription.entity';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { SubscriptionInvoiceHelper } from '@modules/subscription/services/subscription-invoice.helper';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import { DiscountService } from '@modules/discount/services/discount.service';
import { LocationService } from '@modules/location/services/location.service';

export interface IPaymentService {
    findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<PaymentDoc[]>;
    getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number>;
    findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<PaymentDoc>;
    findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<PaymentDoc>;
    findByUserId(
        userId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<PaymentDoc[]>;
    create(
        data: PaymentCreateRequestDto,
        options?: IDatabaseCreateOptions
    ): Promise<PaymentDoc>;
    update(
        repository: PaymentDoc,
        data: Partial<PaymentCreateRequestDto>,
        options?: IDatabaseSaveOptions
    ): Promise<PaymentDoc>;
    softDelete(
        repository: PaymentDoc,
        options?: IDatabaseSaveOptions
    ): Promise<PaymentDoc>;
    mapList(payments: PaymentDoc[]): Promise<PaymentListResponseDto[]>;
    mapGet(payment: PaymentDoc): PaymentListResponseDto;
}

@Injectable()
export class PaymentService implements IPaymentService {
    constructor(
        private readonly paymentRepository: PaymentRepository,
        private readonly paypalService: PayPalService,
        private readonly stripeService: StripeService,
        private readonly cardService: CardService,
        private readonly planService: PlanService,
        private readonly subscriptionService: SubscriptionService,
        private readonly toolProvisioningService: ToolProvisioningService,
        private readonly userService: UserService,
        private readonly helperDateService: HelperDateService,
        private readonly nodemailerService: NodemailerService,
        private readonly emailService: EnhancedEmailService,
        private readonly configService: ConfigService,
        private readonly subscriptionInvoiceHelper: SubscriptionInvoiceHelper,
        private readonly companyRepository: CompanyRepository,
        private readonly discountService: DiscountService,
        private readonly locationService: LocationService
    ) { }

    async findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<PaymentDoc[]> {
        const filters = {
            ...find,
            soft_delete: false,
        };
        return this.paymentRepository.findAll(filters, options);
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        const filters = {
            ...find,
            soft_delete: false,
        };
        return this.paymentRepository.getTotal(filters);
    }

    async findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<PaymentDoc> {
        return this.paymentRepository.findOneById(_id, options);
    }

    async findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<PaymentDoc> {
        return this.paymentRepository.findOne(find, options);
    }

    async findOneSort(
        find: Record<string, any>,
        sortField: string = 'createdAt',
        sortOrder: number = -1
    ): Promise<PaymentDoc> {
        return this.paymentRepository.findOneSort(find, sortField, sortOrder);
    }

    async findByUserId(
        userId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<PaymentDoc[]> {
        return this.paymentRepository.findByUserId(userId, options);
    }

    async create(
        data: PaymentCreateRequestDto,
        options?: IDatabaseCreateOptions
    ): Promise<PaymentDoc> {
        const create: PaymentEntity = new PaymentEntity();
        create.user_id = data.user_id;
        create.company_id = data.company_id;
        if (data.plan_id) create.plan_id = data.plan_id;
        if (data.subscription_id)
            create.subscription_id = data.subscription_id;
        create.charge_id = data.charge_id || '';
        create.request_id = data.request_id || '';
        create.locations = data.locations || 1;
        create.location_pricing = data.location_pricing || [];
        create.plan_price = data.plan_price || 0;
        create.plan_special_price = data.plan_special_price || 0;
        create.plan_special_price_duration = data.plan_special_price_duration || 0;
        create.plan_special_price_remaining = data.plan_special_price_remaining || 0;
        create.tools_price = data.tools_price || 0;
        create.subtotal = data.subtotal || 0;
        create.tax_type = data.tax_type || '';
        create.tax_rate = data.tax_rate || 0;
        create.tax_price = data.tax_price || 0;
        create.total = data.total;
        create.final_price = data.final_price;
        create.inv_number = data.inv_number || 0;
        create.full_inv_number = data.full_inv_number || '';
        create.inv_path = data.inv_path || '';
        create.request_data = data.request_data || {};
        create.response = (data.response || {}) as IPayPalOrderResponse | IPayPalCaptureResponse;
        create.gateway = data.gateway;
        create.method = data.method;
        create.paid = data.paid || false;
        create.postDateTime = data.postDateTime || null;
        create.trial = data.trial || false;
        create.status = data.status || ENUM_PAYMENT_STATUS.CREATED;
        create.tools = (data.tools || []) as IPaymentTool[];
        create.soft_delete = false;
        create.discount_price = data.discount_price || 0;
        create.discount_id = data.discount_id || null;
        create.discount_code = data.discount_code || null;
        create.discount_type = data.discount_type || null;
        create.discount_value = data.discount_value || 0;
        create.discount_duration_type = data.discount_duration_type || null;
        create.discount_duration_months = data.discount_duration_months || null;
        create.discount_remaining_months = data.discount_remaining_months || null;
        create.discount_name = data.discount_name || null;

        return this.paymentRepository.create<PaymentEntity>(create, options);
    }

    async update(
        repository: PaymentDoc,
        data: Partial<PaymentCreateRequestDto>,
        options?: IDatabaseSaveOptions
    ): Promise<PaymentDoc>;
    async update(
        id: string,
        data: Partial<PaymentCreateRequestDto>
    ): Promise<PaymentDoc>;
    async update(
        repositoryOrId: PaymentDoc | string,
        data: Partial<PaymentCreateRequestDto>,
        options?: IDatabaseSaveOptions
    ): Promise<PaymentDoc> {
        if (typeof repositoryOrId === 'string') {
            // Handle string ID case
            const updateData: Partial<PaymentEntity> = {};
            if (data.user_id)
                updateData.user_id = data.user_id;
            if (data.company_id)
                updateData.company_id = data.company_id;
            if (data.plan_id)
                updateData.plan_id = data.plan_id;
            if (data.subscription_id)
                updateData.subscription_id = data.subscription_id;
            if (data.charge_id !== undefined)
                updateData.charge_id = data.charge_id;
            if (data.request_id !== undefined)
                updateData.request_id = data.request_id;
            if (data.locations !== undefined)
                updateData.locations = data.locations;
            if (data.location_pricing !== undefined)
                updateData.location_pricing = data.location_pricing;
            if (data.plan_price !== undefined)
                updateData.plan_price = data.plan_price;
            if (data.plan_special_price !== undefined)
                updateData.plan_special_price = data.plan_special_price;
            if (data.plan_special_price_duration !== undefined)
                updateData.plan_special_price_duration = data.plan_special_price_duration;
            if (data.plan_special_price_remaining !== undefined)
                updateData.plan_special_price_remaining = data.plan_special_price_remaining;
            if (data.tools_price !== undefined)
                updateData.tools_price = data.tools_price;
            if (data.subtotal !== undefined)
                updateData.subtotal = data.subtotal;
            if (data.tax_type !== undefined)
                updateData.tax_type = data.tax_type;
            if (data.tax_rate !== undefined)
                updateData.tax_rate = data.tax_rate;
            if (data.tax_price !== undefined)
                updateData.tax_price = data.tax_price;
            if (data.total !== undefined) updateData.total = data.total;
            if (data.final_price !== undefined)
                updateData.final_price = data.final_price;
            if (data.response !== undefined)
                updateData.response = data.response as IPayPalOrderResponse | IPayPalCaptureResponse;
            if (data.paid !== undefined) updateData.paid = data.paid;
            if (data.status !== undefined) updateData.status = data.status;
            if (data.tools !== undefined) updateData.tools = data.tools as IPaymentTool[];
            if ((data as any).inv_number !== undefined)
                updateData.inv_number = (data as any).inv_number;
            if ((data as any).full_inv_number !== undefined)
                updateData.full_inv_number = (data as any).full_inv_number;
            if ((data as any).inv_path !== undefined)
                updateData.inv_path = (data as any).inv_path;

            return this.paymentRepository.updateById(repositoryOrId, updateData);
        } else {
            // Handle PaymentDoc case
            const repository = repositoryOrId;
            if (data.charge_id !== undefined)
                repository.charge_id = data.charge_id;
            if (data.request_id !== undefined)
                repository.request_id = data.request_id;
            if (data.locations !== undefined)
                repository.locations = data.locations;
            if (data.location_pricing !== undefined)
                repository.location_pricing = data.location_pricing;
            if (data.plan_price !== undefined)
                repository.plan_price = data.plan_price;
            if (data.plan_special_price !== undefined)
                repository.plan_special_price = data.plan_special_price;
            if (data.plan_special_price_duration !== undefined)
                repository.plan_special_price_duration = data.plan_special_price_duration;
            if (data.plan_special_price_remaining !== undefined)
                repository.plan_special_price_remaining = data.plan_special_price_remaining;
            if (data.tools_price !== undefined)
                repository.tools_price = data.tools_price;
            if (data.subtotal !== undefined)
                repository.subtotal = data.subtotal;
            if (data.tax_type !== undefined)
                repository.tax_type = data.tax_type;
            if (data.tax_rate !== undefined)
                repository.tax_rate = data.tax_rate;
            if (data.tax_price !== undefined)
                repository.tax_price = data.tax_price;
            if (data.total !== undefined) repository.total = data.total;
            if (data.final_price !== undefined)
                repository.final_price = data.final_price;
            if (data.response !== undefined)
                repository.response = data.response as IPayPalOrderResponse | IPayPalCaptureResponse;
            if (data.paid !== undefined) repository.paid = data.paid;
            if (data.status !== undefined) repository.status = data.status;
            if (data.subscription_id !== undefined)
                repository.subscription_id = data.subscription_id;
            if (data.tools !== undefined) repository.tools = data.tools as IPaymentTool[];
            if ((data as any).inv_number !== undefined)
                repository.inv_number = (data as any).inv_number;
            if ((data as any).full_inv_number !== undefined)
                repository.full_inv_number = (data as any).full_inv_number;
            if ((data as any).inv_path !== undefined)
                repository.inv_path = (data as any).inv_path;

            return this.paymentRepository.save(repository, options);
        }
    }

    async updateStatus(
        repository: PaymentDoc,
        status: ENUM_PAYMENT_STATUS,
        options?: IDatabaseSaveOptions
    ): Promise<PaymentDoc> {
        return this.paymentRepository.updateStatus(repository, status, options);
    }

    async softDelete(
        repository: PaymentDoc,
        options?: IDatabaseSaveOptions
    ): Promise<PaymentDoc> {
        repository.soft_delete = true;
        return this.paymentRepository.save(repository, options);
    }

    async remove(id: string): Promise<void> {
        await this.paymentRepository.softDeleteById(id);
    }

    async deleteAllByCompanyId(companyId: string): Promise<number> {
        return this.paymentRepository.deleteAllByCompanyId(companyId);
    }

    // PayPal specific methods
    async createPayPalPaymentData(data: PaymentCreateRequestDto): Promise<PaymentDoc> {
        let createdPayment = null;
        if (data && data?.user_id) {
            const userId = data?.user_id || '';
            let paid = false;
            let status = data?.response?.status || '';

            // if (data?.response?.purchase_units?.[0]?.payments?.captures?.[0]?.status) {
            //     status = data?.response?.purchase_units[0].payments.captures[0].status;
            // }

            if (status) {
                status = status.toLowerCase();
            }
            if (status === 'completed' || status === 'COMPLETED') {
                paid = true;
            }

            const planPrice = data?.plan_price || 0;
            const toolsPrice = data?.tools_price || 0;
            const subtotal = data?.subtotal || 0;
            const total = data?.total || 0;
            const finalPrice = data?.final_price || 0;
            const discount_price = data?.discount_price || 0;
            const specialPriceDuration = parseInt(
                data?.plan_special_price_duration?.toString() || '0'
            );
            let specialPriceDurationRemaining = specialPriceDuration - 1 || 0;
            if (specialPriceDurationRemaining < 0) {
                specialPriceDurationRemaining = 0;
            }

            createdPayment = await this.create({
                user_id: userId,
                company_id: data.company_id,
                plan_id: data.plan_id,
                locations: data?.locations || 1,
                location_pricing: data?.location_pricing || [],
                plan_price: planPrice,
                plan_special_price: data?.plan_special_price || 0,
                plan_special_price_duration: specialPriceDuration || 0,
                plan_special_price_remaining: specialPriceDurationRemaining || 0,
                tools_price: toolsPrice,
                subtotal: subtotal,
                tax_type: data?.tax_type || '',
                tax_rate: data?.tax_rate || 0,
                tax_price: data?.tax_price || 0,
                total,
                final_price: finalPrice,
                discount_price: discount_price,
                discount_code: data?.discount_code || null,
                response: data?.response || null,
                charge_id: data?.response?.id || '',
                request_id: data?.request_id || null,
                gateway: data?.gateway ?? ENUM_PAYMENT_GATEWAY.PAYPAL,
                method: data?.method ?? ENUM_PAYMENT_METHOD.CARD,
                paid: paid,
                postDateTime: new Date().toDateString(),
                status: status as ENUM_PAYMENT_STATUS,
                tools: data?.tools || [],
            });

            createdPayment = await this.findOneSort({
                _id: createdPayment._id,
            });
        }

        return createdPayment;
    }

    async createSubscriptionData(
        id: string,
        payload: any
    ): Promise<PaymentDoc> {
        try {
            console.log('🔄 createSubscriptionData called with payment ID:', id);
            console.log('Payload:', JSON.stringify(payload, null, 2));

            const todayDate = this.helperDateService.formatToIsoDate(
                new Date()
            );
            const payment = await this.findOneSort({
                _id: id,
            });
            let paymentData = payment;
            console.log('Payment found:', payment?._id, 'Paid:', payment?.paid, 'Status:', payment?.status);
            
            // Allow subscription creation for:
            // 1. Paid payments (regular flow)
            // 2. Admin-assigned payments (pending status but should create subscription)
            const shouldCreateSubscription = payment && payment?._id && 
                (payment?.paid || 
                 (payment?.status === ENUM_PAYMENT_STATUS.PENDING && payment?.charge_id?.includes('admin_assigned')));
            
            if (shouldCreateSubscription) {
                let updtUserSubId = true;
                const planId = payment.plan_id;
                const userId = payment.user_id;
                // const user = await this.userService.findOneById(
                //     userId//.toString()
                // );
                // Find user's active subscription
                const userSubscriptions =
                    await this.subscriptionService.findAll({
                        user_id: userId.toString(),
                        status: true,
                    });
                const subscriptionId =
                    userSubscriptions.length > 0
                        ? userSubscriptions[0]._id
                        : null;
                // console.log('payment?.plan_id--2', payment?.plan_id, planId);

                if (payment?.plan_id && planId) {
                    const plan = await this.planService.findOneById(
                        planId?.toString()
                    );

                    if (plan && plan._id) {
                        // Calculate duration days based on plan's duration_type and duration value
                        const durationValue = plan.duration || 1;
                        const durationType = (plan.duration_type || 'MONTHLY').toUpperCase();

                        let durationDays = 30; // Default to 30 days (monthly)

                        if (durationType === 'WEEKLY' || durationType === 'WEEK') {
                            durationDays = durationValue * 7;
                        } else if (durationType === 'MONTHLY' || durationType === 'MONTH') {
                            durationDays = durationValue * 30;
                        } else if (durationType === 'YEARLY' || durationType === 'YEAR') {
                            durationDays = durationValue * 365;
                        } else if (durationType === 'DAILY' || durationType === 'DAY') {
                            durationDays = durationValue;
                        }

                        console.log(`📅 Calculated duration: ${durationDays} days (${durationType} x ${durationValue})`);

                        const nextDate = this.helperDateService.forward(
                            new Date(),
                            this.helperDateService.createDuration({
                                days: durationDays,
                            })
                        );
                        const endDate = this.helperDateService.forward(
                            new Date(),
                            this.helperDateService.createDuration({
                                days: durationDays,
                            })
                        );

                        // const specialPriceDuration = parseInt(payload?.special_price_duration || 0);
                        // let specialPriceDurationRemaining = specialPriceDuration - 1 || 0;
                        // if (specialPriceDurationRemaining < 0) {
                        //     specialPriceDurationRemaining = 0;
                        // }
                        const payloadTools = payload?.tools || [];
                        const toolsToBeCreated = plan.tools || [];

                        console.log('DEBUG: toolsToBeCreated count:', toolsToBeCreated.length);
                        if (toolsToBeCreated.length > 0) console.log('DEBUG: First tool sample:', JSON.stringify(toolsToBeCreated[0]));

                        // Use payload tools directly since they have correct calculated prices
                        // Filter to only include tools that exist in the plan
                        const planToolIds = toolsToBeCreated.map((t: any) => t._id?.toString());
                        const filteredTools = payloadTools
                            .filter((tool: any) => planToolIds.includes(tool._id?.toString()))
                            .map((tool: any) => {
                                // Find matching plan tool for additional info (is_mandatory, etc.)
                                const planTool = toolsToBeCreated.find((pt: any) => pt._id?.toString() === tool._id?.toString()) as any;
                                return {
                                    _id: tool._id?.toString(),
                                    name: tool.name || planTool?.name || '',
                                    slug: tool.slug || planTool?.slug || '',
                                    base_price: tool.base_price ?? planTool?.price ?? 0,
                                    pricing_mode: tool.pricing_mode || planTool?.pricing_mode || 'fixed',
                                    location_multiplier: tool.location_multiplier ?? planTool?.location_multiplier ?? 1.0,
                                    calculated_price: tool.calculated_price ?? tool.base_price ?? 0,
                                    is_mandatory: planTool?.is_mandatory ?? false,
                                    display_order: tool.display_order ?? planTool?.display_order ?? 0,
                                };
                            });

                        console.log('DEBUG: filteredTools:', JSON.stringify(filteredTools));

                        // Tools already have full pricing details from above
                        const toolsWithPricing = filteredTools;

                        // Calculate values
                        const planPrice = payload?.plan_price || payload?.platform_fee || payload?.platfrom_price || 0;
                        const toolsPrice = payload?.tools_price || payload?.tools_total || 0;
                        const subtotal = payload?.subtotal || (planPrice + toolsPrice);
                        const discountPrice = payload?.discount_price || payment?.discount_price || 0;
                        const total = payload?.total || (subtotal - discountPrice);
                        const taxPrice = payload?.tax_price || payload?.tax_value || 0;
                        const finalPrice = payload?.final_price || (total + taxPrice);

                        const subscriptionData = {
                            // References
                            user_id: userId, // UUID string
                            company_id: payment.company_id,
                            plan_id: planId,

                            // Location-based pricing (cloned from plan)
                            locations: payload?.locations || 1,
                            location_pricing: payload?.location_pricing || plan.location_pricing || [],

                            // Plan tier values
                            plan_price: planPrice,
                            original_plan_price: payload?.original_plan_price || planPrice,
                            special_price: payload?.special_price || 0,
                            special_price_duration: payload?.special_price_duration || 0,
                            special_price_remaining: payload?.special_price_remaining || payload?.special_price_duration || 0,

                            // Tools with full pricing
                            tools: toolsWithPricing,
                            tools_price: toolsPrice,

                            // Calculations
                            subtotal: subtotal,

                            // Discount
                            discount_id: payment?.discount_id || payload?.discount_id || null,
                            discount_code: payment?.discount_code || payload?.discount_code || null,
                            discount_type: payload?.discount_type || null,
                            discount_value: payload?.discount_value || 0,
                            discount_price: discountPrice,
                            discount_duration_type: payload?.discount_duration_type || null,
                            discount_duration_months: payload?.discount_duration_months || null,
                            discount_remaining_months: payload?.discount_duration_months || null,
                            discount_name: payload?.discount_name || null,
                            discount_location_rules: payload?.discount_location_rules || [],

                            // After discount
                            total: total,

                            // Tax
                            tax_type: payload?.tax_type || null,
                            tax_rate: payload?.tax_rate || 0,
                            tax_price: taxPrice,

                            // Final amount
                            final_price: finalPrice,

                            // Plan info snapshot
                            plan_name: payload?.plan_name || plan.name,
                            plan_description: payload?.plan_description || '',
                            plan_type: payload?.plan_type || plan.duration_type,
                            plan_type_value: payload?.plan_type_value || durationDays,

                            // Subscription flags
                            recurring: plan.recurring,
                            is_lifetime: plan?.is_lifetime ?? false,
                            trial: plan?.trial ?? false,
                            trial_days: payload?.trial_days || 0,
                            is_default: false,

                            // Dates
                            start_date: new Date(),
                            next_date: plan?.is_lifetime ? null : nextDate,
                            end_date: plan?.is_lifetime ? null : endDate,

                            // Status
                            hold: false,
                            status: true,
                            soft_delete: false,
                        };
                        // console.log('sbuscription', subscriptionData, payload);

                        // Cancel old subscription if subscriptionId is provided
                        if (subscriptionId) {
                            const query = {
                                _id: subscriptionId,
                                status: true,
                                cancelledAt: null,
                            };

                            const subscription =
                                await this.subscriptionService.findOne(query);
                            if (subscription && subscription._id) {
                                subscription.cancelledAt = new Date();
                                subscription.status = false;
                                await this.subscriptionService.update(
                                    subscription,
                                    { status: false }
                                );
                            }
                        }

                        // IMPORTANT: Cancel ALL other active subscriptions for this user
                        // This ensures only one active subscription at a time
                        const userIdForCancellation = userId?.toString();
                        console.log(`🔄 Checking for active subscriptions to cancel for user: ${userIdForCancellation}`);

                        const activeSubscriptions = await this.subscriptionService.findAll({
                            user_id: userIdForCancellation,
                            status: true,
                            soft_delete: false
                        });

                        if (activeSubscriptions && activeSubscriptions.length > 0) {
                            console.log(`📋 Found ${activeSubscriptions.length} active subscription(s) to cancel`);
                            for (const activeSub of activeSubscriptions) {
                                await this.subscriptionService.update(activeSub, {
                                    status: false,
                                    cancelledAt: new Date()
                                });
                                console.log(`   ✅ Cancelled subscription: ${activeSub._id}`);
                            }
                        } else {
                            console.log(`   ℹ️  No active subscriptions found to cancel`);
                        }

                        console.log('🔄 Creating subscription with data:', JSON.stringify(subscriptionData, null, 2));
                        const createdSubscription =
                            await this.subscriptionService.create(
                                subscriptionData
                            );
                        console.log('✅ Subscription created successfully:', createdSubscription._id);

                        if (createdSubscription && createdSubscription._id) {
                            // Record discount application if discount was used
                            if (payment?.discount_code && payment?.discount_id) {
                                try {
                                    // Fetch discount to pass duration info for tracking
                                    const discount = await this.discountService.findOneById(
                                        payment.discount_id.toString()
                                    );
                                    await this.discountService.recordDiscountApplication(
                                        payment.company_id.toString(),
                                        payment.user_id.toString(),
                                        createdSubscription._id.toString(),
                                        payment.discount_id.toString(),
                                        payment.discount_code,
                                        payment.discount_price || 0,
                                        discount
                                    );
                                    console.log('✅ Discount application recorded successfully');
                                } catch (error) {
                                    console.error('❌ Failed to record discount application:', error);
                                    // Don't fail the subscription creation if discount recording fails
                                }
                            }

                            // Update User Subscription Status
                            const userIdStr = (userId && (userId as any)._id) ? (userId as any)._id.toString() : userId.toString();
                            const userDoc = await this.userService.findOneById(userIdStr);
                            if (userDoc) {
                                (userDoc as any).is_subscribe = true;
                                (userDoc as any).subscription_id = createdSubscription._id;
                                await this.userService.save(userDoc);

                                // Update Company Subscription Status
                                if (userDoc.companyId) {
                                    const companyDoc = await this.companyRepository.findOneById(userDoc.companyId);
                                    if (companyDoc) {
                                        (companyDoc as any).is_subscribe = true;
                                        await this.companyRepository.save(companyDoc);

                                        // Create default location ONLY if the company has no
                                        // locations yet (initial signup). Upgrades / renewals
                                        // must NOT create another "Head Office" — the company
                                        // already has its locations set up.
                                        let existingLocationCount = 0;
                                        try {
                                            existingLocationCount = await this.locationService.countByCompanyId(companyDoc._id.toString());
                                        } catch (countErr) {
                                            console.warn('⚠️ Failed to count existing locations, defaulting to 0:', countErr?.message);
                                        }

                                        if (existingLocationCount === 0) {
                                            try {
                                                console.log('='.repeat(60));
                                                console.log('🏢 [LOCATION CREATION] Initial signup → creating default location');
                                                console.log('Company:', companyDoc.company_name);
                                                console.log('Company ID:', companyDoc._id.toString());
                                                console.log('User ID:', userIdStr);
                                                console.log('='.repeat(60));

                                                const defaultLocationData = {
                                                    location_name: `${companyDoc.company_name} - Head Office`,
                                                    location_code: 'HQ001',
                                                    description: 'Default head office location',
                                                    contact_name: companyDoc.contact_name,
                                                    email: companyDoc.email,
                                                    mobile: companyDoc.mobile || '',
                                                    country_code: (companyDoc.country_code as any) || null,
                                                    address_line1: companyDoc.address_1 || '',
                                                    address_line2: companyDoc.address_2 || '',
                                                    city: companyDoc.city || '',
                                                    state: companyDoc.state || '',
                                                    postcode: companyDoc.zipcode || '',
                                                    country: companyDoc.country || '',
                                                    timezone: companyDoc.timezone || '',
                                                    currency: companyDoc.currency || '',
                                                    is_default: true,
                                                    is_active: true,
                                                };

                                                const createdLocation = await this.locationService.create(
                                                    companyDoc._id.toString(),
                                                    defaultLocationData,
                                                    userIdStr
                                                );

                                                console.log('✅ Default location created successfully!');
                                                console.log('Location ID:', createdLocation._id);

                                                // Update Company Admin user with location access
                                                try {
                                                    (userDoc as any).access_level = 'company';
                                                    (userDoc as any).accessible_locations = [createdLocation._id];
                                                    await this.userService.save(userDoc);
                                                    console.log('✅ Company Admin access level set to "company"');
                                                } catch (userUpdateError) {
                                                    console.error('⚠️ Failed to update Company Admin access level:', userUpdateError);
                                                }
                                            } catch (locationError) {
                                                console.error('❌ [LOCATION CREATION] FAILED:', locationError?.message);
                                                // Non-blocking - location can be created manually later
                                            }
                                        } else {
                                            console.log(`ℹ️  [LOCATION CREATION] Skipped — company already has ${existingLocationCount} location(s). This is an upgrade/renewal, not initial signup.`);
                                        }
                                    }
                                }
                            }

                            const updatedPayment =
                                await this.paymentRepository.updateById(
                                    payment._id.toString(),
                                    { subscription_id: createdSubscription._id }
                                )

                            // Provision tenant tools ASYNCHRONOUSLY (don't block subscription creation)
                            // This prevents database timeout errors during signup
                            this.provisionToolsAsync(createdSubscription).catch(error => {
                                console.error('❌ Async tool provisioning failed:', error);
                            });

                            // Send admin notification asynchronously (non-blocking)
                            const isUpgrade = activeSubscriptions && activeSubscriptions.length > 0;
                            this.sendAdminCreatedOrUpgradedNotification(createdSubscription, isUpgrade ? 'upgraded' : 'created').catch(error => {
                                console.error('❌ Failed to send admin notification:', error);
                            });

                            paymentData = await this.findOneSort({
                                _id: payment._id,
                            });
                        }

                        // Send appropriate email based on payment type
                        try {
                            const user = await this.userService.findOneById(
                                createdSubscription.user_id
                            );
                            const userName =
                                user?.name ||
                                `${user.first_name} ${user.last_name}`;
                            const planName = plan?.name || 'Subscription Plan';
                            
                            // Check if this is an admin assignment (no immediate payment)
                            const isAdminAssignment = payment?.charge_id?.includes('admin_assigned') || 
                                                    (payment?.status === ENUM_PAYMENT_STATUS.PENDING && !payment?.paid);
                            
                            if (isAdminAssignment) {
                                console.log('📧 Sending admin assignment notification email (no invoice)');
                                
                                // Send upgrade notification email instead of invoice
                                const subject = 'Your Subscription Plan Has Been Updated by Administrator';
                                const context = {
                                    name: userName,
                                    email: user.email,
                                    transation_id: payment?.charge_id || 'N/A',
                                    method: 'Admin Assignment',
                                    gateway: 'System',
                                    postDateTime: new Date().toLocaleDateString(),
                                    status: 'Active',
                                    plan_name: planName,
                                    plan_type: plan?.duration_type,
                                    plan_type_value: plan?.duration,
                                    new_plan: true,
                                    content: `Your subscription plan has been updated by an administrator. The new ${planName} plan is now active. You will be charged on your next billing cycle.${createdSubscription.discount_price > 0 ? ` A discount of $${createdSubscription.discount_price.toFixed(2)} has been applied to your subscription.` : ''}`
                                };

                                await this.nodemailerService.sendEmailWithTemplate(
                                    user?.email,
                                    subject,
                                    'customer_subscription_plan.hjs', // Use customer template with admin assignment context
                                    context
                                );
                                
                                console.log('✅ Admin assignment notification email sent (no invoice generated)');
                            } else {
                                console.log('📧 Sending invoice email for paid subscription');
                                
                                // Generate and send invoice for paid subscriptions
                                const lastPayment = await this.findOneSort(
                                    { soft_delete: false },
                                    'inv_number',
                                    -1
                                );

                                const invoiceNumbers =
                                    this.subscriptionInvoiceHelper.generateInvoiceNumber(
                                        lastPayment?.inv_number || 0
                                    );

                                const invoiceFilePath =
                                    await this.subscriptionInvoiceHelper.generateSubscriptionInvoice(
                                        createdSubscription,
                                        {
                                            inv_number: invoiceNumbers.inv_number,
                                            full_inv_number:
                                                invoiceNumbers.full_inv_number,
                                            special_price:
                                                createdSubscription.total_price,
                                            discount_price: createdSubscription.discount_price,
                                        }
                                    );

                                // Persist invoice details to payment record
                                if (paymentData?._id) {
                                    const invoiceFileName = `invoice-${invoiceNumbers.full_inv_number}.pdf`;
                                    await this.paymentRepository.updateById(paymentData._id.toString(), {
                                        inv_number: invoiceNumbers.inv_number,
                                        full_inv_number: invoiceNumbers.full_inv_number,
                                        inv_path: `invoices/${invoiceFileName}`,
                                    } as Partial<PaymentEntity>);
                                }

                                const amountStr = (createdSubscription.final_price || 0).toFixed(2);
                                const subscriptionLocations = (createdSubscription as any).locations || 1;

                                await this.subscriptionInvoiceHelper.sendInvoiceEmail(
                                    user.email,
                                    userName,
                                    invoiceFilePath,
                                    invoiceNumbers.full_inv_number,
                                    planName,
                                    amountStr,
                                    subscriptionLocations
                                );

                                console.log('✅ Invoice email sent');
                            }
                        } catch (error) {
                            console.error(
                                'Error sending email:',
                                error
                            );
                        }
                    }
                }
            }

            return paymentData;
        } catch (error) {
            console.error('❌ Error in createSubscriptionData:', error);
            console.error('Error stack:', error.stack);
            return null;
        }
    }

    async updateSubscriptionData(payload: ISubscriptionUpdatePayload): Promise<PaymentDoc> {
        const paymentId = payload?.payment_id || '';
        const subscriptionId = payload?.subscription_id || '';
        const payment = await this.findOneSort({ _id: paymentId });
        const subscription = await this.subscriptionService.findOne({
            _id: subscriptionId,
            cancelledAt: null,
        });
        let paymentData = null;

        if (subscription?._id && payment?._id && payment?.paid) {
            paymentData = payment;
            const userId = payment.user_id;

            const nextDate = this.helperDateService.forward(
                subscription.next_date,
                this.helperDateService.createDuration({
                    days: subscription.plan_type_value,
                })
            );
            let endDate = subscription.end_date;

            if (nextDate >= endDate) {
                endDate = this.helperDateService.forward(
                    endDate,
                    this.helperDateService.createDuration({
                        days: subscription.plan_type_value,
                    })
                );

                if (nextDate <= endDate) {
                    await this.subscriptionService.update(subscription, {
                        next_date: nextDate,
                        end_date: endDate,
                    });

                    const userIdStr = (userId && (userId as any)._id) ? (userId as any)._id.toString() : userId.toString();
                    const user = await this.userService.findOneById(userIdStr);
                    // Update User Subscription Status
                    if (user) {
                        const userDoc = user;
                        (userDoc as any).is_subscribe = true;
                        (userDoc as any).subscription_id = subscription._id;
                        await this.userService.save(userDoc);

                        if (userDoc.companyId) {
                            const companyDoc = await this.companyRepository.findOneById(userDoc.companyId);
                            if (companyDoc) {
                                (companyDoc as any).is_subscribe = true;
                                await this.companyRepository.save(companyDoc);
                            }
                        }
                    }

                    const updatedPayment = await this.update(paymentId, {
                        subscription_id: subscription._id?.toString(),
                    });
                    paymentData = await this.findOneSort({
                        _id: updatedPayment._id,
                    });
                }
            }
        }

        return paymentData;
    }

    async processPayPalCardPayment(
        data: PaymentCreateRequestDto
    ): Promise<any> {
        try {
            data.gateway = ENUM_PAYMENT_GATEWAY.PAYPAL;
            data.method = ENUM_PAYMENT_METHOD.CARD;

            const userId = data?.user_id || '';
            const planId = data?.plan_id || '';

            // Get user for reference
            const user = await this.userService.findOneById(userId);

            // Note: Same plan restriction removed - users can now:
            // 1. Re-purchase the same plan after cancellation
            // 2. Upgrade/modify the same plan with different locations/tools
            // The subscription controller will handle cancelling existing active subscriptions

            // IDEMPOTENCY CHECK: Check if a successful payment exists for this user/plan recently (10 mins)
            // This prevents double charging if frontend retries or gets stuck
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            const recentPayment = await this.findOne({
                user_id: userId,
                plan_id: planId,
                status: ENUM_PAYMENT_STATUS.COMPLETED,
                createdAt: { $gte: tenMinutesAgo }
            });

            if (recentPayment) {
                console.log('🔄 Idempotency: Found recent successful payment', recentPayment._id);

                // Self-healing: Ensure user is marked as subscribed if payment exists
                if (recentPayment.subscription_id) {
                    const userDoc = await this.userService.findOneById(userId.toString());
                    if (userDoc && (!userDoc.is_subscribe || !userDoc.subscription_id)) {
                        (userDoc as any).is_subscribe = true;
                        (userDoc as any).subscription_id = recentPayment.subscription_id;
                        await this.userService.save(userDoc);

                        if (userDoc.companyId) {
                            const companyDoc = await this.companyRepository.findOneById(userDoc.companyId);
                            if (companyDoc) {
                                (companyDoc as any).is_subscribe = true;
                                await this.companyRepository.save(companyDoc);
                            }
                        }
                    }
                }

                let finalPaymentForResponse = recentPayment;

                // If subscription failed previously, try to create it now
                if (!recentPayment.subscription_id) {
                    console.log('🔄 Idempotency: Resuming subscription creation for payment', recentPayment._id);
                    const payload = {
                        locations: data?.locations || 1,
                        location_pricing: data?.location_pricing || [],
                        plan_price: data?.plan_price || 0,
                        plan_special_price: data?.plan_special_price || 0,
                        plan_special_price_duration: data?.plan_special_price_duration || 0,
                        tools: data?.tools,
                        tools_price: data?.tools_price || 0,
                        subtotal: data?.subtotal || 0,
                        tax_type: data?.tax_type || '',
                        tax_rate: data?.tax_rate || 0,
                        tax_price: data?.tax_price || 0,
                        total: data?.total || 0,
                        final_price: data?.final_price || 0,
                        discount_code: data?.discount_code || null,
                        discount_price: data?.discount_price || 0,
                    };

                    finalPaymentForResponse = await this.createSubscriptionData(
                        recentPayment._id.toString(),
                        payload
                    );
                }

                // Send success email (duplicated logic from below to ensure user gets it)
                try {
                    const planData = await this.planService.findOne({
                        _id: planId?.toString(),
                    });
                    const subject = 'Your Plan Subscription Purchase Successful.';
                    const context = {
                        name: user.name,
                        email: user.email,
                        transation_id: finalPaymentForResponse._id.toString(),
                        method: finalPaymentForResponse.method,
                        gateway: finalPaymentForResponse.gateway,
                        postDateTime: finalPaymentForResponse.postDateTime,
                        status: finalPaymentForResponse.status,
                        new_plan: true,
                        plan_name: planData?.name ?? 'N/A',
                        plan_type_value: planData?.duration,
                        plan_type: planData?.duration_type,
                        content: 'Thank you for purchasing your subscription. Your account is now protected with our enhanced ransomware protection features and priority support access.',
                    };

                    await this.nodemailerService.sendEmailWithTemplate(
                        user?.email,
                        subject,
                        'customer_subscription_plan.hjs',
                        context
                    );
                } catch (error) { console.error('Idempotency email error:', error); }

                return {
                    payment: finalPaymentForResponse,
                    status: 'completed',
                    message: 'Payment verified successfully (Existing Transaction)',
                };
            }

            const paypalPaymentData = JSON.parse(JSON.stringify(data));
            paypalPaymentData['total'] = data.final_price;

            const createdCharge = await this.paypalService.chargePayPalCard(
                // data,
                paypalPaymentData,
                this.cardService
            );
            if (createdCharge && createdCharge.id) {
                data.request_id = createdCharge?.request_id || null;
                data.response = createdCharge;

                const createdPayment = await this.createPayPalPaymentData(data as unknown as PaymentCreateRequestDto);

                if (createdPayment && createdPayment?._id) {
                    if (
                        createdPayment &&
                        createdPayment?._id &&
                        createdPayment?.status ===
                        ENUM_PAYMENT_STATUS.COMPLETED &&
                        !createdPayment?.subscription_id
                    ) {
                        const payload = {
                            locations: data?.locations || 1,
                            location_pricing: data?.location_pricing || [],
                            plan_price: data?.plan_price || 0,
                            plan_special_price: data?.plan_special_price || 0,
                            plan_special_price_duration: data?.plan_special_price_duration || 0,
                            tools: data?.tools,
                            tools_price: data?.tools_price || 0,
                            subtotal: data?.subtotal || 0,
                            tax_type: data?.tax_type || '',
                            tax_rate: data?.tax_rate || 0,
                            tax_price: data?.tax_price || 0,
                            total: data?.total || 0,
                            final_price: data?.final_price || 0,
                            discount_code: data?.discount_code || null,
                            discount_price: data?.discount_price || 0,
                        };

                        const finalPayment = await this.createSubscriptionData(
                            createdPayment?._id.toString(),
                            payload
                        );
                        try {
                            const planData = await this.planService.findOne({
                                _id: planId?.toString(), //finalPayment?.plan_id?.toString(),
                            });
                            const subject =
                                'Your Plan Subscription Purchase Successful.';
                            const context = {
                                name: user.name,
                                email: user.email,
                                transation_id: createdPayment?._id.toString(),
                                method: createdPayment?.method,
                                gateway: createdPayment?.gateway,
                                postDateTime: createdPayment?.postDateTime,
                                status: createdPayment?.status,
                                new_plan: true,
                                plan_name: planData?.name ?? 'N/A',
                                plan_type_value: planData?.duration,
                                plan_type: planData?.duration_type,
                                content:
                                    'Thank you for purchasing your subscription. Your account is now protected with our enhanced ransomware protection features and priority support access.',
                            };

                            await this.nodemailerService.sendEmailWithTemplate(
                                user?.email,
                                subject,
                                'customer_subscription_plan.hjs',
                                context
                            );
                        } catch (error) { }
                        return {
                            payment: finalPayment,
                            status: 'completed',
                            message: 'Payment completed successfully',
                        };
                    } else if (
                        createdPayment &&
                        createdPayment._id &&
                        createdPayment.status === ENUM_PAYMENT_STATUS.PENDING
                    ) {
                        return {
                            payment: createdPayment,
                            status: 'pending',
                            message: 'Payment is pending',
                        };
                    } else if (
                        createdPayment &&
                        createdPayment._id &&
                        createdPayment.status === ENUM_PAYMENT_STATUS.FAILED
                    ) {
                        try {
                            const subject =
                                'Your Plan Subscription Purchase Failed.';
                            const context = {
                                name: user.name,
                            };

                            await this.nodemailerService.sendEmailWithTemplate(
                                user?.email,
                                subject,
                                'payment_failed.hjs',
                                context
                            );
                        } catch (error) { }
                        return {
                            payment: createdPayment,
                            status: 'failed',
                            message: 'Payment failed',
                        };
                    } else if (
                        createdPayment &&
                        createdPayment._id &&
                        createdPayment.status === ENUM_PAYMENT_STATUS.DECLINED
                    ) {
                        return {
                            payment: createdPayment,
                            status: 'declined',
                            message: 'Payment declined',
                        };
                    } else {
                        if (createdCharge?.status === 'PAYER_ACTION_REQUIRED') {
                            let redirectConfirm = '';
                            if (
                                createdCharge?.links &&
                                createdCharge.links?.length
                            ) {
                                const links = createdCharge.links;
                                const payerAction = links.find(
                                    x => x.rel === 'payer-action'
                                );
                                if (payerAction && payerAction?.href) {
                                    redirectConfirm = payerAction?.href;
                                }
                            }
                            return {
                                payment: createdPayment,
                                status: 'redirect',
                                message: `Payment requires additional action. Status: ${createdPayment?.status}`,
                                redirectUrl: redirectConfirm,
                            };
                        }
                    }
                }

                return {
                    payment: createdPayment,
                    status: 'created',
                    message: 'Payment created successfully',
                };
            }

            throw new HttpException(
                'Payment processing failed',
                HttpStatus.BAD_REQUEST
            );
        } catch (error) {
            throw new HttpException(
                error.message || 'Payment processing error',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async processPayPalCardPaymentForSubscriptionUpdate(
        data: any
    ): Promise<any> {
        try {
            data.gateway = ENUM_PAYMENT_GATEWAY.PAYPAL;
            data.method = ENUM_PAYMENT_METHOD.CARD;

            const userId = data?.user_id?._id || data?.user_id || '';
            const planId = data?.plan_id || '';

            // Check if user already has an active subscription for the same plan
            const user = await this.userService.findOneById(userId);
            const userSubscription = await this.subscriptionService.findOneById(
                data?.subscription_id
            );
            if (!userSubscription) {
                if (userSubscription?.status === false) {
                    throw new HttpException(
                        'User subscription is not active',
                        HttpStatus.BAD_REQUEST
                    );
                }
            }

            const createdCharge = await this.paypalService.chargePayPalCard(
                data,
                this.cardService
            );
            if (createdCharge && createdCharge.id) {
                data.request_id = createdCharge?.request_id || null;
                data.response = createdCharge;

                const createdPayment = await this.createPayPalPaymentData(data as unknown as PaymentCreateRequestDto);

                if (createdPayment && createdPayment?._id) {
                    if (
                        createdPayment &&
                        createdPayment?._id &&
                        createdPayment?.status ===
                        ENUM_PAYMENT_STATUS.COMPLETED &&
                        !createdPayment?.subscription_id
                    ) {
                        return {
                            payment: createdPayment,
                            status: 'completed',
                            message: 'Payment completed successfully',
                        };
                    } else if (
                        createdPayment &&
                        createdPayment._id &&
                        createdPayment.status === ENUM_PAYMENT_STATUS.PENDING
                    ) {
                        return {
                            payment: createdPayment,
                            status: 'pending',
                            message: 'Payment is pending',
                        };
                    } else if (
                        createdPayment &&
                        createdPayment._id &&
                        createdPayment.status === ENUM_PAYMENT_STATUS.FAILED
                    ) {
                        try {
                            const subject =
                                'Your Plan Subscription Purchase Failed.';
                            const context = {
                                name: user.name,
                            };

                            await this.nodemailerService.sendEmailWithTemplate(
                                user?.email,
                                subject,
                                'payment_failed.hjs',
                                context
                            );
                        } catch (error) { }
                        return {
                            payment: createdPayment,
                            status: 'failed',
                            message: 'Payment failed',
                        };
                    } else if (
                        createdPayment &&
                        createdPayment._id &&
                        createdPayment.status === ENUM_PAYMENT_STATUS.DECLINED
                    ) {
                        return {
                            payment: createdPayment,
                            status: 'declined',
                            message: 'Payment declined',
                        };
                    } else {
                        if (createdCharge?.status === 'PAYER_ACTION_REQUIRED') {
                            let redirectConfirm = '';
                            if (
                                createdCharge?.links &&
                                createdCharge.links?.length
                            ) {
                                const links = createdCharge.links;
                                const payerAction = links.find(
                                    x => x.rel === 'payer-action'
                                );
                                if (payerAction && payerAction?.href) {
                                    redirectConfirm = payerAction?.href;
                                }
                            }
                            return {
                                payment: createdPayment,
                                status: 'redirect',
                                message: `Payment requires additional action. Status: ${createdPayment?.status}`,
                                redirectUrl: redirectConfirm,
                            };
                        }
                    }
                }

                return {
                    payment: createdPayment,
                    status: 'created',
                    message: 'Payment created successfully',
                };
            }
            // }

            throw new HttpException(
                'Payment processing failed',
                HttpStatus.BAD_REQUEST
            );
        } catch (error) {
            throw new HttpException(
                error.message || 'Payment processing error',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async processPayPalCardPaymentForSubscriptionUpdateByAdmin(
        data: any
    ): Promise<any> {
        try {
            data.gateway = ENUM_PAYMENT_GATEWAY.PAYPAL;
            data.method = ENUM_PAYMENT_METHOD.CARD;

            const userId = data?.user_id?._id || data?.user_id || '';
            const planId = data?.plan_id || '';

            // Check if user already has an active subscription for the same plan
            const user = await this.userService.findOneById(userId);

            const card_id = data?.card_id || '';

            if (card_id) {
                // console.log('card_id======>', card_id);
                const card = await this.cardService.findOneById(card_id);
                if (!card) {
                    throw new HttpException(
                        'Card not found',
                        HttpStatus.BAD_REQUEST
                    );
                }
                if (card.user_id.toString() !== userId) {
                    // console.log('card.user_id.toString() !== userId');
                    throw new HttpException(
                        'Unauthorized access to card',
                        HttpStatus.UNAUTHORIZED
                    );
                }

                const CardToken = card.token_id;
                const paymentData = {
                    _id: uuidv4(),
                    currency: 'USD',
                    total: data.total,
                    card_token_id: CardToken,
                    redirect_url: data.redirect_url ?? 'http://localhost.com',
                    type: 'PAYMENT_TOKEN',
                    lang: 'en',
                };
                const payPalConfig =
                    await this.paypalService.getPayPalCredentials();
                const accessToken = await this.paypalService.getAccessToken({
                    _id: paymentData?._id,
                    lang: paymentData?.lang,
                    ...payPalConfig,
                });
                const createdCharge =
                    await this.paypalService.checkoutPaymentOrder(
                        accessToken,
                        paymentData
                    );

                if (createdCharge && createdCharge.id) {
                    data.request_id = createdCharge?.request_id || null;
                    data.response = createdCharge;

                    const createdPayment =
                        await this.createPayPalPaymentData(data);

                    if (createdPayment && createdPayment?._id) {
                        if (
                            createdPayment &&
                            createdPayment?._id &&
                            createdPayment?.status ===
                            ENUM_PAYMENT_STATUS.COMPLETED &&
                            !createdPayment?.subscription_id
                        ) {
                            const payload = {
                                price: data?.price,
                                total: data?.total || 0,
                                tax_value: data?.tax_value || 0,
                                final_price: data?.final_price || 0,
                                special_price: data?.special_price || 0,
                                special_price_duration:
                                    data?.special_price_duration || 0,
                                tools: data?.tools,
                                tools_total: data?.tools_price,
                                platfrom_price: data?.platform_fee,
                                discount_code: data?.discount_code || null,
                            };

                            const finalPayment =
                                await this.createSubscriptionData(
                                    createdPayment?._id.toString(),
                                    payload
                                );
                            try {
                                const planData = await this.planService.findOne(
                                    {
                                        _id: planId?.toString(), //finalPayment?.plan_id?.toString(),
                                    }
                                );
                                const subject =
                                    'Your Plan Subscription Purchase Successful.';
                                const context = {
                                    name: user.name,
                                    email: user.email,
                                    transation_id:
                                        createdPayment?._id.toString(),
                                    method: createdPayment?.method,
                                    gateway: createdPayment?.gateway,
                                    postDateTime: createdPayment?.postDateTime,
                                    status: createdPayment?.status,
                                    new_plan: true,
                                    plan_name: planData?.name ?? 'N/A',
                                    plan_type_value: planData?.duration,
                                    plan_type: planData?.duration_type,
                                    content:
                                        'Thank you for purchasing your subscription. Your account is now protected with our enhanced ransomware protection features and priority support access.',
                                };

                                await this.nodemailerService.sendEmailWithTemplate(
                                    user?.email,
                                    subject,
                                    'customer_subscription_plan.hjs',
                                    context
                                );
                            } catch (error) { }
                            return {
                                payment: finalPayment,
                                status: 'completed',
                                message: 'Payment completed successfully',
                            };
                        } else if (
                            createdPayment &&
                            createdPayment._id &&
                            createdPayment.status ===
                            ENUM_PAYMENT_STATUS.PENDING
                        ) {
                            return {
                                payment: createdPayment,
                                status: 'pending',
                                message: 'Payment is pending',
                            };
                        } else if (
                            createdPayment &&
                            createdPayment._id &&
                            createdPayment.status === ENUM_PAYMENT_STATUS.FAILED
                        ) {
                            try {
                                const subject =
                                    'Your Plan Subscription Purchase Failed.';
                                const context = {
                                    name: user.name,
                                };

                                await this.nodemailerService.sendEmailWithTemplate(
                                    user?.email,
                                    subject,
                                    'payment_failed.hjs',
                                    context
                                );
                            } catch (error) { }
                            return {
                                payment: createdPayment,
                                status: 'failed',
                                message: 'Payment failed',
                            };
                        } else if (
                            createdPayment &&
                            createdPayment._id &&
                            createdPayment.status ===
                            ENUM_PAYMENT_STATUS.DECLINED
                        ) {
                            return {
                                payment: createdPayment,
                                status: 'declined',
                                message: 'Payment declined',
                            };
                        } else {
                            if (
                                createdCharge?.status ===
                                'PAYER_ACTION_REQUIRED'
                            ) {
                                let redirectConfirm = '';
                                if (
                                    createdCharge?.links &&
                                    createdCharge.links?.length
                                ) {
                                    const links = createdCharge.links;
                                    const payerAction = links.find(
                                        x => x.rel === 'payer-action'
                                    );
                                    if (payerAction && payerAction?.href) {
                                        redirectConfirm = payerAction?.href;
                                    }
                                }
                                return {
                                    payment: createdPayment,
                                    status: 'redirect',
                                    message: `Payment requires additional action. Status: ${createdPayment?.status}`,
                                    redirectUrl: redirectConfirm,
                                };
                            }
                        }
                    }

                    return {
                        payment: createdPayment,
                        status: 'created',
                        message: 'Payment created successfully',
                    };
                }
            }

            throw new HttpException(
                'Payment processing failed',
                HttpStatus.BAD_REQUEST
            );
        } catch (error) {
            throw new HttpException(
                error.message || 'Payment processing error',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async processPayPalCardTokenPayment(data: IPayPalCardPaymentRequest): Promise<IPaymentResponse> {
        try {
            data.gateway = ENUM_PAYMENT_GATEWAY.PAYPAL;
            data.method = ENUM_PAYMENT_METHOD.CARD;

            const userId = String(data?.user_id || '');

            // Check if user already has an active subscription for the same plan
            const user = await this.userService.findOneById(userId);
            const userSubscription = await this.subscriptionService.findOneById(
                String(data?.subscription_id || '')
            );
            if (!userSubscription) {
                if (userSubscription?.status === false) {
                    throw new HttpException(
                        'User subscription is not active',
                        HttpStatus.BAD_REQUEST
                    );
                }
            }
            const card = await this.cardService.findOneSort({
                user_id: userId,
            });
            if (!card) {
                throw new HttpException(
                    'Card not found',
                    HttpStatus.BAD_REQUEST
                );
            }
            if (card.user_id.toString() !== userId) {
                // console.log('card.user_id.toString() !== userId');
                throw new HttpException(
                    'Unauthorized access to card',
                    HttpStatus.UNAUTHORIZED
                );
            }

            const CardToken = card.token_id;
            const paymentData = {
                _id: uuidv4(),
                currency: data.currency,
                total: data.total,
                card_token_id: CardToken,
                redirect_url: data.redirect_url ?? 'http://localhost.com',
                type: 'PAYMENT_TOKEN',
                lang: 'en',
            };
            const payPalConfig =
                await this.paypalService.getPayPalCredentials();
            const accessToken = await this.paypalService.getAccessToken({
                _id: paymentData?._id,
                lang: paymentData?.lang,
                ...payPalConfig,
            });
            const createdCharge = await this.paypalService.checkoutPaymentOrder(
                accessToken,
                paymentData
            );

            if (createdCharge && createdCharge.id) {
                data.request_id = createdCharge?.request_id || null;
                data.response = createdCharge;

                const createdPayment = await this.createPayPalPaymentData(data as unknown as PaymentCreateRequestDto);

                if (createdPayment && createdPayment?._id) {
                    if (
                        createdPayment &&
                        createdPayment?._id &&
                        createdPayment?.status ===
                        ENUM_PAYMENT_STATUS.COMPLETED &&
                        !createdPayment?.subscription_id
                    ) {
                        return {
                            payment: createdPayment,
                            status: 'completed',
                            message: 'Payment completed successfully',
                        };
                    } else if (
                        createdPayment &&
                        createdPayment._id &&
                        createdPayment.status === ENUM_PAYMENT_STATUS.PENDING
                    ) {
                        return {
                            payment: createdPayment,
                            status: 'pending',
                            message: 'Payment is pending',
                        };
                    } else if (
                        createdPayment &&
                        createdPayment._id &&
                        createdPayment.status === ENUM_PAYMENT_STATUS.FAILED
                    ) {
                        try {
                            const subject =
                                'Your Plan Subscription Purchase Failed.';
                            const context = {
                                name: user.name,
                            };

                            await this.nodemailerService.sendEmailWithTemplate(
                                user?.email,
                                subject,
                                'payment_failed.hjs',
                                context
                            );
                        } catch (error) { }
                        return {
                            payment: createdPayment,
                            status: 'failed',
                            message: 'Payment failed',
                        };
                    } else if (
                        createdPayment &&
                        createdPayment._id &&
                        createdPayment.status === ENUM_PAYMENT_STATUS.DECLINED
                    ) {
                        return {
                            payment: createdPayment,
                            status: 'declined',
                            message: 'Payment declined',
                        };
                    } else {
                        if (createdCharge?.status === 'PAYER_ACTION_REQUIRED') {
                            let redirectConfirm = '';
                            if (
                                createdCharge?.links &&
                                createdCharge.links?.length
                            ) {
                                const links = createdCharge.links;
                                const payerAction = links.find(
                                    x => x.rel === 'payer-action'
                                );
                                if (payerAction && payerAction?.href) {
                                    redirectConfirm = payerAction?.href;
                                }
                            }
                            return {
                                payment: createdPayment,
                                status: 'redirect',
                                message: `Payment requires additional action. Status: ${createdPayment?.status}`,
                                redirectUrl: redirectConfirm,
                            };
                        }
                    }
                }

                return {
                    payment: createdPayment,
                    status: 'created',
                    message: 'Payment created successfully',
                };
            }
            throw new HttpException(
                'Payment processing failed',
                HttpStatus.BAD_REQUEST
            );
        } catch (error) {
            throw new HttpException(
                error.message || 'Payment processing error',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Process recurring payment using Stripe saved card/payment method
     * Used by cron jobs for automatic recurring charges
     */
    async processStripeCardTokenPayment(data: any): Promise<IPaymentResponse> {
        try {
            data.gateway = ENUM_PAYMENT_GATEWAY.STRIPE;
            data.method = ENUM_PAYMENT_METHOD.CARD;

            const userId = String(data?.user_id || '');

            // Check if user and subscription exist
            const user = await this.userService.findOneById(userId);
            if (!user) {
                throw new HttpException('User not found', HttpStatus.NOT_FOUND);
            }

            const userSubscription = await this.subscriptionService.findOneById(
                String(data?.subscription_id || '')
            );
            if (!userSubscription) {
                throw new HttpException('Subscription not found', HttpStatus.NOT_FOUND);
            }
            if (userSubscription?.status === false) {
                throw new HttpException('User subscription is not active', HttpStatus.BAD_REQUEST);
            }

            // Get user's saved Stripe card
            const card = await this.cardService.findOneSort({
                user_id: userId,
                gateway: 'stripe',
            });

            if (!card) {
                throw new HttpException('Stripe card not found for user', HttpStatus.BAD_REQUEST);
            }

            if (card.user_id.toString() !== userId) {
                throw new HttpException('Unauthorized access to card', HttpStatus.UNAUTHORIZED);
            }

            // Get Stripe customer ID and payment method
            // card_id stores the Stripe customer ID (cus_xxx)
            // token_id stores the Stripe payment method ID (pm_xxx)
            const stripeCustomerId = card.card_id || card.response?.customer;
            const paymentMethodId = card.token_id || card.response?.id;

            if (!stripeCustomerId || !paymentMethodId) {
                throw new HttpException('Invalid Stripe card data', HttpStatus.BAD_REQUEST);
            }

            // Calculate amount in cents (Stripe requires cents)
            const currency = data.currency || this.configService.get<string>('stripe.currency') || 'USD';
            const amount = Math.round((data.final_price || data.total || 0) * 100);

            if (amount <= 0) {
                throw new HttpException('Invalid payment amount', HttpStatus.BAD_REQUEST);
            }

            console.log(`Processing Stripe recurring payment: ${amount / 100} ${currency} for user ${userId}`);

            // Use chargePaymentMethod for off-session recurring payments
            const paymentIntent = await this.stripeService.chargePaymentMethod(
                data.final_price || data.total || 0, // Amount in dollars (method converts to cents)
                currency,
                stripeCustomerId,
                paymentMethodId,
                {
                    subscription_id: data.subscription_id?.toString() || '',
                    user_id: userId,
                    plan_id: data.plan_id?.toString() || '',
                    type: 'recurring_payment',
                }
            );

            // Process result
            const planPrice = data.plan_price || data.price || 0;
            const toolsPrice = data.tools_price || 0;
            const subtotal = planPrice + toolsPrice;
            const taxPrice = data.tax_value || 0;
            const finalPrice = data.final_price || data.total || 0;

            if (paymentIntent.status === 'succeeded') {
                // Create payment record using the service create method
                const paymentRecord = await this.create({
                    user_id: userId,
                    company_id: data.company_id?.toString() || '',
                    plan_id: data.plan_id?.toString() || '',
                    locations: data.locations || 1,
                    location_pricing: [],
                    plan_price: planPrice,
                    plan_special_price: 0,
                    plan_special_price_duration: 0,
                    plan_special_price_remaining: 0,
                    tools_price: toolsPrice,
                    subtotal: subtotal,
                    tax_type: '',
                    tax_rate: 0,
                    tax_price: taxPrice,
                    total: subtotal,
                    final_price: finalPrice,
                    discount_price: data.discount_price || 0,
                    discount_code: null,
                    response: await this.stripeService.buildEnrichedPaymentResponse(paymentIntent),
                    charge_id: paymentIntent.id,
                    request_id: null,
                    gateway: ENUM_PAYMENT_GATEWAY.STRIPE,
                    method: ENUM_PAYMENT_METHOD.CARD,
                    paid: true,
                    postDateTime: new Date().toDateString(),
                    status: ENUM_PAYMENT_STATUS.COMPLETED,
                    tools: data.tools || [],
                });

                console.log(`Stripe recurring payment successful: ${paymentIntent.id}`);

                return {
                    payment: paymentRecord,
                    status: 'completed',
                    transaction_id: paymentIntent.id,
                    payment_intent_id: paymentIntent.id,
                    message: 'Stripe recurring payment completed successfully',
                };
            } else if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_payment_method') {
                // Payment requires authentication - for recurring this is typically a failure
                console.warn(`Stripe recurring payment requires action: ${paymentIntent.status}`);

                // Create failed payment record
                const paymentRecord = await this.create({
                    user_id: userId,
                    company_id: data.company_id?.toString() || '',
                    plan_id: data.plan_id?.toString() || '',
                    locations: data.locations || 1,
                    location_pricing: [],
                    plan_price: planPrice,
                    plan_special_price: 0,
                    plan_special_price_duration: 0,
                    plan_special_price_remaining: 0,
                    tools_price: toolsPrice,
                    subtotal: subtotal,
                    tax_type: '',
                    tax_rate: 0,
                    tax_price: taxPrice,
                    total: subtotal,
                    final_price: finalPrice,
                    discount_price: 0,
                    discount_code: null,
                    response: { paymentIntent: paymentIntent.id, status: paymentIntent.status },
                    charge_id: paymentIntent.id,
                    request_id: null,
                    gateway: ENUM_PAYMENT_GATEWAY.STRIPE,
                    method: ENUM_PAYMENT_METHOD.CARD,
                    paid: false,
                    postDateTime: new Date().toDateString(),
                    status: ENUM_PAYMENT_STATUS.FAILED,
                    tools: [],
                });

                return {
                    payment: paymentRecord,
                    status: 'failed',
                    message: `Payment requires authentication (${paymentIntent.status}). Customer must update payment method.`,
                };
            } else {
                // Other failure states
                const paymentRecord = await this.create({
                    user_id: userId,
                    company_id: data.company_id?.toString() || '',
                    plan_id: data.plan_id?.toString() || '',
                    locations: data.locations || 1,
                    location_pricing: [],
                    plan_price: planPrice,
                    plan_special_price: 0,
                    plan_special_price_duration: 0,
                    plan_special_price_remaining: 0,
                    tools_price: toolsPrice,
                    subtotal: subtotal,
                    tax_type: '',
                    tax_rate: 0,
                    tax_price: taxPrice,
                    total: subtotal,
                    final_price: finalPrice,
                    discount_price: 0,
                    discount_code: null,
                    response: { paymentIntent: paymentIntent.id, status: paymentIntent.status },
                    charge_id: paymentIntent.id,
                    request_id: null,
                    gateway: ENUM_PAYMENT_GATEWAY.STRIPE,
                    method: ENUM_PAYMENT_METHOD.CARD,
                    paid: false,
                    postDateTime: new Date().toDateString(),
                    status: ENUM_PAYMENT_STATUS.FAILED,
                    tools: [],
                });

                return {
                    payment: paymentRecord,
                    status: 'failed',
                    message: `Payment failed with status: ${paymentIntent.status}`,
                };
            }
        } catch (error) {
            console.error(`Stripe recurring payment error: ${error.message}`);
            throw new HttpException(
                error.message || 'Stripe recurring payment processing error',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async addToolsToSubscription(
        subscriptionId: string,
        tools: Array<{
            _id: string;
            name: string;
            slug?: string;
            base_price?: number;
            pricing_mode?: string;
            location_multiplier?: number;
            calculated_price?: number;
            is_mandatory?: boolean;
            display_order?: number;
            price?: number; // Legacy
        }>,
        paymentData: {
            cardId?: string;
            cardDetails?: {
                holder_name: string;
                card_number: string;
                expiry_month: string;
                expiry_year: string;
                cvv: string;
            };
        },
        userId: string,
        cardService: any
        // paymentService: any
    ): Promise<{
        success: boolean;
        subscription: SubscriptionDoc;
        payment: any;
        provisioning: {
            status: string;
            toolsProvisioned: number;
            errors?: string[];
        };
        message: string;
    }> {
        try {
            // Step 1: Validate subscription and authorization
            // console.log('Step 1: Validating subscription and authorization');
            const subscription =
                await this.subscriptionService.validateSubscriptionUpdate(
                    subscriptionId,
                    userId
                );

            // Step 2: Validate tool selection
            // console.log('Step 2: Validating tool selection');
            const validatedTools =
                await this.subscriptionService.validateToolSelection(
                    tools,
                    subscription
                );

            // Step 3: Calculate pricing
            // console.log('Step 3: Calculating pricing');
            const pricing =
                this.subscriptionService.calculateToolAdditionPricing(
                    subscription,
                    validatedTools
                );

            // Step 4: Resolve payment method
            // console.log('Step 4: Resolving payment method');
            // const card = await this.subscriptionService.resolvePaymentMethod(
            //     paymentData,
            //     userId,
            //     cardService
            // );

            // // Validate card object
            // if (!card || !card._id) {
            //     console.error(
            //         'Invalid card object returned from resolvePaymentMethod'
            //     );
            //     throw new Error('Failed to resolve payment method');
            // }
            const card = {
                // _id: paymentData.cardId,
                holder_name: paymentData?.cardDetails?.holder_name,
                card_number: paymentData?.cardDetails?.card_number,
                expiry_month: paymentData?.cardDetails?.expiry_month,
                expiry_year: paymentData?.cardDetails?.expiry_year,
                card_cvv: paymentData?.cardDetails?.cvv,
                lang: 'en',
            };

            // Step 5: Process payment
            // console.log('Step 5: Processing payment');
            const newToolsPrice: number = validatedTools.reduce(
                (sum, tool) => sum + tool.price,
                0
            );
            const taxRate: number =
                this.configService.get<number>('TAX_VALUE') || 0;
            const taxValue: number = (newToolsPrice * taxRate) / 100;
            const totalAmount: number = newToolsPrice + taxValue;

            const userData = await this.userService.findOneById(userId);
            const cardDetails = {};
            // Prepare payment request data with proper types
            const paymentRequestData: {
                user_id: {
                    _id: string;
                    name: string;
                    email: string;
                    mobile: string;
                };
                company_id: string;
                plan_id: string;
                subscription_id: string;
                card_id?: string;
                card_details: any;
                price: number;
                final_price: number;
                tax_value: number;
                total: number;
                tools: Array<{
                    _id: string;
                    name: string;
                    price: number;
                    slug: string;
                }>;
                gateway: string;
                method: string;

                _id?: string;
                holder_name?: string;
                card_number?: string;
                expiry_month?: string;
                expiry_year?: string;
                card_cvv?: string;
                lang?: string;
            } = {
                user_id: {
                    _id: userData?._id?.toString() || userId,
                    name:
                        userData.name ??
                        userData.first_name + ' ' + userData.last_name,
                    email: userData.email,
                    mobile: userData?.mobile ?? '',
                },
                company_id: subscription.company_id.toString(),
                plan_id: subscription.plan_id.toString(),
                subscription_id: subscriptionId,
                card_id: paymentData?.cardId,
                price: Number(newToolsPrice.toFixed(2)),
                final_price: Number(newToolsPrice.toFixed(2)),
                tax_value: Number(taxValue.toFixed(2)),
                total: Number(totalAmount.toFixed(2)),
                tools: validatedTools,
                gateway: 'paypal',
                method: 'card',
                card_details: '',

                _id: Date.now()?.toString(), //card?._id?.toString(),
                holder_name: card.holder_name,
                card_number: card.card_number,
                expiry_month: card.expiry_month,
                expiry_year: card.expiry_year,
                card_cvv: card.card_cvv,
                lang: card.lang,
            };

            // Use the new payment method for subscription updates
            const paymentResult =
                await this.processPayPalCardPaymentForSubscriptionUpdate(
                    paymentRequestData
                );

            // Validate payment result
            if (!paymentResult || typeof paymentResult !== 'object') {
                console.error('Invalid payment result received');
                throw new Error('Payment processing failed. Invalid response.');
            }

            const paymentStatus: string = paymentResult.status || '';

            // Handle different payment statuses
            if (paymentStatus === 'completed') {
                // console.log(
                //     `Payment completed successfully: ${paymentResult.payment?._id}`
                // );
            } else if (paymentStatus === 'pending') {
                console.warn('Payment is pending');
                throw new Error(
                    'Payment is pending. Please wait for confirmation.'
                );
            } else if (paymentStatus === 'failed') {
                console.error('Payment failed');
                throw new Error(
                    'Payment failed. Please try again or use a different payment method.'
                );
            } else if (paymentStatus === 'declined') {
                console.error('Payment declined');
                throw new Error(
                    'Payment was declined. Please check your payment details.'
                );
            } else if (paymentStatus === 'redirect') {
                console.warn('Payment requires additional action');
                const redirectUrl: string = paymentResult.redirectUrl || '';
                throw new Error(
                    `Payment requires additional action.${redirectUrl ? ' Please complete the payment at: ' + redirectUrl : ''}`
                );
            } else {
                console.error(`Unexpected payment status: ${paymentStatus}`);
                throw new Error('Payment processing failed. Please try again.');
            }

            // Validate payment object
            if (!paymentResult.payment || !paymentResult.payment._id) {
                console.error('Payment object is missing or invalid');
                throw new Error(
                    'Payment processing failed. Invalid payment record.'
                );
            }

            console.log(
                `Payment processed successfully: ${paymentResult.payment._id}`
            );

            // Step 6: Update subscription document
            // console.log('Step 6: Updating subscription document');
            const updatedSubscription =
                await this.subscriptionService.updateSubscriptionWithTools(
                    subscription,
                    validatedTools,
                    pricing
                );

            // Step 7: Provision tools for tenant
            // console.log('Step 7: Provisioning tools for tenant');
            let provisioningResult: {
                status: string;
                toolsProvisioned: number;
                errors?: string[];
            } = {
                status: 'success',
                toolsProvisioned: validatedTools.length,
                errors: [],
            };

            try {
                // Update provisioning status to provisioning
                await this.subscriptionService.updateSubscriptionProvisioningStatus(
                    subscriptionId,
                    'provisioning'
                );

                // Provision tools
                const result =
                    await this.toolProvisioningService.provisionToolsForSubscription(
                        updatedSubscription
                    );

                // Validate provisioning result
                if (!result || typeof result !== 'object') {
                    throw new Error('Invalid provisioning result');
                }

                const provisioningStatus: string = result.status || 'failed';

                if (provisioningStatus === 'success') {
                    await this.subscriptionService.updateSubscriptionProvisioningStatus(
                        subscriptionId,
                        'provisioned'
                    );
                    provisioningResult.status = 'success';
                    provisioningResult.toolsProvisioned = Array.isArray(
                        result.provisionedTools
                    )
                        ? result.provisionedTools.length
                        : 0;
                } else {
                    const errorMessages: string[] = Array.isArray(result.errors)
                        ? result.errors
                        : [];
                    await this.subscriptionService.updateSubscriptionProvisioningStatus(
                        subscriptionId,
                        'failed',
                        errorMessages.join(', ')
                    );
                    provisioningResult.status = 'partial';
                    provisioningResult.errors = errorMessages;
                }
            } catch (provisioningError) {
                const errorMessage: string =
                    provisioningError?.message || 'Unknown provisioning error';
                console.error(
                    `Tool provisioning failed: ${errorMessage}`,
                    provisioningError.stack
                );
                await this.subscriptionService.updateSubscriptionProvisioningStatus(
                    subscriptionId,
                    'failed',
                    errorMessage
                );
                provisioningResult.status = 'failed';
                provisioningResult.errors = [errorMessage];
            }

            // updatedSubscription
            try {
                const lastPayment = await this.findOneSort(
                    { soft_delete: false },
                    'inv_number',
                    -1
                );

                const invoiceNumbers =
                    this.subscriptionInvoiceHelper.generateInvoiceNumber(
                        lastPayment?.inv_number || 0
                    );

                const invoiceFilePath =
                    await this.subscriptionInvoiceHelper.generateSubscriptionInvoice(
                        updatedSubscription,
                        {
                            inv_number: invoiceNumbers.inv_number,
                            full_inv_number: invoiceNumbers.full_inv_number,
                            special_price: updatedSubscription.total_price,
                            discount_price: 0,
                        }
                    );

                // Persist invoice details to payment record
                if (paymentResult?.payment?._id) {
                    const invoiceFileName = `invoice-${invoiceNumbers.full_inv_number}.pdf`;
                    await this.paymentRepository.updateById(paymentResult.payment._id.toString(), {
                        inv_number: invoiceNumbers.inv_number,
                        full_inv_number: invoiceNumbers.full_inv_number,
                        inv_path: `invoices/${invoiceFileName}`,
                    } as Partial<PaymentEntity>);
                }

                const user = await this.userService.findOneById(
                    updatedSubscription.user_id
                );
                const userName =
                    user?.name || `${user.first_name} ${user.last_name}`;
                const plan = await this.planService.findOneById(updatedSubscription.plan_id.toString());
                const planName = plan?.name || 'Tool Addition';
                const amountStr = (updatedSubscription.total_price || 0).toFixed(2);
                const subscriptionLocations = (updatedSubscription as any).locations || 1;

                await this.subscriptionInvoiceHelper.sendInvoiceEmail(
                    user.email,
                    userName,
                    invoiceFilePath,
                    invoiceNumbers.full_inv_number,
                    planName,
                    amountStr,
                    subscriptionLocations
                );
            } catch (error) {
                console.error('Error sending invoice email:', error);
            }

            // Step 8: Invalidate cache
            await this.subscriptionService.invalidateCache(
                userId,
                subscriptionId
            );

            // Step 9: Send confirmation email (optional - don't fail if email fails)
            try {
                const user = await this.userService.findOneById(userId);
                if (user && user.email && typeof user.email === 'string') {
                    const toolNames: string = validatedTools
                        .map(t => t.name)
                        .join(', ');
                    // Note: Email template would need to be created
                    // await this.emailService.sendToolAdditionConfirmation(user.email, {
                    //     userName: user.name,
                    //     toolNames,
                    //     amount: newToolsPrice,
                    //     subscriptionId,
                    // });
                    console.log(
                        `Email notification prepared for ${user.email}`
                    );
                }
            } catch (emailError) {
                const errorMessage: string =
                    emailError?.message || 'Unknown email error';
                console.warn(
                    `Failed to send email notification: ${errorMessage}`
                );
                // Don't fail the operation if email fails
            }

            // console.log(
            //     `Successfully added ${validatedTools.length} tools to subscription ${subscriptionId}`
            // );

            return {
                success: true,
                subscription: updatedSubscription,
                payment: paymentResult.payment,
                provisioning: provisioningResult,
                message: 'Tools added successfully to subscription',
            };
        } catch (error) {
            // console.error(
            //     `Failed to add tools to subscription ${subscriptionId}: ${error.message}`,
            //     error.stack
            // );
            throw error;
        }
    }
    async confirmRedirectPayPalPayment(data: IPaymentConfirmationRequest): Promise<IPaymentResponse> {
        try {
            const requestId = data?.request_id || '';
            const state = data?.state || '';
            const action = data?.action || '';
            const subscriptionId = data?.subscription_id || '';

            if (!requestId) {
                throw new HttpException(
                    'Request ID is required',
                    HttpStatus.BAD_REQUEST
                );
            }

            const payment = await this.findOneSort({ request_id: requestId });
            if (!payment || !payment?._id) {
                throw new HttpException(
                    'Payment not found',
                    HttpStatus.NOT_FOUND
                );
            }

            const planId = payment?.plan_id || '';
            const userId = payment.user_id;
            let currentUser = null;
            let createdPayment = null;
            let captureOdrRes = null;
            let subscription = null;

            if (payment?.status === ENUM_PAYMENT_STATUS.COMPLETED) {
                return {
                    payment: payment,
                    status: 'completed',
                    message: 'Payment already completed',
                };
            } else {
                const captureOrder =
                    await this.paypalService.getCaptureCheckoutOrder(payment);
                captureOdrRes = captureOrder;
                const status =
                    captureOrder?.purchase_units?.[0]?.payments?.captures?.[0]
                        ?.status;

                if (
                    captureOrder &&
                    captureOrder?.id &&
                    status === 'COMPLETED'
                ) {
                    await this.update(payment._id.toString(), {
                        response: captureOrder,
                        paid: true,
                        status: ENUM_PAYMENT_STATUS.COMPLETED,
                    });

                    const payload = {
                        locations: payment?.locations || 1,
                        location_pricing: payment?.location_pricing || [],
                        plan_price: payment?.plan_price || 0,
                        plan_special_price: payment?.plan_special_price || 0,
                        plan_special_price_duration: payment?.plan_special_price_duration || 0,
                        tools: data?.tools,
                        tools_price: payment?.tools_price || 0,
                        subtotal: payment?.subtotal || 0,
                        tax_type: payment?.tax_type || '',
                        tax_rate: payment?.tax_rate || 0,
                        tax_price: payment?.tax_price || 0,
                        total: payment?.total || 0,
                        final_price: payment?.final_price || 0,
                        discount_code: data?.discount_code || null,
                        discount_price: payment?.discount_price || 0,
                    };

                    if (subscriptionId) {
                        subscription = await this.updateSubscriptionData({
                            payment_id: payment._id.toString(),
                            subscription_id: subscriptionId,
                        });
                        if (subscription && subscription?._id) {
                            createdPayment = subscription;
                        }
                    }

                    if (!subscription) {
                        createdPayment = await this.createSubscriptionData(
                            payment._id?.toString(),
                            payload
                        );
                    }

                    const updatedPayment = await this.findOneSort({
                        _id: payment._id,
                    });
                    currentUser = await this.userService.findOneById(
                        userId.toString()
                    );

                    return {
                        payment: updatedPayment,
                        user: currentUser,
                        status: 'completed',
                        message: 'Payment completed successfully',
                    };
                }
            }

            let message = 'Payment not completed';
            if (payment?.status === ENUM_PAYMENT_STATUS.FAILED) {
                message = 'Payment failed';
            } else if (payment?.status === ENUM_PAYMENT_STATUS.DECLINED) {
                message = 'Payment declined';
            } else if (payment?.status === ENUM_PAYMENT_STATUS.PENDING) {
                message = 'Payment is pending';
            }

            return {
                payment: payment,
                status: payment?.status || 'unknown',
                message: message,
            };
        } catch (error) {
            throw new HttpException(
                error.message || 'Payment confirmation error',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    // ===================== STRIPE PAYMENT METHODS =====================

    /**
     * Helper method to create Stripe payment record
     */
    async createStripePaymentData(data: any): Promise<PaymentDoc> {
        let createdPayment = null;
        if (data && data?.user_id) {
            const userId = data?.user_id || '';
            let paid = false;
            let status = data?.response?.status || '';

            // Stripe payment intent statuses: succeeded, processing, requires_payment_method, etc.
            if (status) {
                status = status.toLowerCase();
            }
            if (status === 'succeeded') {
                paid = true;
                status = 'completed';
            } else if (status === 'processing') {
                status = 'pending';
            } else if (status === 'requires_payment_method' || status === 'requires_confirmation') {
                status = 'failed';
            } else if (status === 'canceled') {
                status = 'cancelled';
            }

            // New pricing structure - add fallbacks for different field names
            const planPrice = data?.plan_price || data?.platform_fee || data?.price || 0;
            const toolsPrice = data?.tools_price || data?.tools_total || 0;
            const subtotal = data?.subtotal || (planPrice + toolsPrice);
            const discountPrice = data?.discount_price || 0;
            const total = data?.total || (subtotal - discountPrice);
            const taxPrice = data?.tax_price || data?.tax_value || 0;
            const finalPrice = data?.final_price || (total + taxPrice);

            // Special price handling
            const planSpecialPrice = data?.plan_special_price || data?.special_price || 0;
            const planSpecialPriceDuration = parseInt(
                data?.plan_special_price_duration?.toString() || data?.special_price_duration?.toString() || '0'
            );
            let planSpecialPriceRemaining = planSpecialPriceDuration - 1 || 0;
            if (planSpecialPriceRemaining < 0) {
                planSpecialPriceRemaining = 0;
            }

            // Map tools to new structure with full pricing details
            const mappedTools = (data?.tools || []).map((tool: any) => ({
                _id: tool._id,
                name: tool.name,
                slug: tool.slug || '',
                base_price: tool.base_price ?? tool.price ?? 0,
                pricing_mode: tool.pricing_mode || 'fixed',
                location_multiplier: tool.location_multiplier ?? 1.0,
                calculated_price: tool.calculated_price ?? tool.price ?? 0,
                is_mandatory: tool.is_mandatory ?? false,
                display_order: tool.display_order ?? 0,
            }));

            createdPayment = await this.create({
                // References
                user_id: userId,
                company_id: data.company_id,
                plan_id: data.plan_id,

                // Location-based pricing
                locations: data?.locations || 1,
                location_pricing: data?.location_pricing || [],

                // Plan tier values
                plan_price: planPrice,
                plan_special_price: planSpecialPrice,
                plan_special_price_duration: planSpecialPriceDuration,
                plan_special_price_remaining: planSpecialPriceRemaining,

                // Tools
                tools: mappedTools,
                tools_price: toolsPrice,

                // Calculations
                subtotal: subtotal,

                // Discount
                discount_id: data?.discount_id || null,
                discount_code: data?.discount_code || null,
                discount_type: data?.discount_type || null,
                discount_value: data?.discount_value || 0,
                discount_price: discountPrice,
                discount_duration_type: data?.discount_duration_type || null,
                discount_duration_months: data?.discount_duration_months || null,
                discount_remaining_months: data?.discount_remaining_months || null,
                discount_name: data?.discount_name || null,

                // After discount
                total: total,

                // Tax
                tax_type: data?.tax_type || null,
                tax_rate: data?.tax_rate || 0,
                tax_price: taxPrice,

                // Final amount
                final_price: finalPrice,

                // Plan snapshot
                plan_snapshot: data?.plan_snapshot || null,

                // Payment info
                gateway: ENUM_PAYMENT_GATEWAY.STRIPE,
                method: ENUM_PAYMENT_METHOD.CARD,
                charge_id: data?.response?.id || '',
                request_id: data?.request_id || null,
                response: data?.response || null,
                paid: paid,
                postDateTime: new Date().toDateString(),
                status: status as ENUM_PAYMENT_STATUS,
            });
        }
        return createdPayment;
    }

    /**
     * Process Stripe card payment for regular users
     */
    async processStripeCardPayment(data: any): Promise<IStripePaymentResponse> {
        try {
            console.log('🚀 Starting Stripe card payment processing');
            console.log('🔍 Input data:', JSON.stringify({
                user_id: data?.user_id,
                plan_id: data?.plan_id,
                discount_code: data?.discount_code,
                final_price: data?.final_price,
                company_id: data?.company_id
            }, null, 2));
            
            data.gateway = ENUM_PAYMENT_GATEWAY.STRIPE;
            data.method = ENUM_PAYMENT_METHOD.CARD;

            const userId = data?.user_id || '';
            const planId = data?.plan_id || '';
            let paymentMethodId = data?.payment_method_id || '';
            const cardId = data?.card_id || '';

            // Check for stored card usage
            if (cardId) {
                // Retrieve stored card and use its token_id as paymentMethodId
                const storedCard = await this.cardService.findOneById(cardId);
                if (!storedCard) {
                    throw new HttpException(
                        'Stored card not found',
                        HttpStatus.NOT_FOUND
                    );
                }

                // Verify card belongs to user
                if (storedCard.user_id.toString() !== userId.toString()) {
                    throw new HttpException(
                        'Unauthorized access to stored card',
                        HttpStatus.UNAUTHORIZED
                    );
                }

                // Verify card is a Stripe card
                if (storedCard.gateway !== ENUM_PAYMENT_GATEWAY.STRIPE) {
                    throw new HttpException(
                        'Selected card is not a Stripe card',
                        HttpStatus.BAD_REQUEST
                    );
                }

                // Use stored card's token_id as paymentMethodId
                paymentMethodId = storedCard.token_id;
            }

            if (!paymentMethodId) {
                throw new HttpException(
                    'Payment method ID or stored card ID is required',
                    HttpStatus.BAD_REQUEST
                );
            }

            // Get user for reference
            const user = await this.userService.findOneById(userId);

            // Note: Same plan restriction removed - users can now:
            // 1. Re-purchase the same plan after cancellation
            // 2. Upgrade/modify the same plan with different locations/tools
            // The subscription controller will handle cancelling existing active subscriptions

            // IDEMPOTENCY CHECK: Check if a successful payment exists for this user/plan recently (10 mins)
            // But only if no discount code is being applied (discount codes should create new payments)
            if (!data?.discount_code || !data.discount_code.trim()) {
                const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
                const recentPayment = await this.findOne({
                    user_id: userId,
                    plan_id: planId,
                    status: ENUM_PAYMENT_STATUS.COMPLETED,
                    createdAt: { $gte: tenMinutesAgo }
                });

                if (recentPayment) {
                    console.log('🔄 Stripe Idempotency: Found recent successful payment', recentPayment._id);

                    // Self-healing: Ensure user is marked as subscribed
                    if (recentPayment.subscription_id) {
                        const userDoc = await this.userService.findOneById(userId.toString());
                        if (userDoc && (!userDoc.is_subscribe || !userDoc.subscription_id)) {
                            (userDoc as any).is_subscribe = true;
                            (userDoc as any).subscription_id = recentPayment.subscription_id;
                            await this.userService.save(userDoc);

                            if (userDoc.companyId) {
                                const companyDoc = await this.companyRepository.findOneById(userDoc.companyId);
                                if (companyDoc) {
                                    (companyDoc as any).is_subscribe = true;
                                    await this.companyRepository.save(companyDoc);
                                }
                            }
                        }
                    }

                    return {
                        success: true,
                        payment_intent_id: recentPayment.charge_id,
                        status: 'succeeded',
                        requires_action: false,
                        payment_id: recentPayment._id.toString(),
                        subscription_id: recentPayment.subscription_id?.toString() || null,
                    };
                }
            } else {
                console.log('🔍 Discount code provided, skipping idempotency check to allow new payment with discount');
            }

            // Create or get Stripe customer
            const customer = await this.stripeService.createOrGetCustomer(
                userId,
                user.email,
                user.name
            );

            // Attach payment method to customer (skip if using stored card as it's already attached)
            if (!cardId) {
                await this.stripeService.attachPaymentMethod(
                    paymentMethodId,
                    customer.id
                );
            }

            // Get payment method details for card info
            const paymentMethod = await this.stripeService.getPaymentMethod(
                paymentMethodId
            );

            // Get plan details and calculate pricing
            const plan = await this.planService.findOneById(planId);
            if (!plan) {
                throw new HttpException('Plan not found', HttpStatus.NOT_FOUND);
            }

            // Calculate pricing with discount if provided
            // First calculate the base amount: plan price + tools price
            const locationCount = data?.locations || 1;

            // Find the appropriate location pricing tier
            // Sort tiers by locations in descending order and find the first one <= requested locations
            const sortedTiers = [...(plan.location_pricing || [])].sort((a, b) => b.locations - a.locations);
            const matchingTier = sortedTiers.find(tier => tier.locations <= locationCount) || plan.location_pricing?.[0];
            const planPrice = matchingTier?.special_price || matchingTier?.price || 0;

            // Use frontend's tools_price if provided, otherwise calculate
            // Frontend already calculates tools price correctly
            const toolsPrice = data?.tools_price ?? (data?.tools || []).reduce((sum, tool: any) => {
                const toolBasePrice = tool.base_price ?? tool.price ?? 0;
                const pricingMode = tool.pricing_mode || 'fixed';
                const locationMultiplier = tool.location_multiplier || 1.0;

                if (pricingMode === 'multiplier') {
                    // MULTIPLIER mode: base_price × locations × location_multiplier
                    return sum + (toolBasePrice * locationCount * locationMultiplier);
                } else {
                    // FIXED mode: same price regardless of locations
                    return sum + toolBasePrice;
                }
            }, 0);

            const baseAmount = planPrice + toolsPrice;

            console.log('💰 Base Calculation:');
            console.log('   - Locations:', locationCount);
            console.log('   - Plan Price (tier for', matchingTier?.locations || 1, 'locations):', planPrice);
            console.log('   - Tools Price:', toolsPrice);
            console.log('   - Base Amount (Plan + Tools):', baseAmount);
            
            let finalPrice = baseAmount; // Start with base amount
            let discountPrice = 0;
            let discountCode = null;
            let discountId = null;

            // Validate and apply discount code if provided
            if (data?.discount_code && data.discount_code.trim()) {
                console.log('🔍 Processing discount code:', data.discount_code);
                console.log('🔍 Base amount for discount calculation:', baseAmount);
                console.log('🔍 Company ID:', data.company_id);
                console.log('🔍 User ID:', userId);
                
                // Feature flag for discount validation - can be disabled if needed
                const enableDiscountValidation = true;
                
                if (!enableDiscountValidation) {
                    console.log('⚠️ Discount validation disabled, proceeding without validation');
                } else {
                    try {
                        // Check if discount service is available
                        if (!this.discountService) {
                            console.error('❌ DiscountService not available');
                            throw new HttpException(
                                'Discount service unavailable',
                                HttpStatus.SERVICE_UNAVAILABLE
                            );
                        }
                        
                        // Ensure we have valid parameters for discount validation
                        const discountCodeInput = data.discount_code.trim();
                        const amount = baseAmount; // Use base amount (plan + tools) for discount calculation
                        const companyId = data.company_id || null;
                        const userIdForDiscount = userId || null;
                        
                        console.log('🔍 Discount calculation on base amount:', amount);
                        
                        if (amount <= 0) {
                            console.warn('⚠️ Invalid amount for discount calculation');
                            throw new HttpException(
                                'Invalid amount for discount calculation',
                                HttpStatus.BAD_REQUEST
                            );
                        }
                        
                        console.log('🔍 Calling discount service with params:', {
                            discountCode: discountCodeInput,
                            amount,
                            companyId,
                            userIdForDiscount
                        });
                        
                        const discountResult = await this.discountService.validateAndApplyDiscountCode(
                            discountCodeInput,
                            amount,
                            new Date(),
                            companyId,
                            userIdForDiscount
                        );

                        console.log('🔍 Discount validation result:', JSON.stringify(discountResult, null, 2));

                        if (discountResult && discountResult.valid && discountResult.can_apply) {
                            discountPrice = discountResult.discounted_price || 0;
                            finalPrice = discountResult.price || amount;
                            discountCode = discountResult.discount_code;
                            discountId = discountResult.discount_id;

                            // Update data object with calculated values
                            data.discount_price = discountPrice;
                            data.discount_code = discountCode;

                            // Capture discount duration info for invoice/display
                            data.discount_duration_type = discountResult.duration?.type || null;
                            data.discount_duration_months = discountResult.duration?.months || null;
                            data.discount_name = discountResult.discount?.name || null;
                            // Don't override data.final_price - use frontend's calculated value

                            console.log('✅ Discount applied successfully');
                            console.log('💰 Discount Calculation:');
                            console.log('   - Original Amount (Plan + Tools):', amount);
                            console.log('   - Discount Amount:', discountPrice);
                            console.log('   - Final Amount After Discount:', finalPrice);
                            console.log('   - Duration Type:', data.discount_duration_type);
                            console.log('   - Duration Months:', data.discount_duration_months);
                        } else {
                            const errorMessage = discountResult?.message || 'Invalid discount code';
                            console.log('❌ Discount validation failed:', errorMessage);
                            throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
                        }
                    } catch (error) {
                        console.error('❌ Discount validation error:', error);
                        console.error('❌ Error stack:', error.stack);
                        
                        // If it's already an HttpException, re-throw it
                        if (error instanceof HttpException) {
                            throw error;
                        }
                        
                        // For unexpected errors, provide more details
                        console.error('❌ Unexpected error during discount validation:', error.message);
                        throw new HttpException(
                            `Discount validation failed: ${error.message}`,
                            HttpStatus.INTERNAL_SERVER_ERROR
                        );
                    }
                }
            }

            // Use tax values from frontend (already calculated correctly)
            const taxAmount = data?.tax_value || 0; // Frontend sends calculated tax amount
            const finalAmountWithTax = data?.final_price || (finalPrice + taxAmount);
            
            console.log('💰 Tax Calculation:');
            console.log('   - Amount After Discount:', finalPrice);
            console.log('   - Tax Amount (from frontend):', taxAmount);
            console.log('   - Final Amount (with tax):', finalAmountWithTax);

            const currency = this.stripeService.getCurrency();

            // Create payment intent with final amount including tax
            const paymentIntent = await this.stripeService.createPaymentIntent(
                finalAmountWithTax,
                currency,
                customer.id,
                paymentMethodId,
                {
                    user_id: userId,
                    plan_id: planId,
                    request_id: data?.request_id || uuidv4(),
                },
                data?.save_card ?? true
            );

            // Check if 3D Secure authentication required
            if (paymentIntent.status === 'requires_action') {
                // Save pending payment record
                data.response = paymentIntent;
                data.request_id = paymentIntent.metadata.request_id;
                const createdPayment = await this.createStripePaymentData({
                    ...data,
                    response: { ...paymentIntent, status: 'pending' },
                });

                return {
                    success: false,
                    payment_intent_id: paymentIntent.id,
                    status: paymentIntent.status,
                    requires_action: true,
                    client_secret: paymentIntent.client_secret,
                    payment_id: createdPayment._id.toString(),
                    subscription_id: null,
                    request_id: data.request_id,
                };
            }

            // Payment successful - save card to database
            const existingCard = await this.cardService.findOne({
                user_id: userId,
                gateway: ENUM_PAYMENT_GATEWAY.STRIPE,
                token_id: paymentMethod.id,
            });

            if (!existingCard && paymentMethod.card) {
                await this.cardService.create({
                    user_id: userId,
                    gateway: ENUM_PAYMENT_GATEWAY.STRIPE,
                    token_id: paymentMethod.id, // PaymentMethod ID for recurring
                    card_id: customer.id, // Customer ID
                    holder_name: user.name,
                    last4: paymentMethod.card.last4,
                    expiry_month: paymentMethod.card.exp_month.toString(),
                    expiry_year: paymentMethod.card.exp_year.toString(),
                    response: paymentMethod,
                    is_default: true,
                    status: true,
                });

                // Set as default payment method
                await this.stripeService.setDefaultPaymentMethod(
                    customer.id,
                    paymentMethod.id
                );
            }

            // Create payment record with new pricing structure
            data.response = await this.stripeService.buildEnrichedPaymentResponse(paymentIntent);
            data.request_id = paymentIntent.metadata.request_id;

            // Prepare tools with full pricing details
            // Use frontend's tool prices directly (frontend already calculated them)
            const toolsWithPricing = (data?.tools || []).map((tool: any) => {
                const toolBasePrice = tool.base_price ?? tool.price ?? 0;
                const pricingMode = tool.pricing_mode || 'fixed';
                const locationMultiplier = tool.location_multiplier || 1.0;
                // Use frontend's calculated_price or price, don't recalculate
                const calculatedPrice = tool.calculated_price ?? tool.price ?? toolBasePrice;

                return {
                    _id: tool._id,
                    name: tool.name,
                    slug: tool.slug || '',
                    base_price: toolBasePrice,
                    pricing_mode: pricingMode,
                    location_multiplier: locationMultiplier,
                    calculated_price: calculatedPrice,
                    is_mandatory: tool.is_mandatory ?? false,
                    display_order: tool.display_order ?? 0,
                };
            });

            // Calculate subtotal
            const subtotal = planPrice + toolsPrice;

            // Update data with new pricing structure
            data.plan_price = planPrice;
            data.plan_special_price = matchingTier?.special_price || 0;
            data.plan_special_price_duration = matchingTier?.special_price_duration || 0;
            data.tools = toolsWithPricing;
            data.tools_price = toolsPrice;
            data.subtotal = subtotal;
            data.discount_price = discountPrice;
            data.discount_code = discountCode;
            data.discount_id = discountId;
            // Discount duration info is already set in the validation block above
            // Ensure they are preserved if already set
            data.discount_duration_type = data.discount_duration_type || null;
            data.discount_duration_months = data.discount_duration_months || null;
            data.discount_name = data.discount_name || null;
            data.total = finalPrice; // Amount after discount, before tax
            data.tax_price = taxAmount;
            data.tax_rate = data?.tax_rate || 0;
            data.tax_type = data?.tax_type || null;
            data.final_price = finalAmountWithTax;
            data.location_pricing = plan.location_pricing || [];
            data.plan_snapshot = {
                name: plan.name,
                description: '',
                duration: plan.duration || 30,
                duration_type: plan.duration_type || 'MONTHLY',
                recurring: plan.recurring ?? false,
                is_lifetime: plan.is_lifetime ?? false,
                trial: plan.trial ?? false,
                trial_days: 0,
            };

            const createdPayment = await this.createStripePaymentData(data);

            if (createdPayment && createdPayment._id) {
                if (
                    createdPayment.status === ENUM_PAYMENT_STATUS.COMPLETED &&
                    !createdPayment.subscription_id
                ) {
                    // Prepare payload with new subscription structure
                    const payload = {
                        // Location-based pricing
                        locations: locationCount,
                        location_pricing: plan.location_pricing || [],

                        // Plan tier values
                        plan_price: planPrice,
                        original_plan_price: planPrice,
                        special_price: matchingTier?.special_price || 0,
                        special_price_duration: matchingTier?.special_price_duration || 0,
                        special_price_remaining: matchingTier?.special_price_duration || 0,

                        // Tools with full pricing
                        tools: toolsWithPricing,
                        tools_price: toolsPrice,

                        // Calculations
                        subtotal: subtotal,

                        // Discount
                        discount_id: discountId,
                        discount_code: discountCode,
                        discount_type: data?.discount_type || null,
                        discount_value: data?.discount_value || 0,
                        discount_price: discountPrice,

                        // After discount
                        total: finalPrice,

                        // Tax
                        tax_type: data?.tax_type || null,
                        tax_rate: data?.tax_rate || 0,
                        tax_price: taxAmount,

                        // Final amount
                        final_price: finalAmountWithTax,

                        // Plan info snapshot
                        plan_name: plan.name,
                        plan_description: '',
                        plan_type: plan.duration_type || 'MONTHLY',
                        plan_type_value: plan.duration_type === 'MONTHLY' ? 30 : plan.duration_type === 'YEARLY' ? 365 : 7,
                    };

                    console.log('🔍 Payload being sent to createSubscriptionData:');
                    console.log('   - plan_price:', payload.plan_price);
                    console.log('   - tools_price:', payload.tools_price);
                    console.log('   - subtotal:', payload.subtotal);
                    console.log('   - discount_price:', payload.discount_price);
                    console.log('   - total:', payload.total);
                    console.log('   - tax_price:', payload.tax_price);
                    console.log('   - final_price:', payload.final_price);

                    const finalPayment = await this.createSubscriptionData(
                        createdPayment._id.toString(),
                        payload
                    );

                    // Send success email
                    try {
                        const planData = await this.planService.findOne({
                            _id: planId.toString(),
                        });
                        const subject = 'Your Plan Subscription Purchase Successful.';
                        const context = {
                            name: user.name,
                            email: user.email,
                            transation_id: createdPayment._id.toString(),
                            method: createdPayment.method,
                            gateway: createdPayment.gateway,
                            postDateTime: createdPayment.postDateTime,
                            status: createdPayment.status,
                            new_plan: true,
                            plan_name: planData?.name ?? 'N/A',
                            plan_type_value: planData?.duration,
                            plan_type: planData?.duration_type,
                            content:
                                'Thank you for purchasing your subscription. Your account is now protected with our enhanced ransomware protection features and priority support access.',
                        };

                        await this.nodemailerService.sendEmailWithTemplate(
                            user?.email,
                            subject,
                            'customer_subscription_plan.hjs',
                            context
                        );
                    } catch (error) {
                        console.error('Email sending error:', error);
                    }

                    return {
                        success: true,
                        payment_intent_id: paymentIntent.id,
                        status: 'succeeded',
                        requires_action: false,
                        payment_id: finalPayment._id.toString(),
                        subscription_id: finalPayment.subscription_id?.toString() || null,
                    };
                } else if (createdPayment.status === ENUM_PAYMENT_STATUS.PENDING) {
                    return {
                        success: false,
                        payment_intent_id: paymentIntent.id,
                        status: 'pending',
                        requires_action: false,
                        payment_id: createdPayment._id.toString(),
                        subscription_id: null,
                    };
                } else if (createdPayment.status === ENUM_PAYMENT_STATUS.FAILED) {
                    // Send failure email
                    try {
                        const subject = 'Your Plan Subscription Purchase Failed.';
                        const context = { name: user.name };

                        await this.nodemailerService.sendEmailWithTemplate(
                            user?.email,
                            subject,
                            'payment_failed.hjs',
                            context
                        );
                    } catch (error) {
                        console.error('Email sending error:', error);
                    }

                    return {
                        success: false,
                        payment_intent_id: paymentIntent.id,
                        status: 'failed',
                        requires_action: false,
                        payment_id: createdPayment._id.toString(),
                        subscription_id: null,
                    };
                }
            }

            return {
                success: true,
                payment_intent_id: paymentIntent.id,
                status: paymentIntent.status,
                requires_action: false,
                payment_id: createdPayment._id.toString(),
                subscription_id: null,
            };
        } catch (error) {
            console.error('❌ Stripe payment processing failed:', error);
            console.error('❌ Error stack:', error.stack);
            
            // Provide more specific error messages for discount-related issues
            if (error.message && error.message.includes('discount')) {
                throw new HttpException(
                    `Discount validation failed: ${error.message}`,
                    error.status || HttpStatus.BAD_REQUEST
                );
            }
            
            throw new HttpException(
                error.message || 'Stripe payment processing error',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Process Stripe card payment for admin-initiated subscription updates
     * This method creates subscriptions without immediate payment capture
     * The company will be charged on their next billing cycle
     */
    async processStripeCardPaymentForSubscriptionUpdateByAdmin(
        data: any
    ): Promise<IStripePaymentResponse> {
        try {
            console.log('🚀 Starting Admin Subscription Assignment (No Immediate Charge)');
            console.log('🔍 Input data:', JSON.stringify({
                user_id: data?.user_id,
                plan_id: data?.plan_id,
                discount_code: data?.discount_code,
                final_price: data?.final_price,
                tools_price: data?.tools_price,
                total_price: data?.total_price,
                platform_price: data?.platform_price,
                company_id: data?.company_id,
                card_id: data?.card_id
            }, null, 2));

            const userId = data?.user_id || '';
            const planId = data?.plan_id || '';
            const cardId = data?.card_id || '';

            if (!userId || !planId || !cardId) {
                throw new HttpException(
                    'User ID, Plan ID, and Card ID are required for admin subscription assignment',
                    HttpStatus.BAD_REQUEST
                );
            }

            // Get user and plan details
            const user = await this.userService.findOneById(userId);
            if (!user) {
                throw new HttpException('User not found', HttpStatus.NOT_FOUND);
            }

            const plan = await this.planService.findOneById(planId);
            if (!plan) {
                throw new HttpException('Plan not found', HttpStatus.NOT_FOUND);
            }

            // Get stored card details
            const storedCard = await this.cardService.findOneById(cardId);
            if (!storedCard) {
                throw new HttpException('Stored card not found', HttpStatus.NOT_FOUND);
            }

            // Verify card belongs to user
            if (storedCard.user_id.toString() !== userId.toString()) {
                throw new HttpException(
                    'Unauthorized access to stored card',
                    HttpStatus.UNAUTHORIZED
                );
            }

            // Verify card is a Stripe card
            if (storedCard.gateway !== ENUM_PAYMENT_GATEWAY.STRIPE) {
                throw new HttpException(
                    'Selected card is not a Stripe card',
                    HttpStatus.BAD_REQUEST
                );
            }

            // Calculate pricing with discount if provided
            // First calculate the base amount: plan price + tools price
            const locationCount = data?.locations || 1;

            // Find the appropriate location pricing tier
            // Sort tiers by locations in descending order and find the first one <= requested locations
            const sortedTiers = [...(plan.location_pricing || [])].sort((a, b) => b.locations - a.locations);
            const matchingTier = sortedTiers.find(tier => tier.locations <= locationCount) || plan.location_pricing?.[0];
            const planPrice = matchingTier?.special_price || matchingTier?.price || 0;

            // Use frontend's tools_price if provided, otherwise calculate
            // Frontend already calculates tools price correctly
            const toolsPrice = data?.tools_price ?? (data?.tools || []).reduce((sum, tool: any) => {
                const toolBasePrice = tool.base_price ?? tool.price ?? 0;
                const pricingMode = tool.pricing_mode || 'fixed';
                const locationMultiplier = tool.location_multiplier || 1.0;

                if (pricingMode === 'multiplier') {
                    // MULTIPLIER mode: base_price × locations × location_multiplier
                    return sum + (toolBasePrice * locationCount * locationMultiplier);
                } else {
                    // FIXED mode: same price regardless of locations
                    return sum + toolBasePrice;
                }
            }, 0);

            const baseAmount = planPrice + toolsPrice;

            console.log('💰 Base Calculation:');
            console.log('   - Locations:', locationCount);
            console.log('   - Plan Price (tier for', matchingTier?.locations || 1, 'locations):', planPrice);
            console.log('   - Tools Price:', toolsPrice);
            console.log('   - Base Amount (Plan + Tools):', baseAmount);
            
            let finalPrice = baseAmount; // Start with base amount
            let discountPrice = 0;
            let discountCode = null;
            let discountId = null;

            // Validate and apply discount code if provided
            if (data?.discount_code && data.discount_code.trim()) {
                console.log('🔍 Processing discount code for admin assignment:', data.discount_code);
                
                // Check if discount service is available
                if (!this.discountService) {
                    throw new HttpException(
                        'Discount service unavailable',
                        HttpStatus.SERVICE_UNAVAILABLE
                    );
                }
                
                try {
                    const discountCodeInput = data.discount_code.trim();
                    const amount = baseAmount; // Use base amount (plan + tools) for discount calculation
                    const companyId = data.company_id || null;
                    const userIdForDiscount = userId || null;
                    
                    console.log('🔍 Discount calculation on base amount:', amount);
                    
                    if (amount <= 0) {
                        throw new HttpException(
                            'Invalid amount for discount calculation',
                            HttpStatus.BAD_REQUEST
                        );
                    }
                    
                    const discountResult = await this.discountService.validateAndApplyDiscountCode(
                        discountCodeInput,
                        amount,
                        new Date(),
                        companyId,
                        userIdForDiscount
                    );

                    console.log('🔍 Discount validation result:', JSON.stringify(discountResult, null, 2));

                    if (discountResult && discountResult.valid && discountResult.can_apply) {
                        discountPrice = discountResult.discounted_price || 0;
                        finalPrice = discountResult.price || amount;
                        discountCode = discountResult.discount_code;
                        discountId = discountResult.discount_id;
                        
                        console.log('✅ Discount applied successfully');
                        console.log('💰 Discount Calculation:');
                        console.log('   - Original Amount (Plan + Tools):', amount);
                        console.log('   - Discount Amount:', discountPrice);
                        console.log('   - Final Amount After Discount:', finalPrice);
                    } else {
                        const errorMessage = discountResult?.message || 'Invalid discount code';
                        console.log('❌ Discount validation failed:', errorMessage);
                        throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
                    }
                } catch (error) {
                    console.error('❌ Discount validation error:', error);
                    if (error instanceof HttpException) {
                        throw error;
                    }
                    throw new HttpException(
                        `Discount validation failed: ${error.message}`,
                        HttpStatus.BAD_REQUEST
                    );
                }
            }

            // Use tax values from frontend (already calculated correctly)
            const taxAmount = data?.tax_value || 0; // Frontend sends calculated tax amount
            const finalAmountWithTax = data?.final_price || (finalPrice + taxAmount);
            
            console.log('💰 Tax Calculation:');
            console.log('   - Amount After Discount:', finalPrice);
            console.log('   - Tax Amount (from frontend):', taxAmount);
            console.log('   - Final Amount (with tax):', finalAmountWithTax);

            // Prepare tools with full pricing details
            // Use frontend's tool prices directly (frontend already calculated them)
            const toolsWithPricing = (data?.tools || []).map((tool: any) => {
                const toolBasePrice = tool.base_price ?? tool.price ?? 0;
                const pricingMode = tool.pricing_mode || 'fixed';
                const locationMultiplier = tool.location_multiplier || 1.0;
                // Use frontend's calculated_price or price, don't recalculate
                const calculatedPrice = tool.calculated_price ?? tool.price ?? toolBasePrice;

                return {
                    _id: tool._id,
                    name: tool.name,
                    slug: tool.slug || '',
                    base_price: toolBasePrice,
                    pricing_mode: pricingMode,
                    location_multiplier: locationMultiplier,
                    calculated_price: calculatedPrice,
                    is_mandatory: tool.is_mandatory ?? false,
                    display_order: tool.display_order ?? 0,
                };
            });

            // Calculate subtotal
            const subtotal = planPrice + toolsPrice;

            // Create a payment record without capturing payment (for record keeping)
            const paymentData = {
                // References
                user_id: userId,
                company_id: data.company_id,
                plan_id: planId,

                // Location-based pricing
                locations: locationCount,
                location_pricing: plan.location_pricing || [],

                // Plan tier values
                plan_price: planPrice,
                plan_special_price: matchingTier?.special_price || 0,
                plan_special_price_duration: matchingTier?.special_price_duration || 0,
                plan_special_price_remaining: matchingTier?.special_price_duration || 0,

                // Tools
                tools: toolsWithPricing,
                tools_price: toolsPrice,

                // Calculations
                subtotal: subtotal,

                // Discount
                discount_id: discountId,
                discount_code: discountCode,
                discount_type: data?.discount_type || null,
                discount_value: data?.discount_value || 0,
                discount_price: discountPrice,

                // After discount
                total: finalPrice,

                // Tax
                tax_type: data?.tax_type || null,
                tax_rate: data?.tax_rate || 0,
                tax_price: taxAmount,

                // Final amount
                final_price: finalAmountWithTax,

                // Plan snapshot
                plan_snapshot: {
                    name: plan.name,
                    description: '',
                    duration: plan.duration || 30,
                    duration_type: plan.duration_type || 'MONTHLY',
                    recurring: plan.recurring ?? false,
                    is_lifetime: plan.is_lifetime ?? false,
                    trial: plan.trial ?? false,
                    trial_days: 0,
                },

                // Payment info
                response: {
                    id: `admin_assigned_${Date.now()}`,
                    status: 'admin_assigned',
                    payment_method: storedCard.token_id
                },
                charge_id: `admin_assigned_${Date.now()}`,
                request_id: data?.request_id || `admin_req_${Date.now()}`,
                gateway: ENUM_PAYMENT_GATEWAY.STRIPE,
                method: ENUM_PAYMENT_METHOD.CARD,
                paid: false, // Not paid immediately - will be charged on billing cycle
                postDateTime: new Date().toDateString(),
                status: ENUM_PAYMENT_STATUS.PENDING, // Pending until next billing cycle
            };

            const createdPayment = await this.create(paymentData);
            console.log('✅ Payment record created for admin assignment:', createdPayment._id);
            console.log('ℹ️  Note: Company will be charged on next billing cycle, not immediately');
            console.log('💰 Final Pricing Summary:');
            console.log('   - Plan Price:', planPrice);
            console.log('   - Tools Price:', toolsPrice);
            console.log('   - Subtotal:', subtotal);
            console.log('   - Discount Amount:', discountPrice);
            console.log('   - Total (after discount):', finalPrice);
            console.log('   - Tax Amount:', taxAmount);
            console.log('   - Final Price:', finalAmountWithTax);

            // Create subscription immediately (without waiting for payment)
            // For admin assignments, we create the subscription right away
            // The company will be charged on their next billing cycle
            const payload = {
                // Location-based pricing
                locations: locationCount,
                location_pricing: plan.location_pricing || [],

                // Plan tier values
                plan_price: planPrice,
                original_plan_price: planPrice,
                special_price: matchingTier?.special_price || 0,
                special_price_duration: matchingTier?.special_price_duration || 0,
                special_price_remaining: matchingTier?.special_price_duration || 0,

                // Tools with full pricing
                tools: toolsWithPricing,
                tools_price: toolsPrice,

                // Calculations
                subtotal: subtotal,

                // Discount
                discount_id: discountId,
                discount_code: discountCode,
                discount_type: data?.discount_type || null,
                discount_value: data?.discount_value || 0,
                discount_price: discountPrice,
                discount_duration_type: data?.discount_duration_type || null,
                discount_duration_months: data?.discount_duration_months || null,
                discount_remaining_months: data?.discount_duration_months || null,
                discount_name: data?.discount_name || null,
                discount_location_rules: data?.discount_location_rules || [],

                // After discount
                total: finalPrice,

                // Tax
                tax_type: data?.tax_type || null,
                tax_rate: data?.tax_rate || 0,
                tax_price: taxAmount,

                // Final amount
                final_price: finalAmountWithTax,

                // Plan info snapshot
                plan_name: plan.name,
                plan_description: '',
                plan_type: plan.duration_type || 'MONTHLY',
                plan_type_value: plan.duration_type === 'MONTHLY' ? 30 : plan.duration_type === 'YEARLY' ? 365 : 7,
            };

            const finalPayment = await this.createSubscriptionData(
                createdPayment._id.toString(),
                payload
            );

            if (!finalPayment || !finalPayment.subscription_id) {
                throw new HttpException(
                    'Failed to create subscription',
                    HttpStatus.INTERNAL_SERVER_ERROR
                );
            }

            console.log('✅ Admin subscription assignment completed successfully');
            console.log('📤 API Response:', {
                success: true,
                payment_intent_id: createdPayment.charge_id,
                status: 'succeeded', // Use 'succeeded' status for frontend compatibility
                requires_action: false,
                payment_id: finalPayment._id.toString(),
                subscription_id: finalPayment.subscription_id?.toString() || null,
            });

            return {
                success: true,
                payment_intent_id: createdPayment.charge_id,
                status: 'succeeded', // Use 'succeeded' status for frontend compatibility
                requires_action: false,
                payment_id: finalPayment._id.toString(),
                subscription_id: finalPayment.subscription_id?.toString() || null,
            };

        } catch (error) {
            console.error('❌ Admin subscription assignment failed:', error);
            console.error('❌ Error stack:', error.stack);
            
            throw new HttpException(
                error.message || 'Admin subscription assignment error',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Confirm Stripe payment after 3D Secure authentication
     */
    async confirmStripePayment(
        data: IStripeConfirmPaymentRequest
    ): Promise<any> {
        try {
            const paymentIntentId = data?.payment_intent_id || '';
            const requestId = data?.request_id || '';

            if (!paymentIntentId) {
                throw new HttpException(
                    'Payment Intent ID is required',
                    HttpStatus.BAD_REQUEST
                );
            }

            // Retrieve payment intent from Stripe
            const paymentIntent = await this.stripeService.getPaymentIntent(
                paymentIntentId
            );

            // Find payment record
            let payment: PaymentDoc = null;
            if (requestId) {
                payment = await this.findOneSort({ request_id: requestId });
            } else {
                payment = await this.findOneSort({ charge_id: paymentIntentId });
            }

            if (!payment || !payment._id) {
                throw new HttpException(
                    'Payment not found',
                    HttpStatus.NOT_FOUND
                );
            }

            // Check if payment already completed
            if (payment.status === ENUM_PAYMENT_STATUS.COMPLETED) {
                return {
                    success: true,
                    status: 'completed',
                    message: 'Payment already completed',
                    payment_id: payment._id.toString(),
                    subscription_id: payment.subscription_id?.toString() || null,
                };
            }

            // Update payment based on Stripe status
            if (paymentIntent.status === 'succeeded') {
                // Update payment to completed
                await this.update(payment._id.toString(), {
                    response: paymentIntent,
                    paid: true,
                    status: ENUM_PAYMENT_STATUS.COMPLETED,
                });

                // Save card to database for 3DS payments (same as non-3DS flow)
                try {
                    const paymentMethodId = paymentIntent.payment_method;
                    const customerId = paymentIntent.customer;

                    if (paymentMethodId && customerId) {
                        // Get user ID from payment
                        const userId = payment.user_id;

                        // Check if card already exists
                        const existingCard = await this.cardService.findOne({
                            user_id: userId,
                            gateway: ENUM_PAYMENT_GATEWAY.STRIPE,
                            token_id: paymentMethodId,
                        });

                        if (!existingCard) {
                            // Retrieve payment method details from Stripe
                            const paymentMethod = await this.stripeService.getPaymentMethod(paymentMethodId as string);

                            if (paymentMethod && paymentMethod.card) {
                                // Get user name for holder_name
                                let holderName = 'Card Holder';
                                const userObj = payment.user_id as any;
                                if (userObj && typeof userObj === 'object' && userObj.name) {
                                    holderName = userObj.name;
                                } else if (userId) {
                                    const user = await this.userService.findOneById(userId.toString());
                                    holderName = user?.name || 'Card Holder';
                                }

                                const userIdStr = userId?.toString() || (userObj?._id?.toString());

                                await this.cardService.create({
                                    user_id: userIdStr,
                                    gateway: ENUM_PAYMENT_GATEWAY.STRIPE,
                                    token_id: paymentMethodId as string, // PaymentMethod ID for recurring
                                    card_id: customerId as string, // Customer ID
                                    holder_name: holderName,
                                    last4: paymentMethod.card.last4,
                                    expiry_month: paymentMethod.card.exp_month.toString(),
                                    expiry_year: paymentMethod.card.exp_year.toString(),
                                    response: paymentMethod,
                                    is_default: true,
                                    status: true,
                                });

                                // Set as default payment method
                                await this.stripeService.setDefaultPaymentMethod(
                                    customerId as string,
                                    paymentMethodId as string
                                );

                                console.log(`✅ Card saved for 3DS payment: ${paymentMethod.card.last4}`);
                            }
                        }
                    }
                } catch (cardError) {
                    console.error('Error saving card for 3DS payment:', cardError.message);
                    // Don't fail the payment confirmation if card save fails
                }

                // Create subscription if not exists
                if (!payment.subscription_id) {
                    const payload = {
                        locations: payment?.locations || 1,
                        location_pricing: payment?.location_pricing || [],
                        plan_price: payment?.plan_price || 0,
                        plan_special_price: payment?.plan_special_price || 0,
                        plan_special_price_duration: payment?.plan_special_price_duration || 0,
                        tools: payment?.tools || [],
                        tools_price: payment?.tools_price || 0,
                        subtotal: payment?.subtotal || 0,
                        tax_type: payment?.tax_type || '',
                        tax_rate: payment?.tax_rate || 0,
                        tax_price: payment?.tax_price || 0,
                        total: payment?.total || 0,
                        final_price: payment?.final_price || 0,
                        discount_code: null,
                        discount_price: payment?.discount_price || 0,
                    };

                    const finalPayment = await this.createSubscriptionData(
                        payment._id.toString(),
                        payload
                    );

                    // Send success email
                    try {
                        // Handle both populated user object and raw user_id
                        let user: any;
                        const userIdStr = payment.user_id?.toString();
                        if (userIdStr) {
                            user = await this.userService.findOneById(userIdStr);
                        }

                        if (!user || !user.email) {
                            console.error('Could not find user for email notification');
                            throw new Error('User not found for email');
                        }

                        const planData = await this.planService.findOne({
                            _id: payment.plan_id,
                        });

                        const subject = 'Your Plan Subscription Purchase Successful.';
                        const context = {
                            name: user.name,
                            email: user.email,
                            transation_id: payment._id.toString(),
                            method: payment.method,
                            gateway: payment.gateway,
                            postDateTime: payment.postDateTime,
                            status: 'completed',
                            new_plan: true,
                            plan_name: planData?.name ?? 'N/A',
                            plan_type_value: planData?.duration,
                            plan_type: planData?.duration_type,
                            content:
                                'Thank you for purchasing your subscription. Your account is now protected with our enhanced ransomware protection features and priority support access.',
                        };

                        await this.nodemailerService.sendEmailWithTemplate(
                            user?.email,
                            subject,
                            'customer_subscription_plan.hjs',
                            context
                        );
                    } catch (error) {
                        console.error('Email sending error:', error);
                    }

                    return {
                        success: true,
                        status: 'succeeded',
                        message: 'Payment confirmed successfully',
                        payment_id: finalPayment._id.toString(),
                        subscription_id: finalPayment.subscription_id?.toString() || null,
                    };
                }

                const updatedPayment = await this.findOneSort({
                    _id: payment._id,
                });

                return {
                    success: true,
                    status: 'succeeded',
                    message: 'Payment confirmed successfully',
                    payment_id: updatedPayment._id.toString(),
                    subscription_id: updatedPayment.subscription_id?.toString() || null,
                };
            } else if (
                paymentIntent.status === 'requires_payment_method' ||
                paymentIntent.status === 'requires_confirmation'
            ) {
                // Payment failed
                await this.update(payment._id.toString(), {
                    response: paymentIntent,
                    paid: false,
                    status: ENUM_PAYMENT_STATUS.FAILED,
                });

                return {
                    success: false,
                    status: 'failed',
                    message: 'Payment failed. Please try again with a different payment method.',
                    payment_id: payment._id.toString(),
                    subscription_id: null,
                };
            } else if (paymentIntent.status === 'canceled') {
                // Payment canceled
                await this.update(payment._id.toString(), {
                    response: paymentIntent,
                    paid: false,
                    status: ENUM_PAYMENT_STATUS.CANCELLED,
                });

                return {
                    success: false,
                    status: 'canceled',
                    message: 'Payment was canceled',
                    payment_id: payment._id.toString(),
                    subscription_id: null,
                };
            }

            // Payment still processing or requires action
            return {
                success: false,
                status: paymentIntent.status,
                message: `Payment status: ${paymentIntent.status}`,
                payment_id: payment._id.toString(),
                subscription_id: null,
            };
        } catch (error) {
            throw new HttpException(
                error.message || 'Payment confirmation error',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    // ===================== END STRIPE METHODS =====================

    async mapList(payments: PaymentDoc[]): Promise<PaymentListResponseDto[]> {
        // Collect unique IDs for batch fetching
        const userIds = [...new Set(payments.map(p => p.user_id).filter(Boolean))];
        const companyIds = [...new Set(payments.map(p => p.company_id).filter(Boolean))];
        const planIds = [...new Set(payments.map(p => p.plan_id).filter(Boolean))];

        // Batch fetch all related entities
        const [users, companies, plans] = await Promise.all([
            Promise.all(userIds.map(id => this.userService.findOneById(id).catch(() => null))),
            Promise.all(companyIds.map(id => this.companyRepository.findOneById(id).catch(() => null))),
            Promise.all(planIds.map(id => this.planService.findOneById(id).catch(() => null))),
        ]);

        // Build lookup maps
        const userMap = new Map<string, any>();
        users.forEach(u => { if (u) userMap.set(u._id.toString(), u); });
        const companyMap = new Map<string, any>();
        companies.forEach(c => { if (c) companyMap.set(c._id.toString(), c); });
        const planMap = new Map<string, any>();
        plans.forEach(p => { if (p) planMap.set(p._id.toString(), p); });

        return payments.map((payment: PaymentDoc) => {
            const paymentObject =
                (payment as any).toObject ? (payment as any).toObject() : payment;
            const responseObject: any = { ...paymentObject };

            // Populate user
            const userData = userMap.get(paymentObject.user_id);
            if (userData) {
                responseObject.user = {
                    _id: userData._id.toString(),
                    name: userData.name || `${userData.first_name || ''} ${userData.last_name || ''}`.trim(),
                    email: userData.email,
                    status: userData.status,
                };
            }

            // Populate company
            const companyData = companyMap.get(paymentObject.company_id);
            if (companyData) {
                responseObject.company_id = {
                    _id: companyData._id.toString(),
                    company_name: companyData.company_name || '',
                };
            }

            // Populate plan
            const planData = planMap.get(paymentObject.plan_id);
            if (planData) {
                responseObject.plan = {
                    _id: planData._id.toString(),
                    name: planData.name,
                    price: planData.price,
                    status: planData.status,
                    duration_type: planData.duration_type,
                };
            }

            return plainToInstance(PaymentListResponseDto, responseObject);
        });
    }

    mapGet(payment: PaymentDoc): PaymentListResponseDto {
        const paymentObject =
            (payment as any).toObject ? (payment as any).toObject() : payment;

        // Create the response object with populated data
        const responseObject: any = { ...paymentObject };

        // Transform populated user data
        if (
            paymentObject.user_id &&
            typeof paymentObject.user_id === 'object' &&
            paymentObject.user_id._id
        ) {
            const userData = paymentObject.user_id as any;
            responseObject.user = {
                _id: userData._id.toString(),
                name: userData.name,
                email: userData.email,
                status: userData.status,
            };
        }

        // Transform populated plan data
        if (
            paymentObject.plan_id &&
            typeof paymentObject.plan_id === 'object' &&
            paymentObject.plan_id._id
        ) {
            const planData = paymentObject.plan_id as any;
            responseObject.plan = {
                _id: planData._id.toString(),
                name: planData.name,
                price: planData.price,
                status: planData.status,
                duration_type: planData.duration_type,
            };
        }

        return plainToInstance(PaymentListResponseDto, responseObject);
    }

    /**
     * Get enriched payment detail with populated user, company, plan, and response.
     */
    async getPaymentDetail(paymentId: string): Promise<Record<string, any>> {
        const payment = await this.paymentRepository.findOneById(paymentId);
        if (!payment) return null;

        const paymentObj: any =
            (payment as any).toObject ? (payment as any).toObject() : { ...payment };

        // Populate user
        if (paymentObj.user_id) {
            try {
                const user = await this.userService.findOneById(paymentObj.user_id);
                if (user) {
                    paymentObj.user = {
                        _id: user._id,
                        first_name: (user as any).first_name || '',
                        last_name: (user as any).last_name || '',
                        email: (user as any).email || '',
                    };
                }
            } catch (_) {}
        }

        // Populate company
        if (paymentObj.company_id) {
            try {
                const company = await this.companyRepository.findOneById(paymentObj.company_id);
                if (company) {
                    paymentObj.company = {
                        _id: company._id,
                        company_name: (company as any).company_name || '',
                    };
                }
            } catch (_) {}
        }

        // Populate plan
        if (paymentObj.plan_id) {
            try {
                const plan = await this.planService.findOneById(paymentObj.plan_id);
                if (plan) {
                    paymentObj.plan = {
                        _id: plan._id,
                        name: (plan as any).name || '',
                    };
                }
            } catch (_) {}
        }

        return paymentObj;
    }

    /**
     * Re-send invoice email for a payment.
     * Looks up the user, plan, and invoice file, then sends via SubscriptionInvoiceHelper.
     */
    async resendInvoiceEmail(paymentId: string): Promise<void> {
        const payment = await this.findOneById(paymentId);
        if (!payment) {
            throw new HttpException('Payment not found', HttpStatus.NOT_FOUND);
        }
        if (!payment.inv_path || !payment.full_inv_number) {
            throw new HttpException('Invoice not available for this payment', HttpStatus.NOT_FOUND);
        }

        const filePath = require('path').join(process.cwd(), 'public', payment.inv_path);
        if (!require('fs').existsSync(filePath)) {
            throw new HttpException('Invoice file not found on server', HttpStatus.NOT_FOUND);
        }

        const user = await this.userService.findOneById(payment.user_id);
        if (!user || !user.email) {
            throw new HttpException('User not found or has no email', HttpStatus.NOT_FOUND);
        }

        const plan = payment.plan_id
            ? await this.planService.findOneById(payment.plan_id)
            : null;
        const planName = (plan as any)?.name || 'Subscription';
        const userName = user.name || `${user.first_name} ${user.last_name}`;
        const amountStr = (payment.final_price || 0).toFixed(2);
        const locations = payment.locations || 1;

        await this.subscriptionInvoiceHelper.sendInvoiceEmail(
            user.email,
            userName,
            filePath,
            payment.full_inv_number,
            planName,
            amountStr,
            locations,
        );
    }

    /**
     * Generate invoice for a recurring payment, persist to payment record, and send email.
     * Called by the recurring payment cron after a successful charge.
     */
    async generateRecurringInvoice(
        paymentId: string,
        subscription: any,
    ): Promise<void> {
        try {
            const payment = await this.findOneById(paymentId);
            if (!payment) {
                console.error(`generateRecurringInvoice: Payment ${paymentId} not found`);
                return;
            }

            // Generate invoice number
            const lastPayment = await this.findOneSort(
                { soft_delete: false },
                'inv_number',
                -1,
            );
            const invoiceNumbers = this.subscriptionInvoiceHelper.generateInvoiceNumber(
                lastPayment?.inv_number || 0,
            );

            // Generate invoice PDF
            const invoiceFilePath = await this.subscriptionInvoiceHelper.generateSubscriptionInvoice(
                subscription,
                {
                    inv_number: invoiceNumbers.inv_number,
                    full_inv_number: invoiceNumbers.full_inv_number,
                    special_price: subscription.total_price || 0,
                    discount_price: payment.discount_price || 0,
                },
            );

            // Persist invoice details to payment record
            const invoiceFileName = `invoice-${invoiceNumbers.full_inv_number}.pdf`;
            await this.paymentRepository.updateById(paymentId, {
                inv_number: invoiceNumbers.inv_number,
                full_inv_number: invoiceNumbers.full_inv_number,
                inv_path: `invoices/${invoiceFileName}`,
            } as any);

            // Send invoice email
            const user = await this.userService.findOneById(payment.user_id);
            if (user?.email) {
                const plan = payment.plan_id
                    ? await this.planService.findOneById(payment.plan_id)
                    : null;
                const planName = (plan as any)?.name || 'Subscription';
                const userName = user.name || `${user.first_name} ${user.last_name}`;
                const amountStr = (payment.final_price || 0).toFixed(2);
                const locations = payment.locations || 1;

                await this.subscriptionInvoiceHelper.sendInvoiceEmail(
                    user.email,
                    userName,
                    invoiceFilePath,
                    invoiceNumbers.full_inv_number,
                    planName,
                    amountStr,
                    locations,
                    {
                        discount_price: payment.discount_price,
                        discount_code: payment.discount_code,
                        discount_duration_type: payment.discount_duration_type,
                        discount_duration_months: payment.discount_duration_months,
                        discount_remaining_months: payment.discount_remaining_months,
                    },
                );
            }

            console.log(`Recurring invoice generated and sent: ${invoiceNumbers.full_inv_number}`);
        } catch (error) {
            console.error(`Failed to generate recurring invoice for payment ${paymentId}:`, error.message);
            // Don't throw — invoice failure should not break the cron flow
        }
    }

    /**
     * Provision tools asynchronously in the background
     * This prevents blocking subscription creation during signup
     */
    private async provisionToolsAsync(subscription: any): Promise<void> {
        try {
            console.log(`🔄 Starting async tool provisioning for subscription: ${subscription._id}`);

            // Update subscription status to provisioning
            await this.subscriptionService.updateSubscriptionProvisioningStatus(
                subscription._id.toString(),
                'provisioning'
            );

            // Provision tools
            const provisioningResult =
                await this.toolProvisioningService.provisionToolsForSubscription(
                    subscription
                );

            if (provisioningResult.status === 'success') {
                console.log(`✅ Tool provisioning completed for subscription: ${subscription._id}`);
                await this.subscriptionService.updateSubscriptionProvisioningStatus(
                    subscription._id.toString(),
                    'provisioned'
                );
            } else {
                console.error(`❌ Tool provisioning failed for subscription: ${subscription._id}`, provisioningResult.errors);
                await this.subscriptionService.updateSubscriptionProvisioningStatus(
                    subscription._id.toString(),
                    'failed',
                    provisioningResult.errors?.join(', ') || 'Unknown provisioning error'
                );
            }
        } catch (provisioningError) {
            console.error(`❌ Tool provisioning error for subscription: ${subscription._id}`, provisioningError);
            await this.subscriptionService.updateSubscriptionProvisioningStatus(
                subscription._id.toString(),
                'failed',
                provisioningError.message || 'Tool provisioning failed'
            );
        }
    }

    /**
     * Helper method to send admin and user notifications for subscription creation or upgrade
     */
    private async sendAdminCreatedOrUpgradedNotification(
        subscription: SubscriptionDoc,
        type: 'created' | 'upgraded'
    ): Promise<void> {
        try {
            // Fetch subscription with joins to get full data
            const subscriptionWithJoins = await this.subscriptionService.findOneWithJoins(subscription._id.toString());

            if (!subscriptionWithJoins) {
                console.warn('Could not find subscription with joins for notifications');
                return;
            }

            const emailData = {
                companyName: subscriptionWithJoins.company?.company_name || 'N/A',
                customerName: subscriptionWithJoins.user?.name || 'N/A',
                customerEmail: subscriptionWithJoins.user?.email || subscriptionWithJoins.company?.email || 'N/A',
                planName: subscriptionWithJoins.plan?.name || 'N/A',
                locations: (subscription as any).locations || 1,
                totalPrice: subscription.subtotal || 0,
                finalPrice: subscription.final_price || subscription.subtotal || 0,
                startDate: subscription.start_date ? new Date(subscription.start_date).toISOString().split('T')[0] : 'N/A',
                endDate: subscription.end_date ? new Date(subscription.end_date).toISOString().split('T')[0] : 'N/A',
                discountCode: subscription.discount_code || null,
            };

            // Send admin notification
            const paymentCompanyId = subscription.company_id?.toString();
            if (type === 'upgraded') {
                await this.emailService.sendAdminSubscriptionUpgraded(emailData, paymentCompanyId);
                console.log(`✅ Admin upgrade notification sent for subscription: ${subscription._id}`);
            } else {
                await this.emailService.sendAdminSubscriptionCreated(emailData, paymentCompanyId);
                console.log(`✅ Admin creation notification sent for subscription: ${subscription._id}`);
            }

            // Send user notification
            const userData = {
                name: subscriptionWithJoins.user?.name || 'Customer',
                email: subscriptionWithJoins.user?.email || subscriptionWithJoins.company?.email,
            };

            const subscriptionData = {
                planName: subscriptionWithJoins.plan?.name || 'N/A',
                planType: subscription.plan_type || 'subscription',
                locations: (subscription as any).locations || 1,
                transactionId: 'N/A',
                method: 'Online Payment',
                gateway: 'Payment Gateway',
                startDate: emailData.startDate,
            };

            if (type === 'upgraded') {
                await this.emailService.sendUserSubscriptionUpgraded(userData, subscriptionData, paymentCompanyId);
                console.log(`✅ User upgrade notification sent for subscription: ${subscription._id}`);
            } else {
                await this.emailService.sendUserSubscriptionCreated(userData, subscriptionData, paymentCompanyId);
                console.log(`✅ User creation notification sent for subscription: ${subscription._id}`);
            }
        } catch (error) {
            console.error('Error sending notifications:', error);
            throw error;
        }
    }

    /**
     * Dispatch sync event to appointment app
     * Called after subscription is created/upgraded
     */
}
