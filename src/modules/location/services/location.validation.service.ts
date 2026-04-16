import { Injectable, Logger, BadRequestException, forwardRef, Inject } from '@nestjs/common';
import { LocationRepository } from '../repository/repositories/location.repository';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';

@Injectable()
export class LocationValidationService {
    private readonly logger = new Logger(LocationValidationService.name);

    constructor(
        private readonly locationRepository: LocationRepository,
        @Inject(forwardRef(() => SubscriptionService))
        private readonly subscriptionService: SubscriptionService
    ) {}

    /**
     * Validate if company can create a new location based on subscription
     */
    async validateLocationCreation(companyId: string): Promise<void> {
        // Get active subscription
        const subscription = await this.subscriptionService.findOne({
            company_id: companyId,
            status: true,
            soft_delete: false,
        });

        if (!subscription) {
            throw new BadRequestException(
                'No active subscription found. Please purchase a subscription to create locations.'
            );
        }

        // Count current active locations
        const currentLocationCount = await this.locationRepository.countByCompanyId(companyId);

        // Check against subscription limit
        const allowedLocations = subscription.locations || 1;

        if (currentLocationCount >= allowedLocations) {
            throw new BadRequestException(
                `Location limit reached. Your plan allows ${allowedLocations} location(s). ` +
                `You currently have ${currentLocationCount} location(s). ` +
                `Please upgrade your subscription to add more locations.`
            );
        }

        this.logger.log(
            `Location validation passed for company: ${companyId}. ` +
            `Current: ${currentLocationCount}, Allowed: ${allowedLocations}`
        );
    }

    /**
     * Get location capacity info for a company
     */
    async getLocationCapacity(companyId: string): Promise<{
        current: number;
        allowed: number;
        remaining: number;
        canCreateMore: boolean;
        hasActiveSubscription: boolean;
    }> {
        const subscription = await this.subscriptionService.findOne({
            company_id: companyId,
            status: true,
            soft_delete: false,
        });

        const hasActiveSubscription = !!subscription;
        const allowed = subscription?.locations || 0;
        const current = await this.locationRepository.countByCompanyId(companyId);
        const remaining = Math.max(0, allowed - current);
        const canCreateMore = hasActiveSubscription && remaining > 0;

        return {
            current,
            allowed,
            remaining,
            canCreateMore,
            hasActiveSubscription,
        };
    }
}
