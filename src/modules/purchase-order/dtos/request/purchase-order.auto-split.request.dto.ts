import { Type } from 'class-transformer';
import {
    IsArray,
    IsDateString,
    IsIn,
    IsNotEmpty,
    IsNumberString,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    ValidateNested,
} from 'class-validator';

/**
 * Per-vendor expense pick during PFI → Generate POs. Mirrors
 * PoVendorExpenseInputDto; duplicated here to avoid a cross-module
 * import (`purchase-order` would otherwise pull `po-vendor`).
 */
export class PurchaseOrderVendorExpensePickDto {
    @IsUUID()
    @IsNotEmpty()
    expense_id: string;

    @IsIn(['percent', 'fixed'])
    @IsOptional()
    type?: 'percent' | 'fixed';

    @IsNumberString({}, { message: 'value must be a numeric string' })
    @IsOptional()
    value?: string;
}

export class PurchaseOrderAssignmentDto {
    @IsString()
    @IsNotEmpty()
    source_line_id: string;

    @IsUUID()
    @IsNotEmpty()
    vendor_id: string;
}

export class PurchaseOrderAutoSplitRequestDto {
    /** Legacy — SO generation no longer assigns vendors (that happens at POV
     *  generation). Kept optional so old callers don't 400. */
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PurchaseOrderAssignmentDto)
    assignments?: PurchaseOrderAssignmentDto[];

    /** Optional company_addresses._id — applied to every PO generated
     *  in this batch. Falls back to manual text if not provided. */
    @IsUUID()
    @IsOptional()
    delivery_address_id?: string;

    /** Optional raw text override — wins over `delivery_address_id`
     *  when both are provided. */
    @IsString()
    @IsOptional()
    @MaxLength(2000)
    delivery_address?: string;

    /** Optional per-vendor expense list applied to each spawned POV.
     *  Key = vendor_id (UUID), value = array of expense picks. Empty
     *  map / missing keys mean "no charges for that vendor". */
    @IsObject()
    @IsOptional()
    vendor_expenses?: Record<string, PurchaseOrderVendorExpensePickDto[]>;

    // ── Customer order reference + advance (S4) — captured at SO generation ──
    @IsString()
    @IsOptional()
    @MaxLength(100)
    customer_po_number?: string;

    /** Manual alphanumeric tracking reference. Defaults from the quotation's
     *  reference_no when omitted (Lead → Quotation → SO → Invoice chain). */
    @IsString()
    @IsOptional()
    @MaxLength(100)
    reference_no?: string;

    @IsNumberString({}, { message: 'advance_amount must be a numeric string' })
    @IsOptional()
    advance_amount?: string;

    @IsDateString()
    @IsOptional()
    advance_date?: string;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    advance_notes?: string;
}
