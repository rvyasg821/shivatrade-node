import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    HttpStatus,
    BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Response } from '@common/response/decorators/response.decorator';
import { IResponse } from '@common/response/interfaces/response.interface';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { DiscountService } from '../services/discount.service';
import { DiscountApplyResponseDto } from '../dtos/response/discount.apply.response.dto';

import { DiscountPublicApplyDoc, DiscountPublicValidateDoc, DiscountPublicValidateAndApplyDoc } from '../docs/discount.public.doc';

@ApiTags('modules.public.discount')
@Controller({
    version: '1',
    path: '/discount',
})
export class DiscountPublicController {
    constructor(
        private readonly discountService: DiscountService
    ) {}

    @DiscountPublicApplyDoc()
    @Response('discount.apply')
    @ApiOperation({ summary: 'Apply discount code to amount' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Discount applied successfully',
    })
    @Get('/apply')
    async applyDiscount(
        @Query('discount_code') discountCode: string,
        @Query('amount') amount: number,
        @Query('date') date?: string,
        @Query('company_id') companyId?: string,
        @Query('user_id') userId?: string
    ): Promise<IResponse<DiscountApplyResponseDto>> {
        if (!discountCode) {
            throw new BadRequestException('Discount code required.');
        }

        if (!amount || amount <= 0) {
            throw new BadRequestException('Amount required.');
        }

        if (companyId && !(/^[0-9a-fA-F]{24}$/.test(companyId))) {
            throw new BadRequestException('Invalid company ID format');
        }

        if (userId && !(/^[0-9a-fA-F]{24}$/.test(userId))) {
            throw new BadRequestException('Invalid user ID format');
        }

        const checkDate = date ? new Date(date) : new Date();

        const result = await this.discountService.applyDiscountCode(
            discountCode,
            Number(amount),
            checkDate,
            companyId,
            userId
        );

        return { data: result };
    }

    @DiscountPublicValidateDoc()    
    @Response('discount.validate')
    @ApiOperation({ 
        summary: 'Validate discount code',
        description: 'Validates discount code against all rules: active status, date range, max occurrences, soft delete status'
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Discount code validation result with detailed information',
    })
    @ApiQuery({ name: 'discount_code', required: true, description: 'The discount code to validate' })
    @ApiQuery({ name: 'amount', required: false, description: 'The amount to apply the discount on' })
    @ApiQuery({ name: 'user_id', required: false, description: 'The ID of the user applying the discount' })
    @Get('/validate')
    async validateDiscount(
        @Query('discount_code') discountCode: string,
        @Query('amount') amount?: number,        
        @Query('user_id') userId?: string
    ): Promise<IResponse<any>> {
        if (!discountCode) {
            throw new BadRequestException('Discount code is required');
        }

        // Sanitize discount code
        const sanitizedCode = discountCode.trim().toUpperCase();
        const checkDate = new Date();

        // Find discount by code (including inactive/expired ones for detailed error messages)
        const discount = await this.discountService.findByCode(sanitizedCode);

        // If discount doesn't exist at all
        if (!discount) {
            return {
                data: {
                    valid: false,
                    discount_code: sanitizedCode,
                    message: 'Discount code not found',
                    error_type: 'NOT_FOUND',
                    can_apply: false,
                },
            };
        }

        // Check if soft deleted
        if (discount.deletedAt) {
            return {
                data: {
                    valid: false,
                    discount_code: sanitizedCode,
                    discount_id: discount._id.toString(),
                    message: 'This discount code has been removed and is no longer available',
                    error_type: 'DELETED',
                    can_apply: false,
                    deleted_at: discount.deletedAt,
                },
            };
        }

        // Check if inactive
        if (discount.status === 0) {
            return {
                data: {
                    valid: false,
                    discount_code: sanitizedCode,
                    discount_id: discount._id.toString(),
                    message: 'This discount code is currently suspended',
                    error_type: 'INACTIVE',
                    can_apply: false,
                    status: discount.status,
                },
            };
        }

        // Check date range
        const startDate = discount.start_date;
        const endDate = discount.end_date;
        
        if (startDate && checkDate < startDate) {
            return {
                data: {
                    valid: false,
                    discount_code: sanitizedCode,
                    discount_id: discount._id.toString(),
                    message: `This discount code is not yet active. It will be valid from ${startDate.toISOString().split('T')[0]}`,
                    error_type: 'NOT_STARTED',
                    can_apply: false,
                    start_date: startDate,
                    end_date: endDate,
                },
            };
        }

        if (endDate && checkDate > endDate) {
            return {
                data: {
                    valid: false,
                    discount_code: sanitizedCode,
                    discount_id: discount._id.toString(),
                    message: `This discount code has expired. It was valid until ${endDate.toISOString().split('T')[0]}`,
                    error_type: 'EXPIRED',
                    can_apply: false,
                    start_date: startDate,
                    end_date: endDate,
                },
            };
        }

        if (userId) {
            //check if userId is a valid mongoId or not
            if (!(/^[0-9a-fA-F]{24}$/.test(userId))) {
                throw new BadRequestException('Invalid user ID format');
            }
            //Check if user have already used the discount
            const userAppliedDiscount = await this.discountService.checkUserAppliedDiscount(discount._id.toString(), userId);
            if (userAppliedDiscount) {
                return {
                    data: {
                        valid: false,
                        discount_code: sanitizedCode,
                        discount_id: discount._id.toString(),
                        message: 'You have already used this discount code',
                        error_type: 'ALREADY_USED',
                        can_apply: false,
                    },
                };
            }
        }

        // Check max occurrences
        const appliedCount = await this.discountService.countDiscountApplications(discount._id.toString());
        const maxOccurrences = discount.max_occurances || 0;
        const hasMaxLimit = maxOccurrences > 0;
        const isMaxReached = hasMaxLimit && appliedCount >= maxOccurrences;

        if (isMaxReached) {
            return {
                data: {
                    valid: false,
                    discount_code: sanitizedCode,
                    discount_id: discount._id.toString(),
                    message: 'This discount code has reached its maximum usage limit',
                    error_type: 'MAX_USAGE_REACHED',
                    can_apply: false,
                    max_occurances: maxOccurrences,
                    times_used: appliedCount,
                    remaining_uses: 0,
                },
            };
        }

        // All validations passed - discount is valid
        const remainingUses = hasMaxLimit ? maxOccurrences - appliedCount : null;
        
        // Calculate discount preview if amount is provided
        let discountPreview = null;
        if (amount && amount > 0) {
            let discountAmount = 0;
            if (discount.discount_type === 'percentage') {
                discountAmount = (amount * discount.discount_value) / 100;
            } else {
                discountAmount = discount.discount_value;
            }
            
            // Cap discount at total amount
            if (discountAmount > amount) {
                discountAmount = amount;
            }
            
            discountAmount = Number(discountAmount.toFixed(2));
            const finalAmount = Number((amount - discountAmount).toFixed(2));
            
            discountPreview = {
                original_amount: amount,
                discount_amount: discountAmount,
                final_amount: finalAmount,
                savings_percentage: Number(((discountAmount / amount) * 100).toFixed(2)),
            };
        }

        return {
            data: {
                valid: true,
                discount_code: sanitizedCode,
                discount_id: discount._id.toString(),
                message: 'Discount code is valid and can be applied',
                can_apply: true,
                discount: {
                    name: discount.name,
                    description: discount.description,
                    type: discount.discount_type,
                    value: discount.discount_value,
                    display_value: discount.discount_type === 'percentage' 
                        ? `${discount.discount_value}%` 
                        : `${discount.discount_value}`,
                },
                usage: {
                    max_occurances: maxOccurrences,
                    times_used: appliedCount,
                    remaining_uses: remainingUses,
                    has_limit: hasMaxLimit,
                },
                validity: {
                    start_date: startDate,
                    end_date: endDate,
                    is_active: true,
                    days_remaining: endDate ? Math.ceil((endDate.getTime() - checkDate.getTime()) / (1000 * 60 * 60 * 24)) : null,
                },
                preview: discountPreview,
            },
        };
    }

    @Response('discount.validateWithLocation')
    @ApiOperation({
        summary: 'Validate discount code with location count',
        description: 'Validates discount code including location eligibility rules',
    })
    @ApiQuery({ name: 'discount_code', required: true, description: 'The discount code to validate' })
    @ApiQuery({ name: 'amount', required: true, description: 'The amount to apply the discount on' })
    @ApiQuery({ name: 'locations', required: true, description: 'Number of locations in subscription' })
    @ApiQuery({ name: 'user_id', required: false, description: 'The ID of the user applying the discount' })
    @Get('/validate-with-location')
    async validateDiscountWithLocation(
        @Query('discount_code') discountCode: string,
        @Query('amount') amount: number,
        @Query('locations') locations: number,
        @Query('user_id') userId?: string
    ): Promise<IResponse<any>> {
        if (!discountCode) {
            throw new BadRequestException('Discount code is required');
        }

        if (!amount || amount <= 0) {
            throw new BadRequestException('Amount is required');
        }

        if (!locations || locations <= 0) {
            throw new BadRequestException('Locations count is required');
        }

        const result = await this.discountService.validateDiscountWithLocation(
            discountCode,
            Number(amount),
            Number(locations),
            new Date(),
            undefined,
            userId
        );

        return { data: result };
    }

    @Response('discount.validateOnPlanChange')
    @ApiOperation({
        summary: 'Validate if discount will be lost on plan change',
        description: 'Check if changing to a new location count will invalidate current discount',
    })
    @ApiQuery({ name: 'subscription_id', required: true, description: 'The subscription ID' })
    @ApiQuery({ name: 'new_locations', required: true, description: 'New number of locations' })
    @Get('/validate-on-plan-change')
    @AuthJwtAccessProtected()
    async validateDiscountOnPlanChange(
        @Query('subscription_id') subscriptionId: string,
        @Query('new_locations') newLocations: number
    ): Promise<IResponse<any>> {
        if (!subscriptionId) {
            throw new BadRequestException('Subscription ID is required');
        }

        if (!newLocations || newLocations <= 0) {
            throw new BadRequestException('New locations count is required');
        }

        if (!(/^[0-9a-fA-F]{24}$/.test(subscriptionId))) {
            throw new BadRequestException('Invalid subscription ID format');
        }

        const result = await this.discountService.validateDiscountOnPlanChange(
            subscriptionId,
            Number(newLocations)
        );

        return { data: result };
    }

    @DiscountPublicValidateAndApplyDoc()
    @Response('discount.validateAndApply')
    @Get('/validate-and-apply')
    @AuthJwtAccessProtected()
    async validateAndApplyDiscount(
        @AuthJwtPayload('userId') CurrentUserId: string,
        @Query('discount_code') discountCode: string,
        @Query('amount') amount: number,
        @Query('date') date?: string,
        @Query('company_id') companyId?: string,
        @Query('user_id') userId?: string,
        @Query('locations') locations?: number
    ): Promise<IResponse<any>> {
        if (!discountCode) {
            throw new BadRequestException({
                statusCode:4000,
                message:'discount.error.code_is_required'
            });
        }

        if (!amount || amount <= 0) {
            throw new BadRequestException({
                statusCode:4000,
                message:'discount.error.amount_is_required'
            });
        }

        if (companyId && !(/^[0-9a-fA-F]{24}$/.test(companyId))) {
            throw new BadRequestException({
                statusCode:4000,
                message:'discount.error.invalid_company_id_format'
            });
        }

        if (userId && !(/^[0-9a-fA-F]{24}$/.test(userId))) {
            throw new BadRequestException({
                statusCode:4000,
                message:'discount.error.invalid_user_id_format'
            });
        }

        const checkDate = date ? new Date(date) : new Date();

        // If locations parameter is provided, use location-aware validation
        if (locations && Number(locations) > 0) {
            const result = await this.discountService.validateDiscountWithLocation(
                discountCode,
                Number(amount),
                Number(locations),
                checkDate,
                companyId,
                userId ?? CurrentUserId?.toString()
            );

            return { data: result };
        }

        // Original behavior without location validation
        const result = await this.discountService.validateAndApplyDiscountCode(
            discountCode,
            Number(amount),
            checkDate,
            companyId,
            userId ?? CurrentUserId?.toString()
        );

        return { data: result };
    }

    @Response('discount.bulkGenerate')
    @AuthJwtAccessProtected()
    @ApiOperation({ summary: 'Bulk generate discount codes' })
    @ApiResponse({
        status: HttpStatus.CREATED,
        description: 'Discount codes generated successfully',
    })
    @Post('/bulk-generate')
    async bulkGenerateDiscounts(
        @Body() body: { codes: any[] }
    ): Promise<IResponse<any>> {
        if (!body.codes || !Array.isArray(body.codes) || body.codes.length === 0) {
            throw new BadRequestException('Codes array is required');
        }

        const createdDiscounts = [];
        const errors = [];

        // Check for duplicate discount codes in the database
        for (const codeData of body.codes) {
            try {
                // Check if code already exists
                const existingDiscount = await this.discountService.findByCode(codeData.discount_code);
                if (existingDiscount) {
                    errors.push({
                        code: codeData.discount_code,
                        error: 'Discount code already exists',
                    });
                    continue;
                }

                // Create discount
                const discountPayload = {
                    name: codeData.name,
                    discount_code: codeData.discount_code,
                    discount_type: codeData.discount_type,
                    discount_value: codeData.discount_value,
                    duration_type: codeData.duration_type,
                    duration_months: codeData.duration_months,
                    start_date: new Date(codeData.start_date),
                    end_date: new Date(codeData.end_date),
                    max_occurances: codeData.max_occurrences,
                    location_rules: codeData.location_rules || [],
                    status: codeData.status === 'ACTIVE' ? 1 : 0,
                };

                const created = await this.discountService.create(discountPayload);
                createdDiscounts.push(created);
            } catch (error) {
                errors.push({
                    code: codeData.discount_code,
                    error: error.message || 'Failed to create discount',
                });
            }
        }

        return {
            data: {
                success: createdDiscounts.length,
                failed: errors.length,
                created: createdDiscounts.map(d => d._id),
                errors: errors,
            },
        };
    }
}
