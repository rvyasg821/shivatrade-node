import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiQuery,
    ApiBody,
} from '@nestjs/swagger';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';
import { PlanListResponseDto } from '@modules/plan/dtos/response/plan.list.response.dto';
import { PlanGetResponseDto } from '@modules/plan/dtos/response/plan.get.response.dto';
import { PlanCreateRequestDto } from '@modules/plan/dtos/request/plan.create.request.dto';
import { PlanUpdateRequestDto } from '@modules/plan/dtos/request/plan.update.request.dto';
import { PlanUpdateStatusRequestDto } from '@modules/plan/dtos/request/plan.update-status.request.dto';
import { PlanUpdateDisplayOrderRequestDto } from '@modules/plan/dtos/request/plan.update-display-order.request.dto';

export function PlanAdminListDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get list of plans',
            description: 'Retrieve paginated list of plans with filtering and search capabilities',
        }),
        ApiQuery({
            name: 'search',
            required: false,
            type: String,
            description: 'Search term for plan name or description',
        }),
        ApiQuery({
            name: 'status',
            required: false,
            enum: [1, 0],
            description: 'Filter by plan status (1 = ACTIVE, 0 = INACTIVE)',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Plans retrieved successfully',
            type: PlanListResponseDto,
            isArray: true,
        })
    );
}

export function PlanAdminGetDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get plan details',
            description: 'Retrieve detailed information about a specific plan',
        }),
        ApiParam({
            name: 'plan',
            type: String,
            description: 'Plan ID',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Plan details retrieved successfully',
            type: PlanGetResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Plan not found',
        })
    );
}

export function PlanAdminCreateDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Create new plan',
            description: 'Create a new subscription plan with pricing and features',
        }),
        ApiBody({
            type: PlanCreateRequestDto,
            description: 'Plan creation data',
        }),
        ApiResponse({
            status: HttpStatus.CREATED,
            description: 'Plan created successfully',
            type: DatabaseIdResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.CONFLICT,
            description: 'Plan name already exists',
        })
    );
}

export function PlanAdminUpdateDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Update plan',
            description: 'Update an existing plan information',
        }),
        ApiParam({
            name: 'plan',
            type: String,
            description: 'Plan ID',
        }),
        ApiBody({
            type: PlanUpdateRequestDto,
            description: 'Plan update data',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Plan updated successfully',
            type: DatabaseIdResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Plan not found',
        }),
        ApiResponse({
            status: HttpStatus.CONFLICT,
            description: 'Plan name already exists',
        })
    );
}

export function PlanAdminUpdateStatusDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Update plan status',
            description: 'Change the status of a plan (ACTIVE, INACTIVE, ARCHIVED)',
        }),
        ApiParam({
            name: 'plan',
            type: String,
            description: 'Plan ID',
        }),
        ApiBody({
            type: PlanUpdateStatusRequestDto,
            description: 'Plan status update data',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Plan status updated successfully',
            type: DatabaseIdResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Plan not found',
        })
    );
}

export function PlanAdminSetDefaultDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Set plan as default',
            description: 'Set a plan as the default plan for new users',
        }),
        ApiParam({
            name: 'plan',
            type: String,
            description: 'Plan ID',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Plan set as default successfully',
            type: DatabaseIdResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Plan not found',
        }),
        ApiResponse({
            status: HttpStatus.CONFLICT,
            description: 'Plan is not active',
        })
    );
}

export function PlanAdminUpdateDisplayOrderDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Update plans display order',
            description: 'Update the display order of multiple plans',
        }),
        ApiBody({
            type: PlanUpdateDisplayOrderRequestDto,
            description: 'Plans display order data',
        }),
        ApiResponse({
            status: HttpStatus.NO_CONTENT,
            description: 'Display order updated successfully',
        })
    );
}

export function PlanAdminDeleteDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Delete plan',
            description: 'Soft delete a plan (mark as deleted)',
        }),
        ApiParam({
            name: 'plan',
            type: String,
            description: 'Plan ID',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Plan deleted successfully',
            type: DatabaseIdResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Plan not found',
        })
    );
}

export function PlanAdminAnalyticsDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get plan analytics',
            description: 'Retrieve analytics overview for all plans',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Analytics retrieved successfully',
            schema: {
                type: 'object',
                properties: {
                    total: { type: 'number' },
                    active: { type: 'number' },
                    inactive: { type: 'number' },
                    archived: { type: 'number' },
                    defaultPlan: { $ref: '#/components/schemas/PlanGetResponseDto' },
                },
            },
        })
    );
}