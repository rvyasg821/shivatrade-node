import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiQuery,
} from '@nestjs/swagger';
import { PlanListResponseDto } from '@modules/plan/dtos/response/plan.list.response.dto';
import { PlanGetResponseDto } from '@modules/plan/dtos/response/plan.get.response.dto';
import { PlanShortResponseDto } from '@modules/plan/dtos/response/plan.short.response.dto';

export function PlanSharedListDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get active plans list',
            description: 'Retrieve paginated list of active plans for authenticated users',
        }),
        ApiQuery({
            name: 'search',
            required: false,
            type: String,
            description: 'Search term for plan name or description',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Active plans retrieved successfully',
            type: PlanListResponseDto,
            isArray: true,
        })
    );
}

export function PlanSharedGetDoc(): MethodDecorator {
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

export function PlanSharedActiveListDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get all active plans',
            description: 'Retrieve all active plans ordered by display order',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Active plans retrieved successfully',
            type: PlanListResponseDto,
            isArray: true,
        })
    );
}

export function PlanSharedShortListDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get plans short list',
            description: 'Retrieve condensed list of active plans with essential information',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Plans short list retrieved successfully',
            type: PlanShortResponseDto,
            isArray: true,
        })
    );
}

export function PlanSharedDefaultDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get default plan',
            description: 'Retrieve the default plan information',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Default plan retrieved successfully',
            type: PlanGetResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Default plan not found',
        })
    );
}

export function PlanSharedCompareDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Compare plans',
            description: 'Compare multiple plans by their IDs',
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
            type: PlanGetResponseDto,
            isArray: true,
        })
    );
}