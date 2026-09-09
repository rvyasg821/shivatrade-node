import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { QuotationCreateRequestDto } from './quotation.create.request.dto';

export class QuotationUpdateRequestDto extends PartialType(
    QuotationCreateRequestDto
) {
    /** Transient, request-only — never persisted. When true, this ONE save
     *  skips the usual whole-currency-unit rounding of grand_total (see
     *  QuotationService.recompute's `exactTotal` param doc comment). Used
     *  only for the historical-import full-update-on-reimport path. */
    @IsOptional()
    @IsBoolean()
    exactTotal?: boolean;
}
