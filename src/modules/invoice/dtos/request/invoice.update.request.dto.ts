import { PartialType } from '@nestjs/swagger';
import { InvoiceCreateRequestDto } from './invoice.create.request.dto';

/**
 * Update DTO - server enforces field-level edit gates per status:
 *  - DRAFT     : all fields editable
 *  - ISSUED    : only `shipping_id`, `advance_received`, `internal_notes`, `notes_to_buyer`
 *  - other     : nothing editable (transition only via /issue, /cancel)
 *
 * See INVOICE_EDITABLE_AT_ISSUED in invoice.enum.ts for the post-issue list.
 */
export class InvoiceUpdateRequestDto extends PartialType(InvoiceCreateRequestDto) {}
