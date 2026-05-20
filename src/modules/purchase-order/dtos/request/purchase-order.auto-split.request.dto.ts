import { Type } from 'class-transformer';
import {
    IsArray,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    ValidateNested,
} from 'class-validator';

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
}
