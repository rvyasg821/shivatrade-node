import { Type } from 'class-transformer';
import {
    IsArray,
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
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PurchaseOrderAssignmentDto)
    assignments: PurchaseOrderAssignmentDto[];

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
}
