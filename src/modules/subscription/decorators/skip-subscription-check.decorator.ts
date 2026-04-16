import { SetMetadata } from '@nestjs/common';
import { SKIP_SUBSCRIPTION_CHECK } from '../guards/subscription.guard';

export const SkipSubscriptionCheck = () => SetMetadata(SKIP_SUBSCRIPTION_CHECK, true);
