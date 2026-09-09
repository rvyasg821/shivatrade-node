import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { InvoiceCreateRequestDto } from './invoice.create.request.dto';

/**
 * Update DTO - server enforces field-level edit gates per status:
 *  - DRAFT     : all fields + line items editable
 *  - ISSUED+   : only the Shipment & Shipping Bill block (§3a) + notes
 *                editable; financial fields + line items frozen
 *  - CANCELLED : nothing editable
 *
 * See INVOICE_EDITABLE_AT_ISSUED in invoice.enum.ts for the post-issue list.
 */
export class InvoiceUpdateRequestDto extends PartialType(
    InvoiceCreateRequestDto
) {
    /** Transient, request-only — never persisted. When true (DRAFT only —
     *  ISSUED+ invoices don't accept financial-field edits at all, this flag
     *  included), this ONE save skips the usual whole-currency-unit rounding
     *  of grand_total (see InvoiceService.recompute's `exactTotal` param).
     *  Used only for the historical-import full-update-on-reimport path. */
    @IsOptional()
    @IsBoolean()
    exactTotal?: boolean;
}
