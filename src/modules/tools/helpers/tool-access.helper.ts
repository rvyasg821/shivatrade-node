/**
 * Tool Access Helper
 * Handles tool access control based on subscription
 * Multi-tenant removed - uses central database only
 */

import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';

@Injectable()
export class ToolAccessHelper {
    private readonly logger = new Logger(ToolAccessHelper.name);

    constructor(
        private readonly subscriptionService: SubscriptionService
    ) {}

    /**
     * Check if a user has access to a specific tool
     * @param userId - User ID to check
     * @param toolId - Tool ID to check access for
     * @returns true if user has access, false otherwise
     */
    async hasToolAccess(userId: string, toolId: string): Promise<boolean> {
        // Single-tenant mode: every user has access to every tool.
        if ((process.env.APP_MODE || 'single') === 'single') {
            return true;
        }
        try {
            const subscription = await this.subscriptionService.findActiveByUserId(userId);

            if (!subscription || !subscription.status) {
                this.logger.debug(`No active subscription found for user: ${userId}`);
                return false;
            }

            const hasAccess = subscription.tools?.some(
                (tool: any) => tool._id?.toString() === toolId
            ) || false;

            this.logger.debug(
                `Tool access check: user=${userId}, tool=${toolId}, hasAccess=${hasAccess}`
            );

            return hasAccess;
        } catch (error) {
            this.logger.error(`Error checking tool access: ${error.message}`);
            return false;
        }
    }

    /**
     * Get all tools a user has access to
     * @param userId - User ID
     * @returns Array of tool IDs the user can access
     */
    async getUserToolIds(userId: string): Promise<string[]> {
        try {
            const subscription = await this.subscriptionService.findActiveByUserId(userId);

            if (!subscription || !subscription.status) {
                return [];
            }

            return subscription.tools?.map((tool: any) => tool._id?.toString()) || [];
        } catch (error) {
            this.logger.error(`Error getting user tools: ${error.message}`);
            return [];
        }
    }

    /**
     * Get complete tool details for user's accessible tools
     * @param userId - User ID
     * @returns Array of tools from subscription
     */
    async getUserTools(userId: string): Promise<any[]> {
        try {
            const subscription = await this.subscriptionService.findActiveByUserId(userId);

            if (!subscription || !subscription.status) {
                return [];
            }

            return subscription.tools || [];
        } catch (error) {
            this.logger.error(`Error getting user tool details: ${error.message}`);
            return [];
        }
    }

    /**
     * Check if a company has access to a specific tool
     * @param companyId - Company ID to check
     * @param toolId - Tool ID to check access for
     * @returns true if company has access, false otherwise
     */
    async hasCompanyToolAccess(companyId: string, toolId: string): Promise<boolean> {
        try {
            // Find active subscription by company_id
            const subscription = await this.subscriptionService.findOne({
                company_id: companyId,
                status: true,
                soft_delete: false
            });

            if (!subscription) {
                this.logger.debug(`No active subscription found for company: ${companyId}`);
                return false;
            }

            const hasAccess = subscription.tools?.some(
                (tool: any) => tool._id?.toString() === toolId
            ) || false;

            return hasAccess;
        } catch (error) {
            this.logger.error(`Error checking company tool access: ${error.message}`);
            return false;
        }
    }
}
