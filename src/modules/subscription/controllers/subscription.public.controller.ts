import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    UseGuards,
    Query,
    HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiBody } from '@nestjs/swagger';
import {
    PaginationQuery,
} from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';
import { PaginationService } from '@common/pagination/services/pagination.service';
import {
    Response,
    ResponsePaging,
} from '@common/response/decorators/response.decorator';
import {
    IResponse,
    IResponsePaging,
} from '@common/response/interfaces/response.interface';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';

import { SubscriptionService } from '../services/subscription.service';
import { SubscriptionCreateRequestDto } from '../dtos/request/subscription.create.request.dto';
import { SubscriptionGetResponseDto } from '../dtos/response/subscription.get.response.dto';
import { SubscriptionDoc } from '../repository/entities/subscription.entity';

import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { UserParsePipe } from '@modules/user/pipes/user.parse.pipe';
import { UserDoc } from '@modules/user/repository/entities/user.entity';
import { UserService } from '@modules/user/services/user.service';
import { CompanyService } from '@modules/company/services/company.service';
import { PlanService } from '@modules/plan/services/plan.service';
import { SubscriptionPublicCancelAllDoc } from '../docs/subscription.public.doc';

import { SUBSCRIPTION_DEFAULT_AVAILABLE_ORDER_BY, SUBSCRIPTION_DEFAULT_AVAILABLE_SEARCH } from '../constants/subscription.list.constant';
import { NodemailerService } from '@modules/email/services/nodemailer.service';
import { SubscriptionAlreadyExistsException } from '../exceptions/subscription.exception';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { EnhancedEmailService } from '@modules/email/services/enhanced-email.service';
import { Logger } from '@nestjs/common';
import { DiscountService } from '@modules/discount/services/discount.service';
import { AuthService } from '@modules/auth/services/auth.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('modules.public.subscription')
@Controller({
    version: '1',
    path: '/subscription',
})
export class SubscriptionPublicController {
    private readonly logger = new Logger(SubscriptionPublicController.name);

    constructor(
        private readonly subscriptionService: SubscriptionService,
        private readonly paginationService: PaginationService,
        private readonly nodemailerService: NodemailerService,
        private readonly emailService: EnhancedEmailService,
        private readonly userService: UserService,
        private readonly companyService: CompanyService,
        private readonly planService: PlanService,
        private readonly discountService: DiscountService,
        private readonly authService: AuthService,
        private readonly configService: ConfigService
    ) { }

    @Response('subscription.create')
    @HttpCode(HttpStatus.CREATED)
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @Body() body: SubscriptionCreateRequestDto,
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc,
        @AuthJwtPayload('roleName') roleName: string
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        // For non-Super Admin, override user_id with authenticated user's ID
        if (roleName !== ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            body.user_id = user._id.toString();
        }

        // Cancel all existing active subscriptions for the user
        const targetUserId = body.user_id || user._id.toString();
        console.log(`🔄 Creating subscription for user: ${targetUserId} (role: ${roleName})`);

        // Find and cancel existing active subscriptions for this user
        const existingSubscriptions = await this.subscriptionService.findAll({
            user_id: targetUserId,
            status: true,
            soft_delete: false
        });

        console.log(`📋 Found ${existingSubscriptions.length} active subscription(s) to cancel`);

        // Cancel each existing subscription
        for (const existingSub of existingSubscriptions) {
            await this.subscriptionService.update(existingSub, {
                status: false,
                cancelledAt: new Date()
            });
            console.log(`   ✅ Cancelled subscription: ${existingSub._id}`);
        }

        const created: SubscriptionDoc =
            await this.subscriptionService.create(body);

        console.log(`✅ Created new subscription: ${created._id} (status: ${created.status})`);

        // Send email notifications to admin and user
        try {
            this.logger.log('📧 Sending subscription email notifications...');

            // Get subscription details with populated references
            const subscriptionWithDetails = await this.subscriptionService.findOneById(
                created._id.toString(),
                { join: true }
            );

            // Get user details for email with populated references
            const subscribedUser = await this.userService.findOneById(targetUserId, {
                join: true,
            });

            // Get company name
            let companyName = 'N/A';
            if (subscribedUser?.companyId) {
                if (typeof subscribedUser.companyId === 'object' && subscribedUser.companyId && (subscribedUser.companyId as any).name) {
                    // Already populated
                    companyName = (subscribedUser.companyId as any).name;
                    this.logger.log('✅ Company already populated:', companyName);
                } else {
                    // Need to fetch company separately
                    try {
                        const companyId = typeof subscribedUser.companyId === 'object' && subscribedUser.companyId
                            ? (subscribedUser.companyId as any)._id?.toString() || (subscribedUser.companyId as any).toString()
                            : subscribedUser.companyId?.toString();

                        this.logger.log('🔍 Fetching company with ID:', companyId);
                        const company = await this.companyService.findOneById(companyId);

                        // DEBUG: Log the full company object to understand its structure
                        this.logger.log('📦 Company object keys:', company ? Object.keys(company) : 'null/undefined');
                        this.logger.log('📦 Full company object:', JSON.stringify(company, null, 2));

                        companyName = (company as any)?.name || (company as any)?.company_name || (subscribedUser as any).company_name || 'N/A';
                        this.logger.log('✅ Company name resolved:', companyName);
                    } catch (err) {
                        this.logger.warn('❌ Could not fetch company details:', err.message);
                        companyName = (subscribedUser as any).company_name || 'N/A';
                    }
                }
            } else if ((subscribedUser as any)?.company_name) {
                companyName = (subscribedUser as any).company_name;
                this.logger.log('✅ Company name from user.company_name:', companyName);
            }

            const userName = subscribedUser?.name || `${subscribedUser?.first_name || ''} ${subscribedUser?.last_name || ''}`.trim() || 'Unknown';

            // Get plan name with detailed logging
            let planName = 'Subscription Plan';
            this.logger.log('📋 Plan ID from subscription:', subscriptionWithDetails?.plan_id);

            if (subscriptionWithDetails?.plan_id) {
                if (typeof subscriptionWithDetails.plan_id === 'object' && subscriptionWithDetails.plan_id.name) {
                    // Plan is already populated
                    planName = subscriptionWithDetails.plan_id.name;
                    this.logger.log('📋 Plan populated, name:', planName);
                } else {
                    // Plan ID is not populated, fetch it
                    try {
                        const planId = typeof subscriptionWithDetails.plan_id === 'object'
                            ? subscriptionWithDetails.plan_id._id?.toString() || subscriptionWithDetails.plan_id.toString()
                            : subscriptionWithDetails.plan_id.toString();

                        this.logger.log('🔍 Fetching plan with ID:', planId);
                        const plan = await this.planService.findOneById(planId);

                        // DEBUG: Log the full plan object to understand its structure
                        this.logger.log('📦 Plan object keys:', plan ? Object.keys(plan) : 'null/undefined');
                        this.logger.log('📦 Full plan object:', JSON.stringify(plan, null, 2));

                        planName = (plan as any)?.name || (plan as any)?.plan_name || (body as any).plan_name || 'Subscription Plan';
                        this.logger.log('✅ Plan name resolved:', planName);
                    } catch (err) {
                        this.logger.warn('❌ Could not fetch plan details:', err.message);
                        planName = (body as any).plan_name || 'Subscription Plan';
                    }
                }
            } else if ((body as any).plan_name) {
                planName = (body as any).plan_name;
                this.logger.log('📋 Plan name from request body:', planName);
            }

            // Prepare subscription data for email
            const subscriptionData = {
                subscriptionId: created._id.toString(),
                planName: planName,
                customerName: userName,  // Email service expects customerName
                customerEmail: subscribedUser?.email || 'N/A',  // Email service expects customerEmail
                companyName: companyName,
                locations: created.locations || 1,
                startDate: created.createdAt,
                endDate: created.end_date,
                status: created.trial ? 'Active (Trial)' : 'Active',
                trial: created.trial || false,
                totalPrice: created.subtotal || 0,
                finalPrice: created.final_price || created.subtotal || 0,
            };

            const userData = {
                name: userName,
                email: subscribedUser?.email || 'N/A',
            };

            this.logger.log('📊 Email data prepared:', {
                companyName,
                customerName: userName,
                customerEmail: subscribedUser?.email,
                planName,
                trial: created.trial,
            });

            // Send email to admin
            const subCompanyId = created.company_id?.toString();
            await this.emailService.sendAdminSubscriptionCreated(subscriptionData, subCompanyId);
            this.logger.log('✅ Admin notification sent');

            // Send email to user
            await this.emailService.sendUserSubscriptionCreated(userData, subscriptionData, subCompanyId);
            this.logger.log('✅ User notification sent');
        } catch (emailError) {
            this.logger.error('❌ Failed to send email notifications:', emailError);
            // Don't fail the request if email sending fails
        }

        return {
            data: { _id: created._id.toString() },
        };
    }

    @Response('subscription.startTrial')
    @ApiBody({
        description: 'Body payload for creating a subscription plan',
        required: true,
        schema: {
            type: 'object',
            properties: {
                planId: {
                    type: 'string',
                    description: 'The ID of the plan to subscribe to',
                    example: 'plan_123abc',
                },
                user_id: {
                    type: 'string',
                    description: 'The ID of the plan to subscribe to',
                    example: 'plan_123abc',
                },
                trial_days: {
                    type: 'integer',
                    description: 'Number of trial days before billing starts',
                    example: 14,
                },
                tools: {
                    type: 'array',
                    description: 'List of tools included in the plan',
                    items: {
                        type: 'object',
                        properties: {
                            _id: { type: 'string', example: 'tool_001' },
                            name: { type: 'string', example: 'Data Analyzer' },
                            price: { type: 'number', example: 49.99 },
                        },
                    },
                },
                withProvisioning: {
                    type: 'boolean',
                    description: 'Whether to enable automatic provisioning',
                    example: true,
                },
            },
            required: ['planId', 'tools'], // 'user_id'],
        },
    })
    @HttpCode(HttpStatus.CREATED)
    @AuthJwtAccessProtected()
    @ApiBearerAuth('accessToken')
    @Post('/start-trial')
    async startTrial(
        @Body()
        body: {
            planId: string;
            trial_days?: number;
            tools?: Array<{ _id: string; name: string; price: number }>;
            withProvisioning?: boolean;
            user_id: string;
            locations?: number;
        },
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc,
        @AuthJwtPayload('roleName') roleName: string,
    ): Promise<
        IResponse<DatabaseIdResponseDto & { provisioningStatus?: string; appointmentAppCrossLoginUrl?: string }>
    > {
        let userId = body?.user_id;
        if(roleName !== ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            userId = user._id.toString();
        }
        if(!userId) {
            throw new HttpException('User ID is required', HttpStatus.BAD_REQUEST);
        }
        try {
            if(roleName !== ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
                // Check if company has ever had a trial subscription before
                const hasHadTrial = await this.subscriptionService.hasEverHadTrial(userId);
                if (hasHadTrial) {
                    this.logger.warn(`User ${userId} has already used their trial subscription`);
                    throw new HttpException(
                        'Your company has already used the trial subscription. Trial is available only once per company.',
                        HttpStatus.BAD_REQUEST
                    );
                }

                // Check if user/company is eligible for trial (has any subscription - active or inactive)
                const isEligible = await this.subscriptionService.isTrialEligible(userId);
                if (!isEligible) {
                    this.logger.warn(`User ${userId} is not eligible for trial - has existing subscription`);
                    throw new HttpException(
                        'Your company already has a subscription. You cannot start a new trial.',
                        HttpStatus.BAD_REQUEST
                    );
                }

                // Check if user already has an active subscription
                const existingSubscription = await this.subscriptionService.findActiveByUserId(userId);
                if (existingSubscription) {
                    throw new SubscriptionAlreadyExistsException(userId);
                }
            }else{
                // Super Admin is assigning trial to another user
                // Super Admin can assign trial or lifetime plans to any company without restrictions
                if(userId === user?._id?.toString()) {
                    throw new HttpException(
                        'Admin user is not eligible for trial subscription',
                        HttpStatus.BAD_REQUEST
                    )
                }

                // Super Admin bypasses trial eligibility checks - they can assign trial to any company
                this.logger.log(`Super Admin assigning trial to user: ${userId} (bypassing trial restrictions)`);

                // Cancel all existing active subscriptions for this user
                console.log(`🔄 Super Admin assigning trial to user: ${userId}`);
                const existingSubscriptions = await this.subscriptionService.findAll({
                    user_id: userId,
                    status: true,
                    soft_delete: false
                });

                if (existingSubscriptions && existingSubscriptions.length > 0) {
                    console.log(`📋 Found ${existingSubscriptions.length} active subscription(s) to cancel`);
                    for (const existingSub of existingSubscriptions) {
                        await this.subscriptionService.update(existingSub, {
                            status: false,
                            cancelledAt: new Date()
                        });
                        console.log(`   ✅ Cancelled subscription: ${existingSub._id}`);
                    }
                } else {
                    console.log(`   ℹ️  No active subscriptions found to cancel`);
                }
            }

            // Use the provisioning-enabled method by default, or fallback to regular method if specified
            const trialSubscription =
                await this.subscriptionService.createTrialSubscriptionWithProvisioning(
                    // user._id.toString(),
                    userId,
                    body.planId,
                    body.trial_days || 7,
                    body.tools || [],
                    { locations: body.locations || 1 }
                );
            // const trialSubscription =
            //     body.withProvisioning !== false
            //         ? await this.subscriptionService.createTrialSubscriptionWithProvisioning(
            //             // user._id.toString(),
            //             body.user_id,
            //             body.planId,
            //             body.trial_days || 7,
            //             body.tools || []
            //         )
            //         : await this.subscriptionService.createTrialSubscription(
            //             // user._id.toString(),
            //             body.user_id,
            //             body.planId,
            //             body.trial_days || 7,
            //             body.tools || []
            //         );

            // Get the current provisioning status with populated plan
            const subscriptionWithStatus =
                await this.subscriptionService.findOneById(
                    trialSubscription._id.toString(),
                    { join: true }
                );

            // Send email notifications to admin and user
            try {
                this.logger.log('📧 Sending trial subscription email notifications...');

                // Log the subscription details for debugging
                this.logger.log('📋 Raw subscription object keys:', Object.keys(subscriptionWithStatus));
                this.logger.log('📋 Subscription details:', {
                    id: subscriptionWithStatus._id,
                    user_id: subscriptionWithStatus.user_id,
                    company_id: subscriptionWithStatus.company_id,
                    companyId: subscriptionWithStatus['companyId'],
                    plan_id: subscriptionWithStatus.plan_id,
                    trial: subscriptionWithStatus.trial,
                    is_lifetime: subscriptionWithStatus.is_lifetime,
                });

                // Get company name from subscription (check both company_id and companyId)
                let companyName = 'N/A';
                const companyIdField = subscriptionWithStatus?.company_id || subscriptionWithStatus?.['companyId'];

                this.logger.log('🔍 Company ID field:', companyIdField);

                if (companyIdField) {
                    try {
                        const companyId = typeof companyIdField === 'object'
                            ? companyIdField._id?.toString() || companyIdField.toString()
                            : companyIdField.toString();

                        this.logger.log('🔍 Fetching company with ID:', companyId);
                        const company = await this.companyService.findOneById(companyId);

                        // DEBUG: Log the full company object to understand its structure
                        this.logger.log('📦 Company object keys:', company ? Object.keys(company) : 'null/undefined');
                        this.logger.log('📦 Full company object:', JSON.stringify(company, null, 2));

                        companyName = (company as any)?.name || (company as any)?.company_name || 'N/A';
                        this.logger.log(`✅ Company name resolved: ${companyName}`);
                    } catch (err) {
                        this.logger.error('❌ Could not fetch company:', err.message, err.stack);
                    }
                } else {
                    this.logger.warn('⚠️ No company_id or companyId found in subscription');
                }

                // Get user details for email
                const subscribedUser = await this.userService.findOneById(userId);
                const userName = subscribedUser?.name || `${subscribedUser?.first_name || ''} ${subscribedUser?.last_name || ''}`.trim() || 'Unknown';

                // Get plan name - check if plan_id is populated
                let planName = 'Trial Plan';
                this.logger.log('📋 Plan ID type:', typeof subscriptionWithStatus.plan_id);
                this.logger.log('📋 Plan ID value:', subscriptionWithStatus.plan_id);

                if (subscriptionWithStatus?.plan_id) {
                    if (typeof subscriptionWithStatus.plan_id === 'object' && subscriptionWithStatus.plan_id.name) {
                        // Plan is already populated
                        planName = subscriptionWithStatus.plan_id.name;
                        this.logger.log('📋 Plan populated, name:', planName);
                    } else {
                        // Plan ID is not populated, fetch it
                        try {
                            const planId = typeof subscriptionWithStatus.plan_id === 'object'
                                ? subscriptionWithStatus.plan_id._id?.toString() || subscriptionWithStatus.plan_id.toString()
                                : subscriptionWithStatus.plan_id.toString();

                            this.logger.log('🔍 Fetching plan with ID:', planId);
                            const plan = await this.planService.findOneById(planId);

                            // DEBUG: Log the full plan object to understand its structure
                            this.logger.log('📦 Plan object keys:', plan ? Object.keys(plan) : 'null/undefined');
                            this.logger.log('📦 Full plan object:', JSON.stringify(plan, null, 2));

                            planName = (plan as any)?.name || (plan as any)?.plan_name || 'Trial Plan';
                            this.logger.log('✅ Plan name resolved:', planName);
                        } catch (err) {
                            this.logger.warn('❌ Could not fetch plan details:', err.message);
                        }
                    }
                }

                this.logger.log(`✅ Final plan name: ${planName}`);

                // Prepare subscription data for email
                const subscriptionData = {
                    subscriptionId: trialSubscription._id.toString(),
                    planName: planName,
                    customerName: userName,  // Email service expects customerName
                    customerEmail: subscribedUser?.email || 'N/A',  // Email service expects customerEmail
                    companyName: companyName,
                    locations: trialSubscription.locations || body.locations || 1,
                    startDate: trialSubscription.createdAt,
                    endDate: trialSubscription.end_date,
                    status: 'Active (Trial)',
                    trial: true,
                    trialDays: body.trial_days || 7,
                    totalPrice: 0,
                    finalPrice: 0,
                };

                const userData = {
                    name: userName,
                    email: subscribedUser?.email || 'N/A',
                };

                this.logger.log('📊 Email data prepared:', {
                    companyName,
                    customerName: userName,
                    customerEmail: subscribedUser?.email,
                    planName,
                    trial: true,
                });

                // Send email to admin
                const trialCompanyId = trialSubscription.company_id?.toString();
                await this.emailService.sendAdminSubscriptionCreated(subscriptionData, trialCompanyId);
                this.logger.log('✅ Admin notification sent');

                // Send email to user
                await this.emailService.sendUserSubscriptionCreated(userData, subscriptionData, trialCompanyId);
                this.logger.log('✅ User notification sent');
            } catch (emailError) {
                this.logger.error('❌ Failed to send email notifications:', emailError);
                // Don't fail the request if email sending fails
            }

            return {
                data: {
                    _id: trialSubscription._id.toString(),
                    provisioningStatus:
                        subscriptionWithStatus?.provisioningStatus || 'pending',
                },
            };
        } catch (error) {
            // Enhanced error handling for trial provisioning
            if (error.message.includes('Tool provisioning failed')) {
                throw new Error(
                    `Trial subscription created but tool provisioning failed: ${error.message}`
                );
            }
            throw error;
        }
    }

    @Response('subscription.convertTrial')
    @HttpCode(HttpStatus.OK)
    @AuthJwtAccessProtected()
    @Post('/convert-trial/:subscription')
    async convertTrial(
        @Param('subscription') subscriptionId: string,
        @Body()
        body: {
            platform_price: number;
            tools_price: number;
            total_price: number;
            final_price: number;
            recurring?: boolean;
            tools?: any[];
        },
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const subscription =
            await this.subscriptionService.findOneById(subscriptionId);

        // Ensure user can only convert their own trial
        if (subscription.user_id.toString() !== user._id.toString()) {
            throw new Error('Unauthorized access to subscription');
        }

        const converted =
            await this.subscriptionService.convertTrialToSubscription(
                subscriptionId,
                body
            );

        return {
            data: { _id: converted._id.toString() },
        };
    }

    @Response('subscription.checkTrialEligibility')
    @AuthJwtAccessProtected()
    @Get('/trial-eligibility')
    @ApiOperation({
        summary: 'Check if user/company is eligible for trial',
        description: 'Public endpoint - no permissions required. Checks if the user or their company has any previous subscriptions or has ever taken a trial.'
    })
    async checkTrialEligibility(
        @AuthJwtPayload() payload: any
    ): Promise<IResponse<{ eligible: boolean; reason?: string; hasSubscription?: boolean; hasUsedTrial?: boolean }>> {
        this.logger.log(`✅ PUBLIC CONTROLLER - Trial eligibility endpoint HIT!`);
        this.logger.log(`🔍 JWT Payload:`, payload);

        const userId = payload._id || payload.user?._id || payload.user;
        const companyId = payload.companyId || payload.user?.companyId;

        this.logger.log(`🔍 User ID: ${userId}, Company ID: ${companyId}`);

        // Check using user_id (the service will look up company_id internally)
        const checkId = userId?.toString();

        this.logger.log(`🔍 Checking subscription history for user ID: ${checkId}`);

        // Check if company has ever had a trial
        const hasUsedTrial = await this.subscriptionService.hasEverHadTrial(checkId);

        // Check if company has any subscription (active or inactive)
        const hasSubscription = await this.subscriptionService.hasAnySubscription(checkId);

        // Determine eligibility and reason
        let eligible = true;
        let reason = '';

        if (hasUsedTrial) {
            eligible = false;
            reason = 'Your company has already used the trial subscription. Trial is available only once per company.';
        } else if (hasSubscription) {
            eligible = false;
            reason = 'Your company already has a subscription history. Trial is only available for new companies.';
        }

        this.logger.log(`📊 Trial eligibility result: ${eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`);
        if (!eligible) {
            this.logger.log(`   Reason: ${reason}`);
        }

        return {
            data: {
                eligible,
                reason: eligible ? undefined : reason,
                hasSubscription,
                hasUsedTrial
            },
        };
    }

    @ResponsePaging('subscription.mySubscription')
    @AuthJwtAccessProtected()
    @ApiOperation({
        summary: 'Get my subscriptions with pagination',
        description: 'Retrieve a paginated list of current user\'s subscriptions'
    })
    @ApiBearerAuth('accessToken')
    @ApiQuery({
        name: 'search',
        required: false,
        type: String,
        description: 'Search term for payment name or description',
    })
    @Get('/my-subscription')
    async getMySubscription(
        @AuthJwtPayload('user') user: string,
        @PaginationQuery({
            availableSearch: ['plan_type'],
            availableOrderBy: SUBSCRIPTION_DEFAULT_AVAILABLE_ORDER_BY,
        })
        { _search, _limit, _offset, _order }: PaginationListDto
    ): Promise<IResponsePaging<SubscriptionGetResponseDto>> {
        const find: Record<string, any> = {
            ..._search,
            user_id: user,
        };

        const subscriptions = await this.subscriptionService.findAllWithJoins(find, {
            paging: {
                limit: _limit,
                offset: _offset,
            },
            order: _order,
        });

        const total: number = await this.subscriptionService.getTotal(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        const mapped: SubscriptionGetResponseDto[] = await this.subscriptionService.mapGetWithJoinsArray(JSON.parse(JSON.stringify(subscriptions)));

        return {
            _pagination: { total, totalPage },
            data: mapped,
        };
    }

    @Response('subscription.cancel')
    @HttpCode(HttpStatus.OK)
    @AuthJwtAccessProtected()
    @Patch('/cancel')
    async cancelMySubscription(
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const cancelled = await this.subscriptionService.cancelSubscription(
            user._id.toString()
        );

        return {
            data: { _id: cancelled._id.toString() },
        };
    }

    @SubscriptionPublicCancelAllDoc()
    @Response('subscription.cancelAll')
    @HttpCode(HttpStatus.OK)
    @AuthJwtAccessProtected()
    @Post('/cancel-all')
    async cancelAllSubscriptions(
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc
    ): Promise<IResponse<{ cancelled: number }>> {
        // Get company ID from user token (use companyId or fallback to user_id)
        const companyId = user.companyId || user._id.toString();

        // Find all active subscriptions before cancelling
        const activeSubscriptions = await this.subscriptionService.findAll({
            $or: [
                { company_id: companyId },
                { user_id: companyId }
            ],
            status: true,
            soft_delete: false
        });

        this.logger.debug(`Found ${activeSubscriptions.length} subscriptions to cancel for user: ${user._id}`);

        const result = await this.subscriptionService.cancelAllCompanySubscriptions(companyId);

        // Send email notifications and sync for each cancelled subscription
        for (const subscription of activeSubscriptions) {
            this.sendCancelNotifications(subscription._id.toString()).catch(err =>
                this.logger.error('Failed to send cancel notifications:', err)
            );
        }

        return {
            data: result,
        };
    }

    @Response('subscription.get')
    @AuthJwtAccessProtected()
    @Get('/:subscription')
    async get(
        @Param('subscription') subscriptionId: string,
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc
    ): Promise<IResponse<any>> {
        // Use findOneWithJoins to get populated data
        const subscription =
            await this.subscriptionService.findOneWithJoins(subscriptionId);

        if (!subscription) {
            throw new Error('Subscription not found');
        }

        // Ensure user can only access their own subscription
        if (subscription.user_id.toString() !== user._id.toString()) {
            throw new Error('Unauthorized access to subscription');
        }

        const mapped = await this.subscriptionService.mapGetWithJoins(subscription);

        // Include tax_info from env so frontend uses correct tax rate for editing
        const taxLabel = this.configService.get<string>('TAX_LABEL') || 'Tax';
        const taxValue = this.configService.get<number>('TAX_VALUE') || 0;

        return {
            data: {
                ...mapped,
                tax_info: {
                    label: taxLabel,
                    value: taxValue,
                },
            },
        };
    }

    @Response('subscription.updateTools')
    @HttpCode(HttpStatus.OK)
    @AuthJwtAccessProtected()
    @Patch('/update-tools/:subscription')
    async updateTools(
        @Param('subscription') subscriptionId: string,
        @Body() body: {
            locations?: number;
            plan_price?: number;
            tools: Array<{
                _id: string;
                name: string;
                slug?: string;
                base_price: number;
                pricing_mode?: string;
                location_multiplier?: number;
                calculated_price: number;
                is_mandatory?: boolean;
                display_order?: number;
            }>;
            tools_price: number;
            subtotal: number;
            discount_price?: number;
            total?: number;
            tax_price: number;
            final_price: number;
        },
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc,
        @AuthJwtPayload('roleName') roleName: string
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        // Get the subscription
        const subscription = await this.subscriptionService.findOneById(subscriptionId);

        if (!subscription) {
            throw new Error('Subscription not found');
        }

        // For non-admin users, ensure they can only update their own subscription
        if (roleName !== ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            if (subscription.user_id.toString() !== user._id.toString()) {
                throw new Error('Unauthorized access to subscription');
            }
        }

        // Validate location downgrade — block if company has more active locations than new limit
        if (body.locations !== undefined && subscription.company_id) {
            await this.subscriptionService.validateLocationDowngrade(
                subscription.company_id.toString(),
                subscription.locations || 1,
                body.locations
            );
        }

        // Use frontend's calculated values directly
        const locations = body.locations || subscription.locations || 1;
        const planPrice = body.plan_price ?? subscription.plan_price ?? 0;
        const toolsPrice = body.tools_price;
        const subtotal = body.subtotal;
        const discountPrice = body.discount_price || 0;
        const total = body.total || (subtotal - discountPrice);
        const taxPrice = body.tax_price;
        const finalPrice = body.final_price;

        console.log(`💰 Pricing from frontend:`);
        console.log(`   Locations: ${locations}`);
        console.log(`   Plan Price: ${planPrice}`);
        console.log(`   Tools Price: ${toolsPrice}`);
        console.log(`   Subtotal: ${subtotal}`);
        console.log(`   Discount: ${discountPrice}`);
        console.log(`   Total (after discount): ${total}`);
        console.log(`   Tax: ${taxPrice}`);
        console.log(`   Final Price: ${finalPrice}`);

        // Prepare tools with proper structure
        const toolsData = body.tools.map(tool => ({
            _id: tool._id,
            name: tool.name,
            slug: tool.slug || tool.name.toLowerCase().replace(/\s+/g, '-'),
            base_price: tool.base_price,
            pricing_mode: tool.pricing_mode || 'fixed',
            location_multiplier: tool.location_multiplier || 1.0,
            calculated_price: tool.calculated_price,
            is_mandatory: tool.is_mandatory || false,
            display_order: tool.display_order || 0
        }));

        // Get current tax rate from env for storing
        const envTaxRate = this.configService.get<number>('TAX_VALUE') || 0;

        // Update subscription with new tools, locations, and frontend-calculated pricing
        const updateData: any = {
            locations: locations,
            plan_price: planPrice,
            tools: toolsData,
            tools_price: toolsPrice,
            subtotal: subtotal,
            discount_price: discountPrice,
            tax_rate: envTaxRate,  // Store the current tax rate from env
            tax_price: taxPrice,
            final_price: finalPrice,
        };

        const updated = await this.subscriptionService.update(subscription, updateData);

        console.log(`✅ Subscription updated successfully`);
        console.log(`   Locations: ${locations}`);
        console.log(`   Plan Price: $${planPrice.toFixed(2)}`);
        console.log(`   Tools Price: $${toolsPrice.toFixed(2)}`);
        console.log(`   Subtotal: $${subtotal.toFixed(2)}`);
        console.log(`   Discount: $${discountPrice.toFixed(2)}`);
        console.log(`   Tax: $${taxPrice.toFixed(2)}`);
        console.log(`   Final Price: $${finalPrice.toFixed(2)}`);

        // Send admin and user notifications (async, non-blocking)
        this.sendUpdateNotifications(updated._id.toString()).catch(err =>
            this.logger.error('Failed to send update notifications:', err)
        );

        return {
            data: { _id: updated._id.toString() },
        };
    }

    /**
     * Helper method to send admin and user notifications for subscription update
     */
    private async sendUpdateNotifications(subscriptionId: string): Promise<void> {
        try {
            // Fetch subscription with joins to get full data
            const subscriptionWithJoins = await this.subscriptionService.findOneWithJoins(subscriptionId);

            if (!subscriptionWithJoins) {
                this.logger.warn('Could not find subscription with joins for notifications');
                return;
            }

            const subscription = await this.subscriptionService.findOneById(subscriptionId);

            const emailData = {
                companyName: subscriptionWithJoins.company?.company_name || 'N/A',
                customerName: subscriptionWithJoins.user?.name || 'N/A',
                customerEmail: subscriptionWithJoins.user?.email || subscriptionWithJoins.company?.email || 'N/A',
                planName: subscriptionWithJoins.plan?.name || 'N/A',
                locations: subscription.locations || 1,
                totalPrice: subscription.total_price || 0,
                finalPrice: subscription.final_price || subscription.total_price || 0,
                status: subscription.status,
                endDate: subscription.end_date ? new Date(subscription.end_date).toISOString().split('T')[0] : 'N/A',
                discountCode: subscription.discount_code || null,
            };

            // Send admin notification
            await this.emailService.sendAdminSubscriptionUpdated(emailData);
            this.logger.log(`Admin update notification sent for subscription: ${subscriptionId}`);

            // Send user notification
            const userData = {
                name: subscriptionWithJoins.user?.name || 'Customer',
                email: subscriptionWithJoins.user?.email || subscriptionWithJoins.company?.email,
            };

            const subscriptionData = {
                planName: subscriptionWithJoins.plan?.name || 'N/A',
                planType: 'subscription',
                locations: subscription.locations || 1,
                status: subscription.status,
            };

            await this.emailService.sendUserSubscriptionUpdated(userData, subscriptionData);
            this.logger.log(`User update notification sent for subscription: ${subscriptionId}`);
        } catch (error) {
            this.logger.error('Error sending update notifications:', error);
            throw error;
        }
    }

    /**
     * Helper method to send admin and user notifications for subscription cancellation
     */
    private async sendCancelNotifications(subscriptionId: string): Promise<void> {
        try {
            // Fetch subscription with joins to get full data
            const subscriptionWithJoins = await this.subscriptionService.findOneWithJoins(subscriptionId);

            if (!subscriptionWithJoins) {
                this.logger.warn('Could not find subscription with joins for notifications');
                return;
            }

            const subscription = await this.subscriptionService.findOneById(subscriptionId);

            const emailData = {
                companyName: subscriptionWithJoins.company?.company_name || 'N/A',
                customerName: subscriptionWithJoins.user?.name || 'N/A',
                customerEmail: subscriptionWithJoins.user?.email || subscriptionWithJoins.company?.email || 'N/A',
                planName: subscriptionWithJoins.plan?.name || 'N/A',
                cancelledDate: subscription.cancelledAt ? new Date(subscription.cancelledAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                endDate: subscription.end_date ? new Date(subscription.end_date).toISOString().split('T')[0] : 'N/A',
            };

            // Send admin notification
            await this.emailService.sendAdminSubscriptionCancelled(emailData);
            this.logger.log(`Admin cancel notification sent for subscription: ${subscriptionId}`);

            // Send user notification
            const userData = {
                name: subscriptionWithJoins.user?.name || 'Customer',
                email: subscriptionWithJoins.user?.email || subscriptionWithJoins.company?.email,
            };

            const subscriptionData = {
                planName: subscriptionWithJoins.plan?.name || 'N/A',
                cancelledDate: emailData.cancelledDate,
                endDate: emailData.endDate,
            };

            await this.emailService.sendUserSubscriptionCancelled(userData, subscriptionData);
            this.logger.log(`User cancel notification sent for subscription: ${subscriptionId}`);
        } catch (error) {
            this.logger.error('Error sending cancel notifications:', error);
            throw error;
        }
    }
}
