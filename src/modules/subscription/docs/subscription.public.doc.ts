import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBody,
} from '@nestjs/swagger';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';
import { SubscriptionGetResponseDto } from '../dtos/response/subscription.get.response.dto';
import { SubscriptionCreateRequestDto } from '../dtos/request/subscription.create.request.dto';

export function SubscriptionPublicCreateDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.public.subscription'),
        ApiOperation({
            summary: 'Create subscription',
            description: 'Create a new subscription for the authenticated user',
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
        ApiResponse({
            status: HttpStatus.UNAUTHORIZED,
            description: 'Unauthorized',
        }),
    );
}

export function SubscriptionPublicGetDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.public.subscription'),
        ApiOperation({
            summary: 'Get my subscription',
            description: 'Get current user\'s active subscription',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Success get subscription',
            type: SubscriptionGetResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'No active subscription found',
        }),
        ApiResponse({
            status: HttpStatus.UNAUTHORIZED,
            description: 'Unauthorized',
        }),
    );
}

export function SubscriptionPublicCancelDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.public.subscription'),
        ApiOperation({
            summary: 'Cancel my subscription',
            description: 'Cancel the current user\'s active subscription',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Success cancel subscription',
            type: DatabaseIdResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'No active subscription found',
        }),
        ApiResponse({
            status: HttpStatus.UNAUTHORIZED,
            description: 'Unauthorized',
        }),
    );
}

export function SubscriptionPublicCancelAllDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.public.subscription'),
        ApiOperation({
            summary: 'Cancel all subscriptions',
            description: 'Cancel all active subscriptions for the user\'s company (takes company ID from token)',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Success cancel all subscriptions',
            schema: {
                type: 'object',
                properties: {
                    statusCode: {
                        type: 'number',
                        description: 'HTTP status code',
                        example: 200,
                    },
                    message: {
                        type: 'string',
                        description: 'Success message',
                        example: 'All company subscriptions cancelled successfully.',
                    },
                    _metadata: {
                        type: 'object',
                        properties: {
                            language: {
                                type: 'string',
                                description: 'Response language',
                                example: 'en',
                            },
                            timestamp: {
                                type: 'number',
                                description: 'Response timestamp',
                                example: 1699123456789,
                            },
                            timezone: {
                                type: 'string',
                                description: 'Server timezone',
                                example: 'UTC',
                            },
                            path: {
                                type: 'string',
                                description: 'API endpoint path',
                                example: '/api/v1/subscription/cancel-all',
                            },
                            version: {
                                type: 'string',
                                description: 'API version',
                                example: '1',
                            },
                            repoVersion: {
                                type: 'string',
                                description: 'Repository version',
                                example: '1.0.0',
                            },
                        },
                    },
                    data: {
                        type: 'object',
                        properties: {
                            cancelled: {
                                type: 'number',
                                description: 'Number of subscriptions cancelled',
                                example: 3,
                            },
                        },
                    },
                },
            },
        }),
        ApiResponse({
            status: HttpStatus.UNAUTHORIZED,
            description: 'Unauthorized',
        }),
    );
}