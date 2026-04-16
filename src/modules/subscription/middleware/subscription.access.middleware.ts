import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SubscriptionService } from '../services/subscription.service';
import { UserService } from '@modules/user/services/user.service';

export interface IRequestWithUser extends Request {
    user?: {
        _id: string;
        [key: string]: any;
    };
}

@Injectable()
export class SubscriptionAccessMiddleware implements NestMiddleware {
    constructor(
        private readonly subscriptionService: SubscriptionService,
        private readonly userService: UserService
    ) { }

    async use(req: IRequestWithUser, res: Response, next: NextFunction) {
        const userId = req.user?._id;

        if (!userId) {
            throw new ForbiddenException('User not authenticated');
        }

        try {
            // Get user's active subscription
            const subscription = await this.subscriptionService.findActiveByUserId(userId);

            if (!subscription) {
                throw new ForbiddenException('No active subscription found');
            }

            // Check if subscription is active and not expired
            if (!subscription.status) {
                throw new ForbiddenException('Subscription is inactive');
            }

            if (subscription.hold) {
                throw new ForbiddenException('Subscription is on hold');
            }

            // Check if subscription has expired (if not lifetime)
            if (!subscription.is_lifetime && subscription.end_date && new Date() > subscription.end_date) {
                throw new ForbiddenException('Subscription has expired');
            }

            // Add subscription info to request for downstream use
            req['subscription'] = subscription;

            next();
        } catch (error) {
            if (error instanceof ForbiddenException) {
                throw error;
            }
            throw new ForbiddenException('Unable to verify subscription access');
        }
    }
}