import { PartialType } from '@nestjs/swagger';
import { DiscountCreateRequestDto } from './discount.create.request.dto';

export class DiscountUpdateRequestDto extends PartialType(
    DiscountCreateRequestDto
) {}
