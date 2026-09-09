import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { PurchaseOrderCreateRequestDto } from './purchase-order.create.request.dto';

export class PurchaseOrderUpdateRequestDto extends PartialType(
    PurchaseOrderCreateRequestDto
) {
    /** Transient, request-only — never persisted. When true, this ONE save
     *  skips the usual whole-currency-unit rounding of grand_total (see
     *  PurchaseOrderService.recompute's `exactTotal` param doc comment). Used
     *  only for the one-off historical-import total correction. */
    @IsOptional()
    @IsBoolean()
    exactTotal?: boolean;
}
