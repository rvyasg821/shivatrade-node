import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiQuery,
} from '@nestjs/swagger';
import { PlanPublicResponseDto } from '@modules/plan/dtos/response/plan.public.response.dto';
import { DocAuth } from '@common/doc/decorators/doc.decorator';

export function PlanPublicListDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get public plans list',
            description: 'Retrieve paginated list of active plans for public access',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Public plans retrieved successfully',
            type: PlanPublicResponseDto,
            isArray: true,
        })
    );
}

export function PlanPublicGetDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get public plan details',
            description: 'Retrieve public information about a specific active plan',
        }),
        ApiParam({
            name: 'plan',
            type: String,
            description: 'Plan ID',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Public plan details retrieved successfully',
            type: PlanPublicResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Plan not found or not active',
        })
    );
}

export function PlanPublicActiveListDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get all active plans (public)',
            description: 'Retrieve all active plans for public display',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Active plans retrieved successfully',
            type: PlanPublicResponseDto,
            isArray: true,
        })
    );
}

export function PlanPublicFilteredListDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get filtered plans based on user context',
            description: 'Retrieve paginated list of plans filtered by user authentication context. Shows trial plans only for non-subscribed users, excludes lifetime plans for regular users, and shows all plans for admin users.',
        }),
        ApiQuery({
            name: 'plan_types',
            type: String,
            required: false,
            description: 'Optional comma-separated plan types to filter by (Trial, Monthly, Yearly)',
            example: 'Monthly,Yearly',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Filtered plans retrieved successfully based on user context',
            schema: {
                type: 'object',
                properties: {
                    _pagination: {
                        type: 'object',
                        properties: {
                            total: { type: 'number' },
                            totalPage: { type: 'number' },
                        },
                    },
                    data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/PlanPublicResponseDto' },
                    },
                    _filters: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Available plan types in the filtered results (Trial, Monthly, Yearly, Lifetime)',
                        example: ['Monthly', 'Yearly'],
                    },
                },
            },
        }),
        ApiResponse({
            status: HttpStatus.UNAUTHORIZED,
            description: 'Authentication required to access filtered plans',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
    );
}

export function PlanPublicDefaultDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get default plan (public)',
            description: 'Retrieve the default plan for public display',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Default plan retrieved successfully',
            type: PlanPublicResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Default plan not found',
        })
    );
}

export function PlanPublicCompareDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Compare plans (public)',
            description: 'Compare multiple active plans for public display',
        }),
        ApiQuery({
            name: 'ids',
            type: String,
            description: 'Comma-separated plan IDs to compare',
            example: '507f1f77bcf86cd799439011,507f1f77bcf86cd799439012',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Plans comparison retrieved successfully',
            type: PlanPublicResponseDto,
            isArray: true,
        })
    );
}

export function PlanPublicPricingOverviewDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get pricing overview',
            description: 'Retrieve pricing overview with all plans, default plan, and cheapest plan',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Pricing overview retrieved successfully',
            schema: {
                type: 'object',
                properties: {
                    plans: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/PlanPublicResponseDto' },
                    },
                    defaultPlan: { $ref: '#/components/schemas/PlanPublicResponseDto' },
                    cheapestPlan: { $ref: '#/components/schemas/PlanPublicResponseDto' },
                    totalPlans: { type: 'number' },
                },
            },
        })
    );
}