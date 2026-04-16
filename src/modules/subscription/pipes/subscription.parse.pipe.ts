import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { SubscriptionDoc } from '../repository/entities/subscription.entity';
import { SubscriptionService } from '../services/subscription.service';

@Injectable()
export class SubscriptionParsePipe implements PipeTransform {
    constructor(private readonly subscriptionService: SubscriptionService) { }

    async transform(value: any): Promise<SubscriptionDoc> {
        const subscription: SubscriptionDoc = await this.subscriptionService.findOneById(value, {
            join: true,
        });

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