import { PartialType } from '@nestjs/swagger';
import { SubscriptionCreateRequestDto } from './subscription.create.request.dto';

export class SubscriptionUpdateRequestDto extends PartialType(SubscriptionCreateRequestDto) { }