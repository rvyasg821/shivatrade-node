import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TOOL_ACCESS_KEY } from '../decorators/tool-access.decorator';
import { SubscriptionService } from '../services/subscription.service';

@Injectable()
export class ToolAccessGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private readonly subscriptionService: SubscriptionService
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Single-tenant mode: tool/subscription gating is disabled.
        if ((process.env.APP_MODE || 'single') === 'single') {
            return true;
        }

        const requiredToolIds = this.reflector.getAllAndOverride<string[]>(TOOL_ACCESS_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredToolIds || requiredToolIds.length === 0) {
            return true; // No tool access required
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;
        const userId = user?._id;

        if (!userId) {
            // JWT guard (method-level) hasn't run yet — let it handle authentication
            return true;
        }

        // Super Admin (platform admin) and users without a company bypass tool access checks.
        // They are not company subscribers — they manage the platform itself.
        if (user?.roleName === 'Admin' || !user?.companyId) {
            return true;
        }

        try {
            // Get any subscription (active or inactive) so we can give a clearer message
            const subscription = await this.subscriptionService.findAnyByUserId(userId);

            if (!this.subscriptionService.isSubscriptionActive(subscription)) {
                const reason = this.subscriptionService.getInactiveReason(subscription);
                const messages: Record<string, string> = {
                    no_subscription: 'No active subscription found. Please subscribe to a plan that includes this module.',
                    status_inactive: 'Subscription is inactive',
                    on_hold: 'Subscription is on hold',
                    cancelled: 'Subscription has been cancelled',
                    expired: 'Subscription has expired',
                };
                throw new ForbiddenException(messages[reason || 'no_subscription']);
            }

            // Get user's subscribed tool IDs and Slugs
            const subscribedToolIds = subscription.tools.map(tool => tool._id.toString());
            const subscribedToolSlugs = subscription.tools.map(tool => tool.slug);

            // Check if user has access to all required tools (by ID or Slug)
            const hasAccess = requiredToolIds.every(toolIdOrSlug =>
                subscribedToolIds.includes(toolIdOrSlug) || subscribedToolSlugs.includes(toolIdOrSlug)
            );

            if (!hasAccess) {
                const missingTools = requiredToolIds.filter(toolIdOrSlug =>
                    !subscribedToolIds.includes(toolIdOrSlug) && !subscribedToolSlugs.includes(toolIdOrSlug)
                );
                throw new ForbiddenException(
                    `Access denied. Your subscription plan does not include: ${missingTools.join(', ')}. Please upgrade your plan.`
                );
            }

            return true;
        } catch (error) {
            if (error instanceof ForbiddenException) {
                throw error;
            }
            throw new ForbiddenException('Unable to verify tool access');
        }
    }
}
