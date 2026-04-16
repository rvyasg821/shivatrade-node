// File re-enabled with simplified implementation (multi-tenant removed)
// Original file saved as: tool-provisioning.service.ts.disabled
// Multi-tenant provisioning removed - tools are managed in central database only

import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ToolProvisioningService {
    private readonly logger = new Logger(ToolProvisioningService.name);

    constructor() {
        this.logger.log('ToolProvisioningService initialized (multi-tenant removed - central DB only)');
    }

    /**
     * Simplified tool provisioning - multi-tenant features removed
     * Tools are now managed directly in the subscription record in central database
     * No tenant-specific provisioning needed
     */
    async provisionToolsForSubscription(subscription: any): Promise<any> {
        const subscriptionId = subscription._id?.toString() || 'unknown';
        this.logger.log(`Tool provisioning for subscription: ${subscriptionId} (no-op - multi-tenant removed)`);

        // Return success immediately - tools are already stored in subscription.tools
        // No tenant database provisioning needed since multi-tenant was removed
        return {
            subscriptionId,
            tenantId: null, // Multi-tenant removed
            provisionedTools: subscription.tools || [],
            createdSchedules: [],
            status: 'success',
            errors: [],
        };
    }

    // Stub methods for other operations (not currently needed)
    async provisionToolsForCompany(...args: any[]): Promise<any> {
        this.logger.log('provisionToolsForCompany called (no-op - multi-tenant removed)');
        return { status: 'success', errors: [] };
    }

    async removeToolsForCompany(...args: any[]): Promise<any> {
        this.logger.log('removeToolsForCompany called (no-op - multi-tenant removed)');
        return { status: 'success', errors: [] };
    }

    async syncToolsWithSubscription(...args: any[]): Promise<any> {
        this.logger.log('syncToolsWithSubscription called (no-op - multi-tenant removed)');
        return { status: 'success', errors: [] };
    }
}
