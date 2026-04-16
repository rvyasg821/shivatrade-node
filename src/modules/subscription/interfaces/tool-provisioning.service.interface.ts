import { IToolProvisioningResult } from './tool-provisioning.interface';
import { SubscriptionDoc } from '../repository/entities/subscription.entity';

export interface IToolProvisioningService {
    /**
     * Provisions tools for a subscription by copying tool details from the subscription plan
     * and creating tenant-specific instances in the tenant database
     */
    provisionToolsForSubscription(subscription: SubscriptionDoc): Promise<IToolProvisioningResult>;

    /**
     * Rolls back tool provisioning for a subscription by removing tenant-specific tools
     * and schedules that were created during provisioning
     */
    rollbackToolProvisioning(subscription: SubscriptionDoc): Promise<void>;

    /**
     * Validates that tool provisioning was completed successfully for a subscription
     */
    validateToolProvisioning(subscription: SubscriptionDoc): Promise<boolean>;
}