import { PartialType } from '@nestjs/swagger';
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
export class InvoiceUpdateRequestDto extends PartialType(InvoiceCreateRequestDto) {}
