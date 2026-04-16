import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
    ApiTags,
    ApiParam,
    ApiQuery,
    ApiOperation,
    ApiResponse,
    ApiBody,
} from '@nestjs/swagger';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';
import { SubscriptionListResponseDto } from '../dtos/response/subscription.list.response.dto';
import { SubscriptionGetResponseDto } from '../dtos/response/subscription.get.response.dto';
import { SubscriptionCreateRequestDto } from '../dtos/request/subscription.create.request.dto';
import { SubscriptionUpdateRequestDto } from '../dtos/request/subscription.update.request.dto';
import { DocAuth } from '@common/doc/decorators/doc.decorator';

export function SubscriptionAdminListDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.admin.subscription'),
        ApiOperation({
            summary: 'Get list of subscriptions',
            description: 'Get paginated list of subscriptions with optional filtering',
        }),
        ApiQuery({
            name: 'search',
            required: false,
            type: 'string',
            description: 'Search term',
            example: 'user123',
        }),
        ApiQuery({
            name: 'page',
            required: false,
            type: 'number',
            description: 'Page number',
            example: 1,
        }),
        ApiQuery({
            name: 'perPage',
            required: false,
            type: 'number',
            description: 'Items per page',
            example: 20,
        }),
        ApiQuery({
            name: 'sort',
            required: false,
            type: 'string',
            description: 'Sort field',
            example: 'createdAt',
        }),
        ApiQuery({
            name: 'availableSort',
            required: false,
            type: 'string',
            description: 'Available sort fields',
        }),
        ApiQuery({
            name: 'user_id',
            required: false,
            type: 'string',
            description: 'Filter by user ID',
        }),
        ApiQuery({
            name: 'status',
            required: false,
            type: 'string',
            description: 'Filter by status (true/false)',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Success get list',
            type: SubscriptionListResponseDto,
            isArray: true,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
    );
}

export function SubscriptionAdminGetDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.admin.subscription'),
        ApiOperation({
            summary: 'Get subscription by ID',
            description: 'Get detailed subscription information by ID',
        }),
        ApiParam({
            name: 'subscription',
            description: 'Subscription ID',
            type: 'string',
            required: true,
            example: '507f1f77bcf86cd799439011',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Success get subscription',
            type: SubscriptionGetResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Subscription not found',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
    );
}

export function SubscriptionAdminCreateDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.admin.subscription'),
        ApiOperation({
            summary: 'Create new subscription',
            description: 'Create a new subscription for a user',
        }),
        ApiBody({
            description: 'Subscription creation data',
            type: SubscriptionCreateRequestDto,
        }),
        ApiResponse({
            status: HttpStatus.CREATED,
            description: 'Success create subscription',
            type: DatabaseIdResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.CONFLICT,
            description: 'User already has an active subscription',
        }),
        ApiResponse({
            status: HttpStatus.BAD_REQUEST,
            description: 'Validation error',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
    );
}

export function SubscriptionAdminUpdateDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.admin.subscription'),
        ApiOperation({
            summary: 'Update subscription',
            description: 'Update subscription information',
        }),
        ApiParam({
            name: 'subscription',
            description: 'Subscription ID',
            type: 'string',
            required: true,
            example: '507f1f77bcf86cd799439011',
        }),
        ApiBody({
            description: 'Subscription update data',
            type: SubscriptionUpdateRequestDto,
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Success update subscription',
            type: DatabaseIdResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Subscription not found',
        }),
        ApiResponse({
            status: HttpStatus.BAD_REQUEST,
            description: 'Validation error',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
    );
}

export function SubscriptionAdminUpdateStatusDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.admin.subscription'),
        ApiOperation({
            summary: 'Update subscription status',
            description: 'Update subscription status (active/inactive)',
        }),
        ApiParam({
            name: 'subscription',
            description: 'Subscription ID',
            type: 'string',
            required: true,
            example: '507f1f77bcf86cd799439011',
        }),
        ApiBody({
            description: 'Status update data',
            schema: {
                type: 'object',
                properties: {
                    status: {
                        type: 'boolean',
                        description: 'Subscription status',
                        example: true,
                    },
                },
                required: ['status'],
            },
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Success update subscription status',
            type: DatabaseIdResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Subscription not found',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
    );
}

export function SubscriptionAdminCancelDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.admin.subscription'),
        ApiOperation({
            summary: 'Cancel subscription',
            description: 'Cancel an active subscription',
        }),
        ApiParam({
            name: 'subscription',
            description: 'Subscription ID',
            type: 'string',
            required: true,
            example: '507f1f77bcf86cd799439011',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Success cancel subscription',
            type: DatabaseIdResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Subscription not found',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
    );
}

export function SubscriptionAdminDeleteDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.admin.subscription'),
        ApiOperation({
            summary: 'Delete subscription',
            description: 'Soft delete a subscription',
        }),
        ApiParam({
            name: 'subscription',
            description: 'Subscription ID',
            type: 'string',
            required: true,
            example: '507f1f77bcf86cd799439011',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Success delete subscription',
            type: DatabaseIdResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Subscription not found',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
    );
}

export function SubscriptionAdminAnalyticsDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.admin.subscription'),
        ApiOperation({
            summary: 'Get subscription analytics',
            description: 'Get subscription analytics and overview data',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Success get analytics',
            schema: {
                type: 'object',
                properties: {
                    total: {
                        type: 'number',
                        description: 'Total subscriptions',
                        example: 150,
                    },
                    active: {
                        type: 'number',
                        description: 'Active subscriptions',
                        example: 120,
                    },
                    inactive: {
                        type: 'number',
                        description: 'Inactive subscriptions',
                        example: 30,
                    },
                    trial: {
                        type: 'number',
                        description: 'Trial subscriptions',
                        example: 25,
                    },
                    lifetime: {
                        type: 'number',
                        description: 'Lifetime subscriptions',
                        example: 10,
                    },
                },
            },
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
    );
}

export function SubscriptionAdminListByCompanyDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.admin.subscription'),
        ApiOperation({
            summary: 'Get subscriptions by company ID',
            description: 'Get paginated list of subscriptions for a specific company with populated plan information',
        }),
        ApiParam({
            name: 'companyId',
            description: 'Company ID',
            type: 'string',
            required: true,
            example: '507f1f77bcf86cd799439011',
        }),
        ApiQuery({
            name: 'search',
            required: false,
            type: 'string',
            description: 'Search term',
            example: 'user123',
        }),
        ApiQuery({
            name: 'page',
            required: false,
            type: 'number',
            description: 'Page number',
            example: 1,
        }),
        ApiQuery({
            name: 'perPage',
            required: false,
            type: 'number',
            description: 'Items per page',
            example: 20,
        }),
        ApiQuery({
            name: 'sort',
            required: false,
            type: 'string',
            description: 'Sort field',
            example: 'createdAt',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Success get subscriptions by company',
            type: SubscriptionListResponseDto,
            isArray: true,
        }),
        ApiResponse({
            status: HttpStatus.BAD_REQUEST,
            description: 'Invalid company ID',
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Company not found',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
    );
}