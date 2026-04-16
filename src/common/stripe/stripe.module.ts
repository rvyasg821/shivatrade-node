import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';

@Module({
    providers: [StripeService],
    exports: [StripeService],
    imports: [],
})
export class StripeModule {}
