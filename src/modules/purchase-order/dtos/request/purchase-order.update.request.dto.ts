import { PartialType } from '@nestjs/swagger';
import { PurchaseOrderCreateRequestDto } from './purchase-order.create.request.dto';

export class PurchaseOrderUpdateRequestDto extends PartialType(
    PurchaseOrderCreateRequestDto
) {}
