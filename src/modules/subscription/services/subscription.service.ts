// File partially re-enabled for basic subscription functionality
// Original file saved as: subscription.service.ts.disabled
// Multi-tenant features removed - uses central database only

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { SubscriptionRepository } from '../repository/repositories/subscription.repository';
import { ToolsService } from '@modules/tools/services/tools.service';
import { PlanService } from '@modules/plan/services/plan.service';
import { ToolProvisioningService } from './tool-provisioning.service';
import { SubscriptionCreateRequestDto } from '../dtos/request/subscription.create.request.dto';
import { UserService } from '@modules/user/services/user.service';
import { CompanyService } from '@modules/company/services/company.service';
import { DiscountService } from '@modules/discount/services/discount.service';
import { LocationService } from '@modules/location/services/location.service';

@Injectable()
export class SubscriptionService {
    private readonly logger = new Logger(SubscriptionService.name);

    constructor(
        private readonly subscriptionRepository: SubscriptionRepository,
        @Inject(forwardRef(() => ToolsService))
        private readonly toolsService: ToolsService,
        @Inject(forwardRef(() => PlanService))
        private readonly planService: PlanService,
        @Inject(forwardRef(() => ToolProvisioningService))
        private readonly toolProvisioningService: ToolProvisioningService,
        @Inject(forwardRef(() => UserService))
        private readonly userService: UserService,
        @Inject(forwardRef(() => CompanyService))
        private readonly companyService: CompanyService,
        @Inject(forwardRef(() => DiscountService))
        private readonly discountService: DiscountService,
        @Inject(forwardRef(() => LocationService))
        private readonly locationService: LocationService
    ) {
        this.logger.log('SubscriptionService initialized (multi-tenant removed - central DB only)');
    }

    // Basic methods re-enabled for plan selection
    async findOne(find: any, options?: any): Promise<any> {
        return this.subscriptionRepository.findOne(find, options);
    }

    async findAll(find: any, options?: any): Promise<any> {
        return this.subscriptionRepository.findAll(find, options);
    }

    async create(data: any, options?: any): Promise<any> {
        return this.subscriptionRepository.create(data, options);
    }

    async update(repository: any, data: any, options?: any): Promise<any> {
        // Simplified - no tenant provisioning
        // Update document properties directly
        Object.keys(data).forEach(key => {
            if (data[key] !== undefined) {
                repository[key] = data[key];
            }
        });

        // Save the updated document
        return this.subscriptionRepository.save(repository, options);
    }

    async delete(find: any, options?: any): Promise<any> {
        return this.subscriptionRepository.deleteMany(find, options);
    }

    async findActiveByUserId(userId: string): Promise<any> {
        // Find active subscription by user_id first
        let subscription = await this.subscriptionRepository.findOne({
            user_id: userId,
            status: true,
            soft_delete: false
        });

        // Fallback: check by company_id (handles edge cases where subscription is stored by company)
        if (!subscription) {
            const company = await this.companyService.findOneByUserId(userId);
            if (company?._id) {
                subscription = await this.subscriptionRepository.findOne({
                    company_id: company._id.toString(),
                    status: true,
                    soft_delete: false
                });
            }
        }

        console.log(`🔍 Finding active subscription for user: ${userId}`);
        console.log(`   Result: ${subscription ? 'Found ✓' : 'Not found ✗'}`);

        return subscription;
    }

    /**
     * Find any subscription for a user (active preferred). Used to detect
     * "company has a subscription record but it's inactive" — the active-only
     * findActiveByUserId would return null in that case and we couldn't tell
     * the difference between "no subscription" and "inactive subscription".
     *
     * IMPORTANT: when a company upgrades, the old inactive subscription record
     * stays in the table alongside the new active one. We MUST prefer the
     * active row, otherwise the auth flow flags the user as inactive even
     * though they just paid.
     */
    async findAnyByUserId(userId: string): Promise<any> {
        // 1) Active first (covers the post-upgrade case)
        const active = await this.findActiveByUserId(userId);
        if (active) return active;

        // 2) Fall back to ANY subscription record so the caller can detect
        //    "exists but inactive" vs "no subscription at all".
        let subscription = await this.subscriptionRepository.findOne({
            user_id: userId,
            soft_delete: false,
        });
        if (!subscription) {
            const company = await this.companyService.findOneByUserId(userId);
            if (company?._id) {
                subscription = await this.subscriptionRepository.findOne({
                    company_id: company._id.toString(),
                    soft_delete: false,
                });
            }
        }
        return subscription;
    }

    /**
     * Single source of truth for "is this subscription currently active?".
     * Used by ToolAccessGuard, the login flow, the dashboard redirect, and
     * the my-status endpoint. Keeping the rules in one place avoids drift.
     */
    isSubscriptionActive(subscription: any): boolean {
        if (!subscription) return false;
        if (subscription.status === false) return false;
        if (subscription.hold === true) return false;
        if (subscription.cancelledAt) return false;
        if (!subscription.is_lifetime && subscription.end_date) {
            if (new Date(subscription.end_date).getTime() < Date.now()) return false;
        }
        return true;
    }

    /**
     * Returns a human-readable reason for an inactive subscription, used by
     * the my-status endpoint so the frontend can show a helpful message.
     */
    getInactiveReason(subscription: any): string | null {
        if (!subscription) return 'no_subscription';
        if (subscription.status === false) return 'status_inactive';
        if (subscription.hold === true) return 'on_hold';
        if (subscription.cancelledAt) return 'cancelled';
        if (!subscription.is_lifetime && subscription.end_date && new Date(subscription.end_date).getTime() < Date.now()) {
            return 'expired';
        }
        return null;
    }

    /**
     * Returns the status payload used by the /admin/subscription/my-status endpoint.
     * Powers the dashboard redirect and the post-purchase tools refresh.
     */
    async getMyStatus(userId: string): Promise<{
        is_active: boolean;
        reason: string | null;
        end_date: Date | null;
        is_lifetime: boolean;
        tools: any[];
    }> {
        const subscription = await this.findAnyByUserId(userId);
        const isActive = this.isSubscriptionActive(subscription);
        return {
            is_active: isActive,
            reason: isActive ? null : this.getInactiveReason(subscription),
            end_date: subscription?.end_date || null,
            is_lifetime: !!subscription?.is_lifetime,
            tools: isActive ? (subscription?.tools || []) : [],
        };
    }

    /**
     * Find subscriptions expiring within specified days
     */
    async findExpiringSoon(days: number = 7): Promise<any[]> {
        return this.subscriptionRepository.findExpiringSoon(days);
    }

    /**
     * Check for expired trial subscriptions
     */
    async checkTrialExpiry(): Promise<any[]> {
        return this.subscriptionRepository.findExpiredTrials();
    }

    /**
     * Find all active recurring subscriptions due for billing today
     */
    async findAllActiveTodaysNextBillingDate(): Promise<any[]> {
        return this.subscriptionRepository.findAllActiveTodaysNextBillingDate();
    }

    /**
     * Find subscriptions with pending or failed provisioning status
     */
    async findPendingProvisioningSubscriptions(): Promise<any[]> {
        return this.subscriptionRepository.findAll({
            soft_delete: false,
            provisioningStatus: { $in: ['pending', 'failed'] }
        });
    }

    async updateSubscriptionProvisioningStatus(
        subscriptionId: string,
        status: 'pending' | 'provisioning' | 'provisioned' | 'failed',
        error?: string
    ): Promise<void> {
        const subscription = await this.findOneById(subscriptionId);
        if (!subscription) {
            throw new Error(`Subscription not found: ${subscriptionId}`);
        }

        const updateData: any = {
            provisioningStatus: status
        };

        if (status === 'provisioned') {
            updateData.provisionedAt = new Date();
            updateData.provisioningError = null;
        } else if (status === 'failed' && error) {
            updateData.provisioningError = error;
        }

        await this.update(subscription, updateData);
    }

    /**
     * Retry provisioning for a failed subscription
     */
    async retryProvisioningForSubscription(subscriptionId: string): Promise<void> {
        const subscription = await this.findOneById(subscriptionId);
        if (!subscription) {
            throw new Error(`Subscription not found: ${subscriptionId}`);
        }

        // Reset provisioning status to pending for retry
        await this.updateSubscriptionProvisioningStatus(subscriptionId, 'pending');
        this.logger.log(`Reset provisioning status for subscription ${subscriptionId} to pending for retry`);
    }

    /**
     * Update subscription status (active/inactive)
     */
    async updateStatus(subscription: any, status: boolean): Promise<any> {
        return this.update(subscription, { status });
    }

    async findOneById(_id: string, options?: any): Promise<any> {
        // Simplified version without caching - multi-tenant removed
        return this.subscriptionRepository.findOneById(_id, options);
    }

    validateSubscriptionUpdate(...args: any[]): Promise<any> {
        throw new Error('SubscriptionService is temporarily disabled');
    }

    validateToolSelection(...args: any[]): Promise<any> {
        throw new Error('SubscriptionService is temporarily disabled');
    }

    calculateToolAdditionPricing(...args: any[]): any {
        throw new Error('SubscriptionService is temporarily disabled');
    }

    updateSubscriptionWithTools(...args: any[]): Promise<any> {
        throw new Error('SubscriptionService is temporarily disabled');
    }

    invalidateCache(...args: any[]): Promise<any> {
        throw new Error('SubscriptionService is temporarily disabled');
    }

    /**
     * Check if a company/user is eligible for trial subscription
     * A company is eligible for trial ONLY if:
     * 1. They have never had any subscription (active or inactive)
     * 2. They have never taken a trial before
     */
    async isTrialEligible(userIdOrCompanyId: string): Promise<boolean> {
        // First, try to find company by user_id to get the company_id
        const company = await this.companyService.findOneByUserId(userIdOrCompanyId);
        const companyId = company?._id;

        // Check if company has any subscription (active or inactive)
        let existingSubscription = null;

        if (companyId) {
            // Check by company_id first
            existingSubscription = await this.subscriptionRepository.findOne({
                company_id: companyId,
                soft_delete: false
            });
            this.logger.log(`🔍 Checking trial eligibility by company_id: ${companyId}`);
            this.logger.log(`   Existing subscription found: ${existingSubscription ? 'Yes' : 'No'}`);
        }

        // If not found by company_id, check by user_id as fallback
        if (!existingSubscription) {
            existingSubscription = await this.subscriptionRepository.findOne({
                user_id: userIdOrCompanyId,
                soft_delete: false
            });
            this.logger.log(`🔍 Checking trial eligibility by user_id: ${userIdOrCompanyId}`);
            this.logger.log(`   Existing subscription found: ${existingSubscription ? 'Yes' : 'No'}`);
        }

        // Company is eligible ONLY if they've never had any subscription
        const isEligible = !existingSubscription;
        this.logger.log(`📊 Trial eligibility result: ${isEligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`);

        return isEligible;
    }

    /**
     * Check if a company/user has ever had a trial subscription
     * This is used to prevent users from taking trial more than once
     */
    async hasEverHadTrial(userIdOrCompanyId: string): Promise<boolean> {
        // First, try to find company by user_id to get the company_id
        const company = await this.companyService.findOneByUserId(userIdOrCompanyId);
        const companyId = company?._id;

        // Check if company has ever had a trial subscription
        let trialSubscription = null;

        if (companyId) {
            // Check by company_id first
            trialSubscription = await this.subscriptionRepository.findOne({
                company_id: companyId,
                trial: true,
                soft_delete: false
            });
            this.logger.log(`🔍 Checking if company ever had trial by company_id: ${companyId}`);
            this.logger.log(`   Trial subscription found: ${trialSubscription ? 'Yes' : 'No'}`);
        }

        // If not found by company_id, check by user_id as fallback
        if (!trialSubscription) {
            trialSubscription = await this.subscriptionRepository.findOne({
                user_id: userIdOrCompanyId,
                trial: true,
                soft_delete: false
            });
            this.logger.log(`🔍 Checking if user ever had trial by user_id: ${userIdOrCompanyId}`);
            this.logger.log(`   Trial subscription found: ${trialSubscription ? 'Yes' : 'No'}`);
        }

        const hadTrial = !!trialSubscription;
        this.logger.log(`📊 Has ever had trial: ${hadTrial ? 'YES' : 'NO'}`);

        return hadTrial;
    }

    /**
     * Check if a company has any subscription (active or inactive)
     */
    async hasAnySubscription(userIdOrCompanyId: string): Promise<boolean> {
        // First, try to find company by user_id to get the company_id
        const company = await this.companyService.findOneByUserId(userIdOrCompanyId);
        const companyId = company?._id;

        // Check if company has any subscription
        let existingSubscription = null;

        if (companyId) {
            existingSubscription = await this.subscriptionRepository.findOne({
                company_id: companyId,
                soft_delete: false
            });
        }

        if (!existingSubscription) {
            existingSubscription = await this.subscriptionRepository.findOne({
                user_id: userIdOrCompanyId,
                soft_delete: false
            });
        }

        return !!existingSubscription;
    }

    async createTrialSubscriptionWithProvisioning(
        userId: string,
        planId: string,
        trialDays: number = 7,
        tools: Array<{ _id: string; name: string; price: number }> = [],
        options?: any
    ): Promise<any> {
        this.logger.log(`🚀 Creating trial subscription for user: ${userId}`);

        // Fetch user to get company
        const user = await this.userService.findOneById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        this.logger.log(`👤 User found: ${user._id.toString()} (${user.email})`);

        // Fetch company for the user
        const company = await this.companyService.findOneByUserId(user._id);
        if (!company) {
            throw new Error('Company not found for user');
        }

        this.logger.log(`🏢 Company found: ${company._id.toString()}`);

        // Fetch plan details to get plan_type and duration
        const plan = await this.planService.findOneById(planId);

        if (!plan) {
            throw new Error('Plan not found');
        }

        // Debug plan details
        this.logger.log(`📋 Plan Details for Trial Subscription:`);
        this.logger.log(`   Plan ID: ${plan._id}`);
        this.logger.log(`   Plan Name: ${plan.name}`);
        this.logger.log(`   Is Lifetime: ${plan.is_lifetime}`);
        this.logger.log(`   Duration Type: ${plan.duration_type}`);
        this.logger.log(`   Duration: ${plan.duration}`);

        const startDate = new Date();
        const endDate = new Date();

        // Calculate end date based on plan's duration_type and duration value
        const durationValue = plan.duration || 1;
        const durationType = (plan.duration_type || 'monthly').toLowerCase();

        let daysToAdd = trialDays; // Default fallback to trialDays parameter

        if (durationType === 'weekly' || durationType === 'week') {
            daysToAdd = durationValue * 7;
        } else if (durationType === 'monthly' || durationType === 'month') {
            daysToAdd = durationValue * 30;
        } else if (durationType === 'yearly' || durationType === 'year') {
            daysToAdd = durationValue * 365;
        } else if (durationType === 'daily' || durationType === 'day') {
            daysToAdd = durationValue;
        }

        endDate.setDate(startDate.getDate() + daysToAdd);
        this.logger.log(`📅 Calculated end date: ${endDate.toISOString()} (${daysToAdd} days from now, based on ${durationType} x ${durationValue})`);

        // Trial subscriptions are always free — tools price is 0
        const toolsPrice = 0;

        let filteredTools: Array<{ _id: string; name: string; price: number, slug: string }> = []
        for (const tool of tools) {
            try {
                const toolDoc = await this.toolsService.findOneById(tool._id?.toString());
                if (toolDoc) {
                    filteredTools.push({ ...tool, name: toolDoc.name, slug: toolDoc.slug });
                }
            } catch {
                // Tool not found — skip it
                this.logger.warn(`Tool not found: ${tool._id}`);
            }
        }

        const end_date = plan?.is_lifetime ? null : endDate;
        const next_date = plan?.is_lifetime === true ? null : undefined;
        const is_lifetime = plan?.is_lifetime === true ? true : false;
        const is_trial = plan?.is_lifetime === true ? false : true;

        // Debug computed values
        this.logger.log(`🔧 Computed Subscription Values:`);
        this.logger.log(`   is_lifetime: ${is_lifetime}`);
        this.logger.log(`   is_trial: ${is_trial}`);
        this.logger.log(`   end_date: ${end_date}`);
        this.logger.log(`   next_date: ${next_date}`);

        // Map tools to new structure — trial prices are 0
        const toolsWithPricing = filteredTools.map((tool: any) => ({
            _id: tool._id,
            name: tool.name,
            slug: tool.slug || '',
            base_price: 0,
            pricing_mode: tool.pricing_mode || 'fixed',
            location_multiplier: tool.location_multiplier || 1.0,
            calculated_price: 0,
            is_mandatory: tool.is_mandatory ?? false,
            display_order: tool.display_order ?? 0,
        }));

        // Get location count from options, or use first tier from plan, or default to 1
        const firstTierLocations = plan.location_pricing?.[0]?.locations || 1;
        const locationCount = options?.locations || firstTierLocations;
        const locationPricing = plan.location_pricing || [];

        this.logger.log(`📍 Location count: ${locationCount} (is_lifetime: ${is_lifetime})`);

        const trialData: any = {
            // References
            user_id: userId,
            company_id: company._id,
            plan_id: planId,

            // Location-based pricing
            locations: locationCount,
            location_pricing: locationPricing,

            // Plan tier values (all 0 for trial)
            plan_price: 0,
            original_plan_price: 0,
            special_price: 0,
            special_price_duration: 0,
            special_price_remaining: 0,

            // Tools with full pricing
            tools: toolsWithPricing,
            tools_price: toolsPrice,

            // Calculations
            subtotal: toolsPrice,

            // Discount (none for trial)
            discount_id: null,
            discount_code: null,
            discount_type: null,
            discount_value: 0,
            discount_price: 0,

            // After discount
            total: toolsPrice,

            // Tax (none for trial)
            tax_type: null,
            tax_rate: 0,
            tax_price: 0,

            // Final amount
            final_price: toolsPrice,

            // Plan info snapshot
            plan_name: plan.name,
            plan_description: '',
            plan_type: plan.duration_type,
            plan_type_value: Number(plan.duration),

            // Subscription flags
            trial: is_trial,
            trial_days: daysToAdd, // Use calculated days based on plan duration
            recurring: false,
            is_lifetime: is_lifetime,
            is_default: false,

            // Dates
            start_date: startDate,
            end_date: end_date,
            next_date: next_date,

            // Status
            status: true,
            hold: false,
            soft_delete: false,
        };

        let createdSubscription: any;

        try {
            // Create the trial subscription
            createdSubscription = await this.create(trialData, options);

            this.logger.log(`✅ Trial subscription created: ${createdSubscription._id.toString()}`);
            this.logger.log(`   User ID: ${createdSubscription.user_id}`);
            this.logger.log(`   Company ID: ${createdSubscription.company_id}`);
            this.logger.log(`   Plan ID: ${createdSubscription.plan_id}`);
            this.logger.log(`   Trial: ${createdSubscription.trial}`);
            this.logger.log(`   Status: ${createdSubscription.status}`);
            this.logger.log(`   Soft Delete: ${createdSubscription.soft_delete}`);

            // Mark company as subscribed so login routing works correctly
            try {
                await this.companyService.updateSubscriptionStatus(
                    company._id.toString(),
                    true,
                    createdSubscription._id.toString()
                );
                this.logger.log(`✅ Company ${company._id} marked as subscribed`);
            } catch (companyUpdateError) {
                this.logger.error(`⚠️ Failed to update company subscription status: ${companyUpdateError.message}`);
                // Non-blocking — subscription is already created
            }

            this.logger.log(`Starting tool provisioning for trial subscription: ${createdSubscription._id.toString()}`);

            // Update subscription status to provisioning
            await this.updateSubscriptionProvisioningStatus(
                createdSubscription._id.toString(),
                'provisioning'
            );

            // Provision tools for the trial subscription
            const provisioningResult = await this.toolProvisioningService.provisionToolsForSubscription(
                createdSubscription
            );

            if (provisioningResult.status === 'success') {
                // Update subscription status to provisioned
                await this.updateSubscriptionProvisioningStatus(
                    createdSubscription._id.toString(),
                    'provisioned'
                );
                this.logger.log(`Tool provisioning completed successfully for trial subscription: ${createdSubscription._id.toString()}`);

                // Create default location for the company (skip if one already exists from signup)
                try {
                    this.logger.log('🏢 [LOCATION CREATION] Checking for existing default location');
                    this.logger.log(`Company: ${company.company_name}`);
                    this.logger.log(`Company ID: ${company._id.toString()}`);
                    this.logger.log(`User ID: ${userId}`);

                    // Check if a default location already exists (created during company signup)
                    const existingDefault = await this.locationService.findDefaultLocation(company._id.toString());

                    let createdLocation: any;

                    if (existingDefault) {
                        this.logger.log('✅ Default location already exists, skipping creation');
                        this.logger.log(`Existing Location ID: ${existingDefault._id}`);
                        this.logger.log(`Existing Location Name: ${(existingDefault as any).location_name}`);
                        createdLocation = existingDefault;
                    } else {
                        this.logger.log('📝 No default location found, creating one');

                        const defaultLocationData: any = {
                            location_name: `${company.company_name} - Head Office`,
                            location_code: '',  // Auto-generated by location service
                            description: 'Default head office location',
                            contact_name: company.contact_name,
                            email: company.email,
                            mobile: company.mobile || '',
                            address_line1: company.address_1 || '',
                            address_line2: company.address_2 || '',
                            city: company.city || '',
                            state: company.state || '',
                            postcode: company.zipcode || '',
                            country: company.country || '',
                            timezone: company.timezone || 'UTC',
                            currency: company.currency || 'USD',
                            is_default: true,
                            is_active: true,
                        };

                        // Add country_code if it exists and has the correct structure
                        if (company.country_code && typeof company.country_code === 'object') {
                            const cc = company.country_code as any;
                            if (cc.code && cc.dialCode) {
                                defaultLocationData.country_code = {
                                    code: cc.code,
                                    dialCode: cc.dialCode
                                };
                            }
                        }

                        createdLocation = await this.locationService.create(
                            company._id.toString(),
                            defaultLocationData,
                            userId
                        );

                        this.logger.log('✅ Default location created successfully!');
                        this.logger.log(`Location ID: ${createdLocation._id}`);
                        this.logger.log(`Location Name: ${createdLocation.location_name}`);
                        this.logger.log(`Location Code: ${createdLocation.location_code}`);
                    }

                    // Update Company Admin user with location access
                    try {
                        this.logger.log('👤 [USER UPDATE] Setting access level for Company Admin');
                        (user as any).access_level = 'company';
                        (user as any).accessible_locations = [createdLocation._id];
                        await this.userService.save(user);
                        this.logger.log('✅ Company Admin access level set to "company"');
                        this.logger.log(`✅ Accessible locations: [${createdLocation._id}]`);
                    } catch (userUpdateError) {
                        this.logger.error('⚠️ Failed to update Company Admin access level:', userUpdateError);
                    }
                } catch (locationError) {
                    // Log error but don't fail subscription creation
                    this.logger.error('❌ [LOCATION CREATION] FAILED for trial subscription');
                    this.logger.error(`Error: ${locationError?.message}`);
                    this.logger.error(`Stack: ${locationError?.stack}`);
                    // Non-blocking - location can be created manually later
                }

                // Dispatch sync event to appointment app (async, non-blocking)
                this.dispatchAppointmentSyncForTrial(user, company, createdSubscription, plan).catch(error => {
                    this.logger.error(`Failed to dispatch appointment sync for trial: ${error.message}`);
                });

                return createdSubscription;
            } else {
                // Provisioning failed - update status and throw error
                await this.updateSubscriptionProvisioningStatus(
                    createdSubscription._id.toString(),
                    'failed',
                    provisioningResult.errors?.join(', ') || 'Unknown provisioning error'
                );

                const errorMessage = `Tool provisioning failed for trial subscription: ${provisioningResult.errors?.join(', ') || 'Unknown error'}`;
                this.logger.error(errorMessage);
                throw new Error(errorMessage);
            }
        } catch (error) {
            this.logger.error(`Error during trial subscription creation with provisioning: ${error.message}`);

            if (createdSubscription) {
                // Mark subscription as failed
                await this.updateSubscriptionProvisioningStatus(
                    createdSubscription._id.toString(),
                    'failed',
                    error.message
                );
            }

            throw error;
        }
    }

    convertTrialToSubscription(...args: any[]): Promise<any> {
        throw new Error('SubscriptionService is temporarily disabled');
    }

    async findAllWithJoins(find?: any, options?: any): Promise<any[]> {
        return this.subscriptionRepository.findAllWithJoins(find, options);
    }

    async getTotal(find?: any, options?: any): Promise<number> {
        const filters = {
            ...find,
            soft_delete: false,
        };
        return this.subscriptionRepository.getTotal(filters, options);
    }

    async mapGetWithJoinsArray(subscription: any[]): Promise<any[]> {
        // Update tool names from central tools table
        const mappedSubscriptions = await Promise.all(subscription.map(async (sub: any) => {
            // Update tool names with latest from tools entity
            let updatedTools = sub.tools || [];
            if (sub.tools && Array.isArray(sub.tools)) {
                updatedTools = await Promise.all(sub.tools.map(async (tool: any) => {
                    if (tool._id) {
                        try {
                            const toolDoc = await this.toolsService.findOneById(tool._id.toString());
                            if (toolDoc) {
                                return {
                                    _id: tool._id.toString(),
                                    name: toolDoc.name, // Use name from database
                                    slug: toolDoc.slug, // Use slug from database
                                    base_price: tool.base_price ?? tool.price ?? 0,
                                    pricing_mode: tool.pricing_mode || 'fixed',
                                    location_multiplier: tool.location_multiplier || 1.0,
                                    calculated_price: tool.calculated_price ?? tool.price ?? 0,
                                    is_mandatory: tool.is_mandatory ?? false,
                                    display_order: tool.display_order ?? 0,
                                    // Legacy field
                                    price: tool.calculated_price ?? tool.price ?? 0,
                                };
                            }
                        } catch (error) {
                            this.logger.warn(`Failed to fetch tool name for ID ${tool._id}: ${error.message}`);
                        }
                    }
                    // Fallback to original tool data if fetch fails
                    return {
                        _id: tool._id?.toString(),
                        name: tool.name,
                        slug: tool.slug,
                        base_price: tool.base_price ?? tool.price ?? 0,
                        pricing_mode: tool.pricing_mode || 'fixed',
                        location_multiplier: tool.location_multiplier || 1.0,
                        calculated_price: tool.calculated_price ?? tool.price ?? 0,
                        is_mandatory: tool.is_mandatory ?? false,
                        display_order: tool.display_order ?? 0,
                        // Legacy field
                        price: tool.calculated_price ?? tool.price ?? 0,
                    };
                }));
            }

            // Get location_pricing from subscription or fallback to plan
            const locationPricing = sub.location_pricing?.length > 0
                ? sub.location_pricing
                : (sub.plan?.location_pricing || []);

            // Get plan price - prefer plan_price, fallback to platform_price for legacy subscriptions
            const planPriceValue = sub.plan_price ?? sub.platform_price ?? 0;

            // Calculate subtotal if not present
            const toolsPriceValue = sub.tools_price ?? 0;
            const subtotalValue = sub.subtotal ?? (planPriceValue + toolsPriceValue);

            // Fetch discount duration info from discount entity if not set on subscription
            let discountDurationType = sub.discount_duration_type || null;
            let discountDurationMonths = sub.discount_duration_months || null;
            let discountRemainingMonths = sub.discount_remaining_months || null;
            let discountName = sub.discount_name || null;
            let discountLocationRules = sub.discount_location_rules || [];
            let discountType = sub.discount_type || null;
            let discountValue = sub.discount_value || 0;

            // If subscription has discount (by id or code) but missing duration fields, fetch from discount
            const hasDiscountButMissingInfo = (sub.discount_id || sub.discount_code) &&
                (!discountDurationType || discountLocationRules.length === 0 || !discountType);

            if (hasDiscountButMissingInfo) {
                try {
                    let discount = null;

                    // Try to find discount by ID first
                    if (sub.discount_id) {
                        discount = await this.discountService.findOneById(sub.discount_id.toString());
                    }

                    // If not found by ID, try by discount_code
                    if (!discount && sub.discount_code) {
                        discount = await this.discountService.findByCode(sub.discount_code);
                    }

                    if (discount) {
                        // Get discount type and value
                        if (!discountType) {
                            discountType = discount.type || null;
                            discountValue = discount.value || 0;
                        }

                        if (!discountDurationType) {
                            discountDurationType = discount.duration_type || null;
                            discountDurationMonths = discount.duration_months || null;
                            discountName = discount.name || discount.discount_code || null;
                        }

                        // Get location rules from discount
                        if (discountLocationRules.length === 0 && discount.location_rules) {
                            discountLocationRules = discount.location_rules;
                        }

                        // Try to get remaining months from discount_applied record
                        try {
                            const discountApplied = await this.discountService.getDiscountAppliedBySubscription(
                                sub._id?.toString()
                            );
                            if (discountApplied) {
                                discountRemainingMonths = discountApplied.remaining_months ?? discountDurationMonths;
                            } else {
                                discountRemainingMonths = discountDurationMonths;
                            }
                        } catch (err) {
                            discountRemainingMonths = discountDurationMonths;
                        }
                    }
                } catch (error) {
                    this.logger.warn(`Failed to fetch discount info for subscription ${sub._id}: ${error.message}`);
                }
            }

            return {
                ...sub,
                // References
                user_id: sub.user_id?.toString(),
                plan_id: sub.plan_id?.toString(),
                company_id: sub.company_id?.toString(),

                // Location-based pricing
                locations: sub.locations || 1,
                location_pricing: locationPricing,

                // Plan tier values - with legacy fallbacks
                plan_price: planPriceValue,
                platform_price: sub.platform_price ?? planPriceValue, // Keep for backward compat
                original_plan_price: sub.original_plan_price || 0,
                special_price: sub.special_price || 0,
                special_price_duration: sub.special_price_duration || 0,
                special_price_remaining: sub.special_price_remaining || 0,

                // Tools
                tools: updatedTools,
                tools_price: toolsPriceValue,

                // Calculations
                subtotal: subtotalValue,

                // Discount
                discount_id: sub.discount_id?.toString() || null,
                discount_code: sub.discount_code || null,
                discount_type: discountType,
                discount_value: discountValue,
                discount_price: sub.discount_price || 0,
                discount_duration_type: discountDurationType,
                discount_duration_months: discountDurationMonths,
                discount_remaining_months: discountRemainingMonths,
                discount_name: discountName,
                discount_location_rules: discountLocationRules,

                // After discount
                total: sub.total || 0,

                // Tax - fallback to tax_value for legacy subscriptions
                tax_type: sub.tax_type || null,
                tax_rate: sub.tax_rate || sub.tax_percentage || 0,
                tax_price: sub.tax_price ?? sub.tax_value ?? 0,

                // Final amount - calculate if not present
                final_price: sub.final_price ?? ((subtotalValue - (sub.discount_price || 0)) + (sub.tax_price ?? sub.tax_value ?? 0)),

                // Plan info snapshot
                plan_name: sub.plan_name || null,
                plan_description: sub.plan_description || null,
                plan_type: sub.plan_type || null,
                plan_type_value: sub.plan_type_value || 0,

                // Subscription flags
                recurring: sub.recurring || false,
                is_lifetime: sub.is_lifetime || false,
                trial: sub.trial || false,
                trial_days: sub.trial_days || 0,
                is_default: sub.is_default || false,

                // Dates
                start_date: sub.start_date || null,
                next_date: sub.next_date || null,
                end_date: sub.end_date || null,

                // Status
                status: sub.status || false,
                hold: sub.hold || false,
                cancelledAt: sub.cancelledAt || null,

                // Provisioning
                provisioningStatus: sub.provisioningStatus || 'pending',
                provisionedAt: sub.provisionedAt || null,
                provisioningError: sub.provisioningError || null,

                // Agent/Referral
                referal_code: sub.referal_code || null,
                agent_id: sub.agent_id?.toString() || null,
                commission: sub.commission || 0,

                // Joined entities
                user: sub.user ? {
                    _id: sub.user._id?.toString(),
                    name: sub.user.name,
                    email: sub.user.email,
                    status: sub.user.status,
                } : null,
                plan: sub.plan ? {
                    _id: sub.plan._id?.toString(),
                    name: sub.plan.name,
                    description: sub.plan.description,
                    price: sub.plan.price,
                    status: sub.plan.status,
                    tools: sub.plan.tools || [],
                    location_pricing: sub.plan.location_pricing || [],
                } : null,
                company: sub.company ? {
                    _id: sub.company._id?.toString(),
                    company_name: sub.company.company_name,
                    contact_name: sub.company.contact_name,
                    email: sub.company.email,
                } : null,
            };
        }));

        return mappedSubscriptions;
    }

    cancelSubscription(...args: any[]): Promise<any> {
        throw new Error('SubscriptionService is temporarily disabled');
    }

    async cancelAllCompanySubscriptions(companyId: string): Promise<{ cancelled: number }> {
        // Find all active subscriptions for this company
        const activeSubscriptions = await this.subscriptionRepository.findAll({
            company_id: companyId,
            status: true,
            soft_delete: false
        });

        console.log(`🔄 Cancelling ${activeSubscriptions.length} subscription(s) for: ${companyId}`);

        // Cancel each subscription
        let cancelledCount = 0;
        for (const subscription of activeSubscriptions) {
            await this.update(subscription, {
                status: false
            });
            cancelledCount++;
            console.log(`   ✅ Cancelled subscription: ${subscription._id}`);
        }

        return { cancelled: cancelledCount };
    }

    async findOneWithJoins(subscriptionId: string, options?: any): Promise<any> {
        const subscriptions = await this.findAllWithJoins(
            { _id: subscriptionId },
            options
        );
        return subscriptions.length > 0 ? subscriptions[0] : null;
    }

    async mapGetWithJoins(subscription: any): Promise<any> {
        const mapped = await this.mapGetWithJoinsArray([subscription]);
        return mapped[0];
    }

    existByUserId(...args: any[]): Promise<any> {
        throw new Error('SubscriptionService is temporarily disabled');
    }

    /**
     * Validate that reducing a subscription's location count won't conflict
     * with the company's current active locations.
     * Throws BadRequestException if the new limit is less than the current location count.
     */
    async validateLocationDowngrade(
        companyId: string,
        currentAllowed: number,
        newAllowed: number
    ): Promise<void> {
        // No change or upgrade — always allowed
        if (newAllowed >= currentAllowed) return;

        const { BadRequestException } = await import('@nestjs/common');
        const currentCount = await this.locationService.countByCompanyId(companyId);

        if (newAllowed < currentCount) {
            throw new BadRequestException(
                `Cannot reduce location limit to ${newAllowed}. ` +
                `You currently have ${currentCount} active location(s). ` +
                `Please deactivate or delete ${currentCount - newAllowed} location(s) first.`
            );
        }
    }

    /**
     * Dispatch sync event to appointment app for trial subscriptions
     */
    private async dispatchAppointmentSyncForTrial(
        user: any,
        company: any,
        subscription: any,
        plan: any
    ): Promise<void> {
        try {
            // Prepare company data
            const companyData = {
                _id: company._id?.toString(),
                company_name: company.company_name || '',
                email: company.email || user?.email || '',
                country: company.country || '',
                selected_country: company.selected_country || company.country || '',
                country_code: company.country_code || null, // Country code object from step 1 signup
                currency: company.currency || 'USD',
                timezone: company.timezone || 'UTC',
                mobile: company.mobile || '',
            };

            // Prepare user data (password will be generated by sync processor)
            const userData = {
                _id: user._id?.toString(),
                email: user.email || '',
                name: user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
                first_name: user.first_name || '',
                last_name: user.last_name || '',
                mobile: user.mobile || '',
                password: '', // Will be generated by sync processor
                gender: user.gender || '',
                photo: user.photo || '',
            };

            // Prepare subscription data
            const subscriptionData = {
                _id: subscription._id?.toString(),
                plan_id: subscription.plan_id?.toString(),
                plan_name: plan?.name || subscription.plan_name || '',
                plan_type: plan?.duration_type || subscription.plan_type || 'MONTHLY',
                status: subscription.status,
                start_date: subscription.start_date,
                end_date: subscription.end_date,
                next_date: subscription.next_date,
                locations: subscription.locations || 1,
                final_price: subscription.final_price || 0,
                trial: subscription.trial || true,
                trial_days: subscription.trial_days || 7,
                is_lifetime: subscription.is_lifetime || false,
            };

            // Get full subscription with joins
            const fullSubscriptionData = await this.findOneWithJoins(subscription._id.toString());

            this.logger.log('✅ Trial subscription created successfully: ${subscription._id}');
        } catch (error) {
            this.logger.error(`Error creating trial subscription: ${error.message}`);
            // Don't throw - allow the process to continue
        }
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
            location_rules: any[];
        };
        warning?: string;
    }> {
        return this.discountService.validateDiscountOnPlanChange(
            subscriptionId,
            newLocationCount
        );
    }

    /**
     * Remove discount from subscription if location criteria not met after upgrade
     * Call this after successful upgrade if willLoseDiscount was true
     */
    async removeDiscountOnPlanChange(subscriptionId: string): Promise<void> {
        const subscription = await this.findOneById(subscriptionId);
        if (!subscription) {
            this.logger.warn(`Subscription not found for discount removal: ${subscriptionId}`);
            return;
        }

        // Remove discount from DiscountApplied collection
        await this.discountService.removeDiscountForLocationMismatch(subscriptionId);

        // Clear discount fields from subscription
        await this.update(subscription, {
            discount_id: null,
            discount_code: null,
            discount_type: null,
            discount_value: 0,
            discount_price: 0,
        });

        this.logger.log(`Discount removed from subscription ${subscriptionId} due to location change`);
    }
}
