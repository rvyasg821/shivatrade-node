import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { DiscountGetResponseDto } from '../dtos/response/discount.get.response.dto';

export function DiscountAdminListDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.admin.discount'),
        ApiOperation({
            summary: 'Get discount list',
            description: 'Get paginated list of discounts with search and sorting',
        }),
        ApiQuery({
            name: 'page',
            required: false,
            type: Number,
            description: 'Page number',
            example: 1,
        }),
        ApiQuery({
            name: 'limit',
            required: false,
            type: Number,
            description: 'Items per page',
            example: 20,
        }),
        ApiQuery({
            name: 'search',
            required: false,
            type: String,
            description: 'Search term',
        }),
        ApiQuery({
            name: 'sortBy',
            required: false,
            type: String,
            description: 'Sort field',
            example: 'createdAt',
        }),
        ApiQuery({
            name: 'sortOrder',
            required: false,
            type: String,
            description: 'Sort order',
            example: 'desc',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Discount list retrieved successfully',
        })
    );
}

export function DiscountAdminGetDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.admin.discount'),
        ApiOperation({
            summary: 'Get discount details',
            description: 'Get detailed information about a specific discount',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Discount retrieved successfully',
            type: DiscountGetResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Discount not found',
        })
    );
}

export function DiscountAdminCreateDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.admin.discount'),
        ApiOperation({
            summary: 'Create discount',
            description: 'Create a new discount code',
        }),
        ApiResponse({
            status: HttpStatus.CREATED,
            description: 'Discount created successfully',
            type: DiscountGetResponseDto,
        })
    );
}

export function DiscountAdminUpdateDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.admin.discount'),
        ApiOperation({
            summary: 'Update discount',
            description: 'Update an existing discount',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Discount updated successfully',
            type: DiscountGetResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Discount not found',
        })
    );
}

export function DiscountAdminDeleteDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.admin.discount'),
        ApiOperation({
            summary: 'Delete discount',
            description: 'Delete a discount (soft delete if already applied)',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Discount deleted successfully',
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Discount not found',
        })
    );
}
