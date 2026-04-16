import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { DiscountApplyResponseDto } from '../dtos/response/discount.apply.response.dto';

export function DiscountPublicApplyDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.public.discount'),
        ApiOperation({
            summary: 'Apply discount code',
            description: 'Validate and apply a discount code to calculate final price',
        }),
        ApiQuery({
            name: 'discount_code',
            required: true,
            type: String,
            description: 'Discount code to apply',
            example: 'SUMMER20',
        }),
        ApiQuery({
            name: 'amount',
            required: true,
            type: Number,
            description: 'Total amount before discount',
            example: 99.99,
        }),
        ApiQuery({
            name: 'date',
            required: false,
            type: String,
            description: 'Date to check validity (YYYY-MM-DD)',
            example: '2024-06-15',
        }),
        ApiQuery({
            name: 'company_id',
            required: false,
            type: String,
            description: 'Company ID',
        }),
        ApiQuery({
            name: 'user_id',
            required: false,
            type: String,
            description: 'User ID',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Discount code validated and applied',
            type: DiscountApplyResponseDto,
        })
    );
}

export function DiscountPublicValidateDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.public.discount'),
        ApiOperation({
            summary: 'Validate discount code',
            description: 'Check if a discount code is valid and active',
        }),
        ApiQuery({
            name: 'discount_code',
            required: true,
            type: String,
            description: 'Discount code to validate',
            example: 'SUMMER20',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Discount code validation result',
        })
    );
}

export function DiscountPublicValidateAndApplyDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.public.discount'),
        ApiOperation({
            summary: 'Validate and apply discount code',
            description: 'Validates discount code against all rules (active status, date range, max occurrences, user usage) and applies it to the amount if valid. Returns detailed validation information and calculated discount.',
        }),
        ApiQuery({
            name: 'discount_code',
            required: true,
            type: String,
            description: 'Discount code to validate and apply',
            example: 'SUMMER20',
        }),
        ApiQuery({
            name: 'amount',
            required: true,
            type: Number,
            description: 'Total amount before discount',
            example: 99.99,
        }),
        ApiQuery({
            name: 'date',
            required: false,
            type: String,
            description: 'Date to check validity (YYYY-MM-DD). Defaults to current date.',
            example: '2024-06-15',
        }),
        ApiQuery({
            name: 'company_id',
            required: false,
            type: String,
            description: 'Company ID (MongoDB ObjectId)',
        }),
        ApiQuery({
            name: 'user_id',
            required: false,
            type: String,
            description: 'User ID (MongoDB ObjectId) - used to check if user has already used this discount',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Discount code validated and applied with detailed information including validation status, discount details, usage statistics, and price preview',
            schema: {
                example: {
                    data: {
                        valid: true,
                        discount_code: 'SUMMER20',
                        discount_id: '507f1f77bcf86cd799439011',
                        message: 'Discount code is valid and can be applied',
                        can_apply: true,
                        discount: {
                            name: 'Summer Sale',
                            description: '20% off summer promotion',
                            type: 'percentage',
                            value: 20,
                            display_value: '20%',
                        },
                        usage: {
                            max_occurances: 100,
                            times_used: 45,
                            remaining_uses: 55,
                            has_limit: true,
                        },
                        validity: {
                            start_date: '2024-06-01T00:00:00.000Z',
                            end_date: '2024-08-31T23:59:59.000Z',
                            is_active: true,
                            days_remaining: 45,
                        },
                        preview: {
                            original_amount: 99.99,
                            discount_amount: 20.00,
                            final_amount: 79.99,
                            savings_percentage: 20.00,
                        },
                    },
                },
            },
        }),
        ApiResponse({
            status: HttpStatus.BAD_REQUEST,
            description: 'Invalid request parameters',
            schema: {
                example: {
                    statusCode: 400,
                    message: 'Discount code is required',
                    error: 'Bad Request',
                },
            },
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Discount code validation failed - various error types',
            schema: {
                examples: {
                    not_found: {
                        value: {
                            data: {
                                valid: false,
                                discount_code: 'INVALID',
                                message: 'Discount code not found',
                                error_type: 'NOT_FOUND',
                                can_apply: false,
                            },
                        },
                    },
                    expired: {
                        value: {
                            data: {
                                valid: false,
                                discount_code: 'EXPIRED20',
                                discount_id: '507f1f77bcf86cd799439011',
                                message: 'This discount code has expired. It was valid until 2024-05-31',
                                error_type: 'EXPIRED',
                                can_apply: false,
                                start_date: '2024-01-01T00:00:00.000Z',
                                end_date: '2024-05-31T23:59:59.000Z',
                            },
                        },
                    },
                    max_usage_reached: {
                        value: {
                            data: {
                                valid: false,
                                discount_code: 'MAXED',
                                discount_id: '507f1f77bcf86cd799439011',
                                message: 'This discount code has reached its maximum usage limit',
                                error_type: 'MAX_USAGE_REACHED',
                                can_apply: false,
                                max_occurances: 100,
                                times_used: 100,
                                remaining_uses: 0,
                            },
                        },
                    },
                    already_used: {
                        value: {
                            data: {
                                valid: false,
                                discount_code: 'USED',
                                discount_id: '507f1f77bcf86cd799439011',
                                message: 'You have already used this discount code',
                                error_type: 'ALREADY_USED',
                                can_apply: false,
                            },
                        },
                    },
                },
            },
        })
    );
}
