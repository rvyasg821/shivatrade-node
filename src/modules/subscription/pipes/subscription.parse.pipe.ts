import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { SubscriptionDoc } from '../repository/entities/subscription.entity';
import { SubscriptionService } from '../services/subscription.service';

@Injectable()
export class SubscriptionParsePipe implements PipeTransform {
    constructor(private readonly subscriptionService: SubscriptionService) { }

    async transform(value: any): Promise<SubscriptionDoc> {
        // A non-UUID value previously threw a raw, uncaught Postgres
        // "invalid input syntax for uuid" error -> unhandled 500 instead of
        // a clean 404 (found via a full-app test pass, same class of gap
        // fixed on User/Role/Country/Discount/Inventory). Mirrors the
        // already-correct ToolsParsePipe.
        let subscription: SubscriptionDoc | undefined;
        try {
            subscription = await this.subscriptionService.findOneById(value, {
                join: true,
            });
        } catch {
            subscription = undefined;
        }

        if (!subscription) {
            throw new NotFoundException({
                statusCode: 404,
                message: 'subscription.error.notFound',
                error: 'Not Found',
            });
        }

        return subscription;
    }
}
