import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionService } from '../services/subscription.service';

export const SKIP_SUBSCRIPTION_CHECK = 'skipSubscriptionCheck';

@Injectable()
export class SubscriptionGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly subscriptionService: SubscriptionService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Check if route has skipSubscriptionCheck decorator
        const skipCheck = this.reflector.getAllAndOverride<boolean>(
            SKIP_SUBSCRIPTION_CHECK,
            [context.getHandler(), context.getClass()]
        );

        if (skipCheck) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        // Skip check for Super Admin
        if (user?.roleName === 'Admin') {
            return true;
        }

        // For Company Admin and other users, check subscription
        if (user && user.user) {
            const userId = user.user.toString();
            const activeSubscription = await this.subscriptionService.findActiveByUserId(userId);

            if (!activeSubscription) {
                throw new ForbiddenException({
                    statusCode: 403,
                    message: 'Active subscription required',
                    error: 'NO_ACTIVE_SUBSCRIPTION',
                    redirectTo: '/apps/profile/subscription/upgrade'
                });
            }
        }

        return true;
    }
}
