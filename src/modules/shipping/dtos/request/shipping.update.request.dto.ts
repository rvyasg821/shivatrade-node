import { PartialType } from '@nestjs/swagger';
import { ShippingCreateRequestDto } from './shipping.create.request.dto';

export class ShippingUpdateRequestDto extends PartialType(
    ShippingCreateRequestDto
) {}
