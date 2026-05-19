import { Type } from 'class-transformer';
import {
    IsArray,
    IsNotEmpty,
    IsString,
    IsUUID,
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
}
