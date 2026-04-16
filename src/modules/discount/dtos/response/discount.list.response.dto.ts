import { PartialType } from '@nestjs/swagger';
import { DiscountGetResponseDto } from './discount.get.response.dto';

export class DiscountListResponseDto extends PartialType(
    DiscountGetResponseDto
) {}
