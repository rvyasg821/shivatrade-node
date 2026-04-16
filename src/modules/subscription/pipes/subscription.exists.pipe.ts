import { Injectable, ConflictException, PipeTransform } from '@nestjs/common';
import { SubscriptionService } from '../services/subscription.service';

@Injectable()
export class SubscriptionExistsPipe implements PipeTransform {
    constructor(private readonly subscriptionService: SubscriptionService) { }

    async transform(value: any): Promise<string> {
        const exist: boolean = await this.subscriptionService.existByUserId(value);
        if (exist) {
            throw new ConflictException({
                statusCode: 409,
                message: 'subscription.error.exist',
                error: 'Conflict',
            });
        }

        return value;
    }
}