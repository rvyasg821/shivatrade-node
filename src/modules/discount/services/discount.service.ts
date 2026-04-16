import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
    IDatabaseCreateOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseSaveOptions,
} from '@common/database/interfaces/database.interface';
import { DiscountRepository } from '../repository/repositories/discount.repository';
import { DiscountAppliedRepository } from '../repository/repositories/discount-applied.repository';
import {
    DiscountDoc,
    DiscountEntity,
    ENUM_DISCOUNT_TYPE,
    ENUM_DURATION_TYPE,
    ENUM_LOCATION_RULE_TYPE,
    ILocationRule,
} from '../repository/entities/discount.entity';
import {
    DiscountAppliedDoc,
    DiscountAppliedEntity,
    ENUM_EXHAUSTED_REASON,
} from '../repository/entities/discount-applied.entity';
import { DiscountCreateRequestDto } from '../dtos/request/discount.create.request.dto';
import { DiscountUpdateRequestDto } from '../dtos/request/discount.update.request.dto';
import { DiscountGetResponseDto } from '../dtos/response/discount.get.response.dto';
import { DiscountListResponseDto } from '../dtos/response/discount.list.response.dto';
import { DiscountApplyResponseDto } from '../dtos/response/discount.apply.response.dto';
import { HelperDateService } from '@common/helper/services/helper.date.service';
import { HelperNumberService } from '@common/helper/services/helper.number.service';
import { customAlphabet } from 'nanoid';
import { ENUM_DISCOUNT_STATUS } from '../enums/discount.enum';

@Injectable()
export class DiscountService {
    private readonly logger = new Logger(DiscountService.name);

    constructor(
        private readonly discountRepository: DiscountRepository,
        private readonly discountAppliedRepository: DiscountAppliedRepository,
        private readonly helperDateService: HelperDateService,
        private readonly helperNumberService: HelperNumberService
    ) {}

    async findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<DiscountDoc[]> {
        const filters = {
            ...find,
            deletedAt: null,
        };
        return this.discountRepository.findAll<DiscountDoc>(filters, options);
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        const filters = {
            ...find,
            deletedAt: null,
        };
        return this.discountRepository.getTotal(filters, options);
    }

    async findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<DiscountDoc> {
        return this.discountRepository.findOneById<DiscountDoc>(_id, options);
    }

    async findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<DiscountDoc> {
        return this.discountRepository.findOne<DiscountDoc>(find, options);
    }

    async findByCode(code: string): Promise<DiscountDoc> {
        return this.discountRepository.findByCode(code);
    }

    async findActiveByCode(code: string, date?: Date): Promise<DiscountDoc> {
        return this.discountRepository.findActiveByCode(code, date);
    }

    async countByStatus(status: number): Promise<number> {
        return this.discountRepository.countByStatus(status);
    }

    async create(
        data: DiscountCreateRequestDto & { discount_code?: string },
        options?: IDatabaseCreateOptions
    ): Promise<DiscountDoc> {
        // Use provided discount code or generate a new one
        let discountCode = data.discount_code;
        if (!discountCode) {
            const nanoid = customAlphabet(
                'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                8
            );
            discountCode = nanoid();
        }

        const create: DiscountEntity = new DiscountEntity();
        create.name = data.name;
        create.discount_type = data.discount_type;
        create.discount_value = data.discount_value;
        create.discount_code = discountCode;
        create.description = data.description || '';
        create.max_occurances = data.max_occurances || 0;
        create.start_date = data.start_date || null;
        create.end_date = data.end_date || null;
        create.status = data.status !== undefined ? data.status : 1;
        create.is_expired = false;
        create.deletedAt = null;

        // Duration control
        create.duration_type = data.duration_type || ENUM_DURATION_TYPE.FOREVER;
        create.duration_months = data.duration_months || null;

        // Location rules
        create.location_rules = data.location_rules || [];

        return this.discountRepository.create<DiscountEntity>(create, options);
    }

    async update(
        repository: DiscountDoc,
        data: DiscountUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<DiscountDoc> {
        if (data.name !== undefined) repository.name = data.name;
        if (data.discount_type !== undefined)
            repository.discount_type = data.discount_type;
        if (data.discount_value !== undefined)
            repository.discount_value = data.discount_value;
        if (data.description !== undefined)
            repository.description = data.description;
        if (data.max_occurances !== undefined)
            repository.max_occurances = data.max_occurances;
        if (data.start_date !== undefined)
            repository.start_date = data.start_date;
        if (data.end_date !== undefined) repository.end_date = data.end_date;
        if (data.status !== undefined) repository.status = data.status;

        // Duration control
        if (data.duration_type !== undefined)
            repository.duration_type = data.duration_type;
        if (data.duration_months !== undefined)
            repository.duration_months = data.duration_months;

        // Location rules
        if (data.location_rules !== undefined)
            repository.location_rules = data.location_rules;

        return this.discountRepository.save(repository, options);
    }

    async softDelete(
        repository: DiscountDoc,
        options?: IDatabaseSaveOptions
    ): Promise<DiscountDoc> {
        repository.deletedAt = new Date();
        repository.status = ENUM_DISCOUNT_STATUS.INACTIVE;
        repository.deleted = true;

        return this.discountRepository.save(repository, options);
    }

    async delete(repository: DiscountDoc): Promise<boolean> {
        await this.discountRepository.delete({ _id: repository._id });
        return true;
    }

    async softDeleteMany(ids: string[]): Promise<number> {
        return this.discountRepository.softDeleteManyByIds(ids);
    }

    async hardDeleteMany(ids: string[]): Promise<number> {
        return this.discountRepository.hardDeleteManyByIds(ids);
    }

    /**
     * Apply and validate discount code
     */
    async applyDiscountCode(
        discountCode: string,
        amount: number,
        date?: Date,
        companyId?: string,
        userId?: string
    ): Promise<DiscountApplyResponseDto> {
        const checkDate = date || new Date();
        const totalPrice = amount;

        let isCodeValid = false;
        let isCodeApplied = false;
        let isMaxOccurred = false;
        let isExpired = false;
        let isInvalid = false;
        let discountedPrice = 0;
        let finalPrice = totalPrice;
        let message = 'Discount code not valid or expired.';

        // Find active discount
        const discount = await this.findActiveByCode(discountCode, checkDate);

        // Find discount detail (for error messages)
        const discountDetail = await this.findByCode(discountCode);

        if (discount && discount._id) {
            isCodeValid = true;

            // Check max occurrences
            const appliedCount =
                await this.discountAppliedRepository.countByDiscountId(
                    discount._id.toString()
                );

            if (
                discount.max_occurances &&
                discount.max_occurances <= appliedCount
            ) {
                isCodeValid = false;
                isMaxOccurred = true;
                message = 'Discount code limit exceeded.';
            }

            if (isCodeValid && !isMaxOccurred) {
                isCodeApplied = true;
                message = `Discount code applied${discount.name ? ` - ${discount.name}` : ''}`;

                // Calculate discount
                if (discount.discount_type === ENUM_DISCOUNT_TYPE.PERCENTAGE) {
                    discountedPrice =
                        (totalPrice * discount.discount_value) / 100;
                } else {
                    discountedPrice = discount.discount_value;
                }

                // Calculate final price
                if (totalPrice >= discountedPrice) {
                    finalPrice = totalPrice - discountedPrice;
                } else {
                    discountedPrice = totalPrice;
                    finalPrice = 0;
                }
            }
        }

        // Check if code is expired or invalid
        if (!isCodeValid && !isMaxOccurred && discountDetail) {
            const startDate = discountDetail.start_date;
            const endDate = discountDetail.end_date;

            if (
                startDate &&
                endDate &&
                (checkDate < startDate || checkDate > endDate)
            ) {
                isExpired = true;
                message = `We are sorry! The code you have entered is valid between ${this.helperDateService.formatToIsoDate(startDate)} to ${this.helperDateService.formatToIsoDate(endDate)}.`;
            } else if (
                discountDetail.deletedAt ||
                discountDetail.status === 0
            ) {
                isInvalid = true;
                message =
                    'We are sorry! The code you have entered is suspended.';
            } else {
                isInvalid = true;
                message =
                    'It seems the code you have entered is incorrect. Please try with the same code that you have received.';
            }
        }

        return plainToInstance(DiscountApplyResponseDto, {
            flag: isCodeApplied,
            message,
            data: discount ? this.mapGet(discount) : null,
            total_price: totalPrice,
            discounted_price: discountedPrice,
            price: finalPrice,
            is_code_valid: isCodeValid,
            is_code_applied: isCodeApplied,
            is_max_occurred: isMaxOccurred,
            is_expired: isExpired,
            is_invalid: isInvalid,
            start_date: discountDetail?.start_date,
            end_date: discountDetail?.end_date,
        });
    }

    /**
     * Record discount application with duration tracking
     */
    async recordDiscountApplication(
        companyId: string,
        userId: string,
        subscriptionId: string,
        discountId: string,
        discountCode: string,
        discountPrice: number,
        discount?: DiscountDoc,
        options?: IDatabaseCreateOptions
    ): Promise<DiscountAppliedDoc> {
        const create: DiscountAppliedEntity = new DiscountAppliedEntity();
        create.company_id = companyId;
        create.user_id = userId;
        create.subscription_id = subscriptionId;
        create.discount_id = discountId;
        create.discount_code = discountCode;
        create.discount_price = discountPrice;

        // Duration tracking initialization
        const now = new Date();
        create.applied_count = 1;
        create.first_applied_at = now;
        create.last_applied_at = now;

        // Set remaining months based on duration type
        if (discount) {
            if (discount.duration_type === ENUM_DURATION_TYPE.FIRST_PAYMENT) {
                create.remaining_months = 0;
                create.is_exhausted = true;
                create.exhausted_reason = ENUM_EXHAUSTED_REASON.DURATION_COMPLETED;
            } else if (discount.duration_type === ENUM_DURATION_TYPE.LIMITED_MONTHS) {
                create.remaining_months = (discount.duration_months || 1) - 1; // -1 because first payment already applied
                create.is_exhausted = create.remaining_months <= 0;
                if (create.is_exhausted) {
                    create.exhausted_reason = ENUM_EXHAUSTED_REASON.DURATION_COMPLETED;
                }
            } else {
                // FOREVER
                create.remaining_months = null;
                create.is_exhausted = false;
            }
        } else {
            create.remaining_months = null;
            create.is_exhausted = false;
        }

        return this.discountAppliedRepository.create<DiscountAppliedEntity>(
            create,
            options
        );
    }

    /**
     * Mark expired discounts
     */
    async markExpiredDiscounts(): Promise<number> {
        const expiredDiscounts =
            await this.discountRepository.findExpiredDiscounts();
        let count = 0;

        for (const discount of expiredDiscounts) {
            discount.is_expired = true;
            await this.discountRepository.save(discount);
            count++;
        }

        this.logger.log(`Marked ${count} discounts as expired`);
        return count;
    }

    mapList(discounts: DiscountDoc[]): DiscountListResponseDto[] {
        return plainToInstance(
            DiscountListResponseDto,
            discounts.map((discount: DiscountDoc) =>
                (discount as any).toObject ? (discount as any).toObject() : discount
            )
        );
    }

    mapGet(discount: DiscountDoc): DiscountGetResponseDto {
        return plainToInstance(
            DiscountGetResponseDto,
            (discount as any).toObject ? (discount as any).toObject() : discount
        );
    }

    /**
     * Count how many times a discount has been applied
     */
    async countDiscountApplications(discountId: string): Promise<number> {
        return this.discountAppliedRepository.countByDiscountId(discountId);
    }

    async checkUserAppliedDiscount(
        discountId: string,
        userId: string
    ): Promise<boolean> {
        const count =
            await this.discountAppliedRepository.countByDiscountIdAndUserId(
                discountId,
                userId
            );
        return count > 0;
    }

    /**
     * Validate and apply discount code with detailed response
     * Combines validation details with apply calculation
     */
    async validateAndApplyDiscountCode(
        discountCode: string,
        amount: number,
        date?: Date,
        companyId?: string,
        userId?: string
    ): Promise<any> {
        const sanitizedCode = discountCode.trim().toUpperCase();
        const checkDate = date || new Date();

        // Find discount by code (including inactive/expired ones for detailed error messages)
        const discount = await this.findByCode(sanitizedCode);

        // If discount doesn't exist at all
        if (!discount) {
            return {
                valid: false,
                discount_code: sanitizedCode,
                message: 'Discount code not found',
                error_type: 'NOT_FOUND',
                can_apply: false,
                flag: false,
                is_code_valid: false,
                is_code_applied: false,
                total_price: amount,
                discounted_price: 0,
                price: amount,
            };
        }

        // Check if soft deleted
        if (discount.deletedAt) {
            return {
                valid: false,
                discount_code: sanitizedCode,
                discount_id: discount._id.toString(),
                message: 'This discount code has been removed and is no longer available',
                error_type: 'DELETED',
                can_apply: false,
                deleted_at: discount.deletedAt,
                flag: false,
                is_code_valid: false,
                is_code_applied: false,
                is_invalid: true,
                total_price: amount,
                discounted_price: 0,
                price: amount,
            };
        }

        // Check if inactive
        if (discount.status === 0) {
            return {
                valid: false,
                discount_code: sanitizedCode,
                discount_id: discount._id.toString(),
                message: 'This discount code is currently suspended',
                error_type: 'INACTIVE',
                can_apply: false,
                status: discount.status,
                flag: false,
                is_code_valid: false,
                is_code_applied: false,
                is_invalid: true,
                total_price: amount,
                discounted_price: 0,
                price: amount,
            };
        }

        // Check date range
        const startDate = discount.start_date;
        const endDate = discount.end_date;

        if (startDate && checkDate < startDate) {
            return {
                valid: false,
                discount_code: sanitizedCode,
                discount_id: discount._id.toString(),
                message: `This discount code is not yet active. It will be valid from ${startDate.toISOString().split('T')[0]}`,
                error_type: 'NOT_STARTED',
                can_apply: false,
                start_date: startDate,
                end_date: endDate,
                flag: false,
                is_code_valid: false,
                is_code_applied: false,
                is_expired: true,
                total_price: amount,
                discounted_price: 0,
                price: amount,
            };
        }

        if (endDate && checkDate > endDate) {
            return {
                valid: false,
                discount_code: sanitizedCode,
                discount_id: discount._id.toString(),
                message: `This discount code has expired. It was valid until ${endDate.toISOString().split('T')[0]}`,
                error_type: 'EXPIRED',
                can_apply: false,
                start_date: startDate,
                end_date: endDate,
                flag: false,
                is_code_valid: false,
                is_code_applied: false,
                is_expired: true,
                total_price: amount,
                discounted_price: 0,
                price: amount,
            };
        }

        if (userId) {
            // Check if user has already used the discount
            const userAppliedDiscount = await this.checkUserAppliedDiscount(
                discount._id.toString(),
                userId
            );
            if (userAppliedDiscount) {
                return {
                    valid: false,
                    discount_code: sanitizedCode,
                    discount_id: discount._id.toString(),
                    message: 'You have already used this discount code',
                    error_type: 'ALREADY_USED',
                    can_apply: false,
                    flag: false,
                    is_code_valid: false,
                    is_code_applied: false,
                    total_price: amount,
                    discounted_price: 0,
                    price: amount,
                };
            }
        }

        // Check max occurrences
        const appliedCount = await this.countDiscountApplications(
            discount._id.toString()
        );
        const maxOccurrences = discount.max_occurances || 0;
        const hasMaxLimit = maxOccurrences > 0;
        const isMaxReached = hasMaxLimit && appliedCount >= maxOccurrences;

        if (isMaxReached) {
            return {
                valid: false,
                discount_code: sanitizedCode,
                discount_id: discount._id.toString(),
                message: 'This discount code has reached its maximum usage limit',
                error_type: 'MAX_USAGE_REACHED',
                can_apply: false,
                max_occurances: maxOccurrences,
                times_used: appliedCount,
                remaining_uses: 0,
                flag: false,
                is_code_valid: false,
                is_code_applied: false,
                is_max_occurred: true,
                total_price: amount,
                discounted_price: 0,
                price: amount,
            };
        }

        // All validations passed - calculate discount
        const remainingUses = hasMaxLimit ? maxOccurrences - appliedCount : null;

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

        return {
            valid: true,
            discount_code: sanitizedCode,
            discount_id: discount._id.toString(),
            message: `Discount code applied${discount.name ? ` - ${discount.name}` : ''}`,
            can_apply: true,
            flag: true,
            is_code_valid: true,
            is_code_applied: true,
            is_max_occurred: false,
            is_expired: false,
            is_invalid: false,
            // Apply response fields
            // data: this.mapGet(discount),
            total_price: amount,
            discounted_price: discountAmount,
            price: finalAmount,
            // Validation response fields
            discount: {
                name: discount.name,
                description: discount.description,
                type: discount.discount_type,
                value: discount.discount_value,
                display_value:
                    discount.discount_type === 'percentage'
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
                days_remaining: endDate
                    ? Math.ceil(
                          (endDate.getTime() - checkDate.getTime()) /
                              (1000 * 60 * 60 * 24)
                      )
                    : null,
            },
            preview: {
                original_amount: amount,
                discount_amount: discountAmount,
                final_amount: finalAmount,
                savings_percentage: Number(
                    ((discountAmount / amount) * 100).toFixed(2)
                ),
            },
            // Duration info
            duration: {
                type: discount.duration_type || ENUM_DURATION_TYPE.FOREVER,
                months: discount.duration_months || null,
            },
            // Location rules info
            location_rules: discount.location_rules || [],
        };
    }

    /**
     * Check if location count matches discount eligibility rules
     * Returns true if eligible, false otherwise
     */
    checkLocationEligibility(
        locationRules: ILocationRule[],
        locationCount: number
    ): boolean {
        // No rules = applies to all
        if (!locationRules || locationRules.length === 0) {
            return true;
        }

        // OR logic - any rule match = eligible
        return locationRules.some((rule) => {
            switch (rule.type) {
                case ENUM_LOCATION_RULE_TYPE.ANY:
                    return true;
                case ENUM_LOCATION_RULE_TYPE.EXACT:
                    return locationCount === rule.value;
                case ENUM_LOCATION_RULE_TYPE.MINIMUM:
                    return locationCount >= (rule.value || 0);
                case ENUM_LOCATION_RULE_TYPE.MAXIMUM:
                    return locationCount <= (rule.value || Infinity);
                case ENUM_LOCATION_RULE_TYPE.RANGE:
                    return (
                        locationCount >= (rule.min || 0) &&
                        locationCount <= (rule.max || Infinity)
                    );
                default:
                    return false;
            }
        });
    }

    /**
     * Validate discount code with location eligibility
     */
    async validateDiscountWithLocation(
        discountCode: string,
        amount: number,
        locationCount: number,
        date?: Date,
        companyId?: string,
        userId?: string
    ): Promise<any> {
        // First, perform standard validation
        const result = await this.validateAndApplyDiscountCode(
            discountCode,
            amount,
            date,
            companyId,
            userId
        );

        // If already invalid, return as-is
        if (!result.valid) {
            return result;
        }

        // Get discount to check location rules
        const discount = await this.findByCode(discountCode.trim().toUpperCase());
        if (!discount) {
            return result;
        }

        // Check location eligibility
        const locationRules = discount.location_rules || [];
        const isLocationEligible = this.checkLocationEligibility(
            locationRules,
            locationCount
        );

        if (!isLocationEligible) {
            // Build descriptive message explaining the discount criteria
            const rulesDescription = this.formatLocationRulesDescription(locationRules);
            const discountName = discount.name ? ` "${discount.name}"` : '';
            const durationInfo = this.formatDurationDescription(discount);

            let message = `This discount code${discountName} requires ${rulesDescription}. Your current selection has ${locationCount} location(s).`;
            if (durationInfo) {
                message += ` Note: ${durationInfo}.`;
            }

            return {
                ...result,
                valid: false,
                can_apply: false,
                flag: false,
                is_code_valid: false,
                is_code_applied: false,
                message,
                error_type: 'LOCATION_NOT_ELIGIBLE',
                location_rules: locationRules,
                current_locations: locationCount,
                required_locations: rulesDescription,
                duration_info: durationInfo,
            };
        }

        // Build descriptive success message with duration info
        let successMessage = result.message;
        const durationInfo = this.formatDurationDescription(discount);
        if (durationInfo) {
            successMessage = `${result.message} (${durationInfo})`;
        }

        return {
            ...result,
            message: successMessage,
            location_rules: locationRules,
            current_locations: locationCount,
            is_location_eligible: true,
            duration_info: durationInfo,
        };
    }

    /**
     * Format duration type into human-readable description
     */
    formatDurationDescription(discount: DiscountDoc): string | null {
        if (!discount.duration_type || discount.duration_type === ENUM_DURATION_TYPE.FOREVER) {
            return null; // No special duration message for forever discounts
        }

        if (discount.duration_type === ENUM_DURATION_TYPE.FIRST_PAYMENT) {
            return 'Valid for first payment only';
        }

        if (discount.duration_type === ENUM_DURATION_TYPE.LIMITED_MONTHS) {
            const months = discount.duration_months || 1;
            return months === 1
                ? 'Valid for 1 month'
                : `Valid for ${months} months`;
        }

        return null;
    }

    /**
     * Get discount applied record for a subscription
     */
    async getDiscountAppliedBySubscription(
        subscriptionId: string
    ): Promise<DiscountAppliedDoc | null> {
        return this.discountAppliedRepository.findOne({
            subscription_id: subscriptionId,
            is_exhausted: false,
        });
    }

    /**
     * Update discount applied for recurring payment
     * Returns true if discount should be applied, false if exhausted
     */
    async processRecurringDiscount(
        discountApplied: DiscountAppliedDoc,
        discount: DiscountDoc
    ): Promise<{ shouldApply: boolean; discountApplied: DiscountAppliedDoc }> {
        // Check if already exhausted
        if (discountApplied.is_exhausted) {
            return { shouldApply: false, discountApplied };
        }

        const now = new Date();

        // Check discount expiry
        if (discount.end_date && now > discount.end_date) {
            discountApplied.is_exhausted = true;
            discountApplied.exhausted_reason = ENUM_EXHAUSTED_REASON.DISCOUNT_EXPIRED;
            await this.discountAppliedRepository.save(discountApplied);
            return { shouldApply: false, discountApplied };
        }

        // Handle based on duration type
        if (discount.duration_type === ENUM_DURATION_TYPE.FOREVER) {
            // Always apply
            discountApplied.applied_count = (discountApplied.applied_count || 0) + 1;
            discountApplied.last_applied_at = now;
            await this.discountAppliedRepository.save(discountApplied);
            return { shouldApply: true, discountApplied };
        }

        if (discount.duration_type === ENUM_DURATION_TYPE.FIRST_PAYMENT) {
            // Already exhausted on first payment
            return { shouldApply: false, discountApplied };
        }

        if (discount.duration_type === ENUM_DURATION_TYPE.LIMITED_MONTHS) {
            const remainingMonths = discountApplied.remaining_months ?? 0;

            if (remainingMonths <= 0) {
                // No more months remaining
                if (!discountApplied.is_exhausted) {
                    discountApplied.is_exhausted = true;
                    discountApplied.exhausted_reason = ENUM_EXHAUSTED_REASON.DURATION_COMPLETED;
                    await this.discountAppliedRepository.save(discountApplied);
                }
                return { shouldApply: false, discountApplied };
            }

            // Apply and decrement
            discountApplied.applied_count = (discountApplied.applied_count || 0) + 1;
            discountApplied.remaining_months = remainingMonths - 1;
            discountApplied.last_applied_at = now;

            if (discountApplied.remaining_months <= 0) {
                discountApplied.is_exhausted = true;
                discountApplied.exhausted_reason = ENUM_EXHAUSTED_REASON.DURATION_COMPLETED;
            }

            await this.discountAppliedRepository.save(discountApplied);
            return { shouldApply: true, discountApplied };
        }

        return { shouldApply: false, discountApplied };
    }

    /**
     * Remove discount from subscription due to location criteria not met
     */
    async removeDiscountForLocationMismatch(
        subscriptionId: string
    ): Promise<DiscountAppliedDoc | null> {
        const discountApplied = await this.discountAppliedRepository.findOne({
            subscription_id: subscriptionId,
            is_exhausted: false,
        });

        if (discountApplied) {
            discountApplied.is_exhausted = true;
            discountApplied.exhausted_reason = ENUM_EXHAUSTED_REASON.LOCATION_CRITERIA_NOT_MET;
            await this.discountAppliedRepository.save(discountApplied);
            this.logger.log(
                `Discount removed from subscription ${subscriptionId} due to location criteria not met`
            );
        }

        return discountApplied;
    }

    /**
     * Validate discount eligibility on plan change (upgrade/downgrade)
     * Returns warning info if discount will be lost
     */
    async validateDiscountOnPlanChange(
        subscriptionId: string,
        newLocationCount: number
    ): Promise<{
        hasDiscount: boolean;
        willLoseDiscount: boolean;
        discountInfo?: {
            discount_code: string;
            discount_name: string;
            discount_value: number;
            discount_type: string;
            remaining_months?: number;
            location_rules: ILocationRule[];
        };
        warning?: string;
    }> {
        const discountApplied = await this.discountAppliedRepository.findOne({
            subscription_id: subscriptionId,
            is_exhausted: false,
        });

        if (!discountApplied) {
            return { hasDiscount: false, willLoseDiscount: false };
        }

        const discount = await this.findOneById(discountApplied.discount_id.toString());
        if (!discount) {
            return { hasDiscount: false, willLoseDiscount: false };
        }

        const locationRules = discount.location_rules || [];
        const isEligible = this.checkLocationEligibility(locationRules, newLocationCount);

        const discountInfo = {
            discount_code: discount.discount_code,
            discount_name: discount.name,
            discount_value: discount.discount_value,
            discount_type: discount.discount_type,
            remaining_months: discountApplied.remaining_months,
            location_rules: locationRules,
        };

        if (!isEligible) {
            // Format location rules for warning message
            const rulesDescription = this.formatLocationRulesDescription(locationRules);
            return {
                hasDiscount: true,
                willLoseDiscount: true,
                discountInfo,
                warning: `Your current discount "${discount.discount_code}" requires ${rulesDescription}. Changing to ${newLocationCount} location(s) will remove this discount permanently.`,
            };
        }

        return {
            hasDiscount: true,
            willLoseDiscount: false,
            discountInfo,
        };
    }

    /**
     * Format location rules into human-readable description
     */
    formatLocationRulesDescription(locationRules: ILocationRule[]): string {
        if (!locationRules || locationRules.length === 0) {
            return 'any number of locations';
        }

        const descriptions = locationRules.map((rule) => {
            switch (rule.type) {
                case ENUM_LOCATION_RULE_TYPE.ANY:
                    return 'any number of locations';
                case ENUM_LOCATION_RULE_TYPE.EXACT:
                    return rule.value === 1
                        ? 'exactly 1 location'
                        : `exactly ${rule.value} locations`;
                case ENUM_LOCATION_RULE_TYPE.MINIMUM:
                    return rule.value === 1
                        ? 'at least 1 location'
                        : `${rule.value} or more locations`;
                case ENUM_LOCATION_RULE_TYPE.MAXIMUM:
                    return rule.value === 1
                        ? 'only 1 location'
                        : `${rule.value} or fewer locations`;
                case ENUM_LOCATION_RULE_TYPE.RANGE:
                    return `between ${rule.min} and ${rule.max} locations`;
                default:
                    return '';
            }
        });

        return descriptions.filter(Boolean).join(' or ');
    }
}
