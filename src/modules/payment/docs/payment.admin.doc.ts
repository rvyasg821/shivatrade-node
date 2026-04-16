import { DocAuth } from "@common/doc/decorators/doc.decorator";
import { applyDecorators, HttpStatus } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

export function SubscriptionAdminAddToolsDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.admin.subscription'),
        ApiOperation({
            summary: 'Add tools to existing subscription',
            description: 'Add new tools to an active subscription with payment processing through PayPal',
        }),
        ApiBody({
            description: 'Subscription tool addition request',
            schema: {
                type: 'object',
                required: ['subscriptionId', 'tools', 'payment'],
                properties: {
                    subscriptionId: {
                        type: 'string',
                        description: 'Subscription ID to update',
                        example: '507f1f77bcf86cd799439011',
                    },
                    tools: {
                        type: 'array',
                        description: 'Tools to add to the subscription',
                        items: {
                            type: 'object',
                            required: ['_id', 'name', 'price'],
                            properties: {
                                _id: {
                                    type: 'string',
                                    description: 'Tool ID',
                                    example: '507f1f77bcf86cd799439012',
                                },
                                name: {
                                    type: 'string',
                                    description: 'Tool name',
                                    example: 'Advanced Analytics',
                                },
                                price: {
                                    type: 'number',
                                    description: 'Tool price',
                                    example: 29.99,
                                },
                            },
                        },
                    },
                    payment: {
                        type: 'object',
                        description: 'Payment method (either cardId or cardDetails)',
                        properties: {
                            cardId: {
                                type: 'string',
                                description: 'Saved card ID (use this OR cardDetails)',
                                example: '507f1f77bcf86cd799439013',
                            },
                            cardDetails: {
                                type: 'object',
                                description: 'New card details (use this OR cardId)',
                                properties: {
                                    holder_name: {
                                        type: 'string',
                                        example: 'John Doe',
                                    },
                                    card_number: {
                                        type: 'string',
                                        example: '4111111111111111',
                                    },
                                    expiry_month: {
                                        type: 'string',
                                        example: '12',
                                    },
                                    expiry_year: {
                                        type: 'string',
                                        example: '2025',
                                    },
                                    cvv: {
                                        type: 'string',
                                        example: '123',
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Tools added successfully',
            schema: {
                type: 'object',
                properties: {
                    success: {
                        type: 'boolean',
                        example: true,
                    },
                    subscription: {
                        type: 'object',
                        properties: {
                            _id: {
                                type: 'string',
                                example: '507f1f77bcf86cd799439011',
                            },
                            tools: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                },
                            },
                            tools_price: {
                                type: 'number',
                                example: 59.98,
                            },
                            total_price: {
                                type: 'number',
                                example: 109.98,
                            },
                            tax_value: {
                                type: 'number',
                                example: 10.99,
                            },
                            final_price: {
                                type: 'number',
                                example: 120.97,
                            },
                        },
                    },
                    payment: {
                        type: 'object',
                        properties: {
                            _id: {
                                type: 'string',
                                example: '507f1f77bcf86cd799439014',
                            },
                            charge_id: {
                                type: 'string',
                                example: 'PAYID-123456',
                            },
                            status: {
                                type: 'string',
                                example: 'COMPLETED',
                            },
                            amount: {
                                type: 'number',
                                example: 29.99,
                            },
                        },
                    },
                    provisioning: {
                        type: 'object',
                        properties: {
                            status: {
                                type: 'string',
                                example: 'success',
                                enum: ['success', 'partial', 'failed'],
                            },
                            toolsProvisioned: {
                                type: 'number',
                                example: 1,
                            },
                            errors: {
                                type: 'array',
                                items: {
                                    type: 'string',
                                },
                            },
                        },
                    },
                    message: {
                        type: 'string',
                        example: 'Tools added successfully to subscription',
                    },
                },
            },
        }),
        ApiResponse({
            status: HttpStatus.BAD_REQUEST,
            description: 'Invalid input or duplicate tool',
        }),
        ApiResponse({
            status: HttpStatus.PAYMENT_REQUIRED,
            description: 'Payment processing failed',
        }),
        ApiResponse({
            status: HttpStatus.FORBIDDEN,
            description: 'Not authorized to update this subscription',
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Subscription or card not found',
        }),
        ApiResponse({
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            description: 'Internal server error',
        }),
        DocAuth({ jwtAccessToken: true }),
    );
}
