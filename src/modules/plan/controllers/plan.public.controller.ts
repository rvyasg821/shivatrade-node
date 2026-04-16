import {
    Controller,
    Get,
    Param,
    Query,
    Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
    PaginationQuery,
} from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';
import { PaginationService } from '@common/pagination/services/pagination.service';
import { RequestRequiredPipe } from '@common/request/pipes/request.required.pipe';
import {
    Response,
    ResponsePaging,
} from '@common/response/decorators/response.decorator';
import {
    IResponse,
    IResponsePaging,
} from '@common/response/interfaces/response.interface';
import { PlanService } from '@modules/plan/services/plan.service';
import { PlanPublicResponseDto } from '@modules/plan/dtos/response/plan.public.response.dto';
import { ConfigService } from '@nestjs/config';
import { PlanParsePipe } from '@modules/plan/pipes/plan.parse.pipe';
import { PlanDoc } from '@modules/plan/repository/entities/plan.entity';
import { ENUM_PLAN_STATUS } from '@modules/plan/enums/plan.enum';
import { UserService } from '@modules/user/services/user.service';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { IUserDoc } from '@modules/user/interfaces/user.interface';
import {
    PLAN_DEFAULT_AVAILABLE_ORDER_BY,
} from '@modules/plan/constants/plan.list.constant';
import { plainToInstance } from 'class-transformer';
import { PlanPublicFilteredListDoc } from '@modules/plan/docs/plan.public.doc';
import { RoleService } from '@modules/role/services/role.service';

@ApiTags('modules.public.plan')
@Controller({
    version: '1',
    path: '/plan',
})
export class PlanPublicController {
    constructor(
        private readonly paginationService: PaginationService,
        private readonly planService: PlanService,
        private readonly userService: UserService,
        private readonly subscriptionService: SubscriptionService,
        private readonly roleService: RoleService,
        private readonly configService: ConfigService,
    ) { }

    @ResponsePaging('plan.public.list')
    @Get('/list')
    async list(
        @PaginationQuery({
            availableOrderBy: PLAN_DEFAULT_AVAILABLE_ORDER_BY,
        })
        { _limit, _offset, _order }: PaginationListDto
    ): Promise<any> {
        const find: Record<string, any> = {
            status: ENUM_PLAN_STATUS.ACTIVE,
        };

        const plans: PlanDoc[] = await this.planService.findActiveByDisplayOrderWithPopulatedTools({
            paging: {
                limit: _limit,
                offset: _offset,
            },
            order: _order,
        });

        const total: number = await this.planService.getTotal(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        const mapped: PlanPublicResponseDto[] = plainToInstance(
            PlanPublicResponseDto,
            plans
        );

        // Get tax information from environment variables
        const taxLabel = this.configService.get<string>('TAX_LABEL') || 'Tax';
        const taxValue = this.configService.get<number>('TAX_VALUE') || 0;

        // Get payment gateway configuration
        const paymentGateway = this.configService.get<string>('PAYMENT_GATEWAY') || 'stripe';

        return {
            _pagination: { total, totalPage },
            data: mapped,
            tax_info: {
                label: taxLabel,
                value: taxValue,
            },
            payment_gateway: paymentGateway,
        };
    }

    @PlanPublicFilteredListDoc()
    @AuthJwtAccessProtected()
    @Get('/filtered/list')
    async filteredList(
        @PaginationQuery({
            availableOrderBy: PLAN_DEFAULT_AVAILABLE_ORDER_BY,
        })
        { _limit, _offset, _order }: PaginationListDto,
        @AuthJwtPayload('user') currentUserId: string,
        @Query('plan_types') planTypes?: string,
        @Req() request?: any
    ): Promise<any> {
        let find: Record<string, any> = {
            status: ENUM_PLAN_STATUS.ACTIVE,
        };

        let isAdmin = false;
        let isCompanyAdmin = false;
        let hasSubscription = false;

        // Get user context from authentication token
        const user = request?.user;

        if (user && user.user) {
            try {
                // Check if user is admin or company admin
                const role = await this.roleService.findOneById(user.role);

                if (role && role.name === ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
                    isAdmin = true;
                } else if (role && role.name === ENUM_SYSTEM_ROLE.COMPANY_ADMIN) {
                    isCompanyAdmin = true;
                }

                // Check if user has active subscription using subscription service
                if (user && user.user) {
                    const userId = user.user.toString();
                    const activeSubscription = await this.subscriptionService.findActiveByUserId(userId);
                    hasSubscription = !!activeSubscription;
                }

            } catch (error) {
                // If error checking subscription, treat as no subscription
                console.log('Error checking user subscription:', error);
                hasSubscription = false;
            }
        }

        // Debug logging for trial plan filtering
        console.log('🔍 Plan Filtering Debug:');
        console.log(`   User ID: ${currentUserId}`);
        console.log(`   Is Admin: ${isAdmin}`);
        console.log(`   Is Company Admin: ${isCompanyAdmin}`);
        console.log(`   Has Subscription: ${hasSubscription}`);

        // Apply filters based on user context
        if (isCompanyAdmin) {
            // Company Admin - check eligibility for trial during signup
            const isEligible = await this.subscriptionService.isTrialEligible(currentUserId);
            console.log(`   Trial Eligible: ${isEligible}`);

            if (hasSubscription) {
                // Company Admin with active subscription - exclude trial and lifetime
                find.trial = { $ne: true };
                find.is_lifetime = { $ne: true };
                console.log('   ❌ Filtering: Company Admin with subscription - excluding trial and lifetime plans');
            } else if (!isEligible) {
                // Company Admin not eligible for trial (had subscription before) - exclude trial and lifetime
                find.trial = { $ne: true };
                find.is_lifetime = { $ne: true };
                console.log('   ❌ Filtering: Company Admin not eligible for trial - excluding trial and lifetime plans');
            } else {
                // Company Admin during signup (no subscription, is eligible) - allow trial, exclude lifetime
                find.is_lifetime = { $ne: true };
                console.log('   ✅ Company Admin eligible for trial - including trial plans (excluding lifetime)');
            }
        } else if (!isAdmin) {
            // For other non-admin users, exclude lifetime plans
            find.is_lifetime = { $ne: true };
            const isEligible = await this.subscriptionService.isTrialEligible(currentUserId);
            console.log(`   Trial Eligible: ${isEligible}`);
            if (!isEligible) {
                find.trial = { $ne: true };
                console.log('   ❌ Filtering: User not eligible for trial - excluding trial plans');
            } else {
                console.log('   ✅ User IS eligible for trial - including trial plans');
            }
        } else {
            console.log('   ✅ Admin user - including all plan types');
        }

        if (hasSubscription && !isCompanyAdmin) {
            // For non-admin users with subscription, exclude trial plans
            // (Company Admin filtering already handled above)
            find.trial = { $ne: true };
            console.log('   ❌ Filtering: User has active subscription - excluding trial plans');
        }

        console.log('   Final query filters:', JSON.stringify(find, null, 2));

        // Apply plan type filters if provided
        if (planTypes) {
            const typesArray = planTypes.split(',').map(type => type.trim());
            const typeConditions: any[] = [];

            if (typesArray.includes('Trial')) {
                typeConditions.push({ trial: true });
            }

            if (typesArray.includes('Monthly')) {
                typeConditions.push({ duration_type: 'MONTHLY' });
            }

            if (typesArray.includes('Yearly')) {
                typeConditions.push({ duration_type: 'YEARLY' });
            }

            if (typeConditions.length > 0) {
                find.$or = typeConditions;
            }
        }

        const plans: PlanDoc[] = await this.planService.findAllActiveWithPopulatedTools(find, {
            paging: {
                limit: _limit,
                offset: _offset,
            },
            order: _order,
        });

        const total: number = await this.planService.getTotal(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        const mapped: PlanPublicResponseDto[] = plainToInstance(
            PlanPublicResponseDto,
            plans
        );

        // Create filter array based on available plan types in results
        const availableFilters: string[] = [];

        // Check for each plan type and add to filter array if present
        const hasTrial = plans.some(plan => plan.trial === true);
        const hasMonthly = plans.some(plan => plan.duration_type === 'MONTHLY');
        const hasYearly = plans.some(plan => plan.duration_type === 'YEARLY');
        const hasLifetime = plans.some(plan => plan.is_lifetime === true);

        if (hasTrial) availableFilters.push('Trial');
        if (hasMonthly) availableFilters.push('Monthly');
        if (hasYearly) availableFilters.push('Yearly');
        if (hasLifetime) availableFilters.push('Lifetime');

        // Debug logging for returned plans
        console.log('📋 Plans returned:');
        console.log(`   Total plans found: ${plans.length}`);
        console.log(`   Has Trial plans: ${hasTrial}`);
        console.log(`   Has Monthly plans: ${hasMonthly}`);
        console.log(`   Has Yearly plans: ${hasYearly}`);
        console.log(`   Has Lifetime plans: ${hasLifetime}`);
        console.log(`   Available filters: ${availableFilters.join(', ')}`);

        // Log individual plan details
        plans.forEach(plan => {
            console.log(`   - ${plan.name}: trial=${plan.trial}, duration_type=${plan.duration_type}, is_lifetime=${plan.is_lifetime}`);
        });

        // Get tax information from environment variables
        const taxLabel = this.configService.get<string>('TAX_LABEL') || 'Tax';
        const taxValue = this.configService.get<number>('TAX_VALUE') || 0;

        // Get payment gateway configuration
        const paymentGateway = this.configService.get<string>('PAYMENT_GATEWAY') || 'stripe';

        return {
            _pagination: { total, totalPage },
            data: mapped,
            _filters: availableFilters, // Available plan type filters in results
            tax_info: {
                label: taxLabel,
                value: taxValue,
            },
            payment_gateway: paymentGateway,
        };
    }

    @Response('plan.public.get')
    @Get('/:plan')
    async get(
        @Param('plan', RequestRequiredPipe, PlanParsePipe) plan: PlanDoc
    ): Promise<any> {
        // Only return active plans for public access
        if (plan.status !== ENUM_PLAN_STATUS.ACTIVE) {
            throw new Error('Plan not available');
        }

        // Populate tools data for the plan
        const planWithTools = await this.planService.findOneWithPopulatedTools(
            { _id: plan._id },
            {}
        );

        const mapped: PlanPublicResponseDto = plainToInstance(
            PlanPublicResponseDto,
            planWithTools
        );


        return {
            data: mapped,

        };
    }

    @ResponsePaging('plan.public.active')
    @Get('/active/list')
    async activeList(): Promise<any> {
        const plans: PlanDoc[] = await this.planService.findActiveByDisplayOrderWithPopulatedTools();
        const total: number = plans.length;

        const mapped: PlanPublicResponseDto[] = plainToInstance(
            PlanPublicResponseDto,
            plans
        );

        return {
            _pagination: { total, totalPage: 1 },
            data: mapped,

        };
    }

    @Response('plan.public.default')
    @Get('/default/get')
    async getDefault(): Promise<any> {
        const plan: PlanDoc = await this.planService.findDefault();

        // Populate tools data for the plan
        const planWithTools = await this.planService.findOneWithPopulatedTools(
            { _id: plan._id },
            {}
        );

        const mapped: PlanPublicResponseDto = plainToInstance(
            PlanPublicResponseDto,
            planWithTools
        );

        return {
            data: mapped,
        };
    }

    @ResponsePaging('plan.public.compare')
    @Get('/compare')
    async compare(
        @Query('ids') ids: string
    ): Promise<any> {
        if (!ids) {
            return {
                _pagination: { total: 0, totalPage: 0 },
                data: [],
            };
        }

        const planIds = ids.split(',').filter(id => id.trim());
        const plans: PlanDoc[] = [];

        for (const id of planIds) {
            try {
                const plan = await this.planService.findOneByIdWithPopulatedTools(id.trim());
                if (plan && plan.status === ENUM_PLAN_STATUS.ACTIVE) {
                    plans.push(plan);
                }
            } catch (error) {
                // Skip invalid IDs
                continue;
            }
        }

        const total = plans.length;

        const mapped: PlanPublicResponseDto[] = plainToInstance(
            PlanPublicResponseDto,
            plans
        );

        return {
            _pagination: { total, totalPage: 1 },
            data: mapped,
        };
    }

    @ResponsePaging('plan.public.website.pricing')
    @Get('/website/pricing')
    async websitePricing(
        @Query('plan_types') planTypes?: string,
    ): Promise<any> {
        let find: Record<string, any> = {
            status: ENUM_PLAN_STATUS.ACTIVE,
            is_lifetime: { $ne: true },
        };

        // Apply plan type filters if provided
        if (planTypes) {
            const typesArray = planTypes.split(',').map(type => type.trim());
            const typeConditions: any[] = [];

            if (typesArray.includes('Trial')) {
                typeConditions.push({ trial: true });
            }
            if (typesArray.includes('Monthly')) {
                typeConditions.push({ duration_type: 'MONTHLY' });
            }
            if (typesArray.includes('Yearly')) {
                typeConditions.push({ duration_type: 'YEARLY' });
            }

            if (typeConditions.length > 0) {
                find.$or = typeConditions;
            }
        }

        const plans: PlanDoc[] = await this.planService.findAllActiveWithPopulatedTools(find, {
            order: { displayOrder: 'asc' as any },
        });

        const total: number = plans.length;

        const mapped: PlanPublicResponseDto[] = plainToInstance(
            PlanPublicResponseDto,
            plans
        );

        // Build available filters from results
        const availableFilters: string[] = [];
        const hasTrial = plans.some(plan => plan.trial === true);
        const hasMonthly = plans.some(plan => plan.duration_type === 'MONTHLY');
        const hasYearly = plans.some(plan => plan.duration_type === 'YEARLY');

        if (hasTrial) availableFilters.push('Trial');
        if (hasMonthly) availableFilters.push('Monthly');
        if (hasYearly) availableFilters.push('Yearly');

        // Get tax info and payment gateway from config
        const taxLabel = this.configService.get<string>('TAX_LABEL') || 'Tax';
        const taxValue = this.configService.get<number>('TAX_VALUE') || 0;
        const paymentGateway = this.configService.get<string>('PAYMENT_GATEWAY') || 'stripe';

        return {
            _pagination: { total, totalPage: 1 },
            data: mapped,
            _filters: availableFilters,
            tax_info: {
                label: taxLabel,
                value: taxValue,
            },
            payment_gateway: paymentGateway,
        };
    }

    @ResponsePaging('plan.public.pricing')
    @Get('/pricing/overview')
    async pricingOverview(): Promise<any> {
        const plans: PlanDoc[] = await this.planService.findActiveByDisplayOrderWithPopulatedTools();

        const mapped: PlanPublicResponseDto[] = plainToInstance(
            PlanPublicResponseDto,
            plans
        );

        const defaultPlan = plans.find(plan => plan.isDefault);


        return {
            data: {
                plans: mapped,
                defaultPlan: defaultPlan ? plainToInstance(PlanPublicResponseDto, defaultPlan) : null,
                totalPlans: plans.length,
            },
        };
    }
}