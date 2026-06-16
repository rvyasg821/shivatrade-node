import { Type } from 'class-transformer';
import {
    IsArray,
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { ENUM_GRN_STATUS } from '../../enums/grn.enum';

export class GrnCreateFromPovDto {
    @IsDateString()
    @IsOptional()
    grn_date?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    notes?: string;
}

export class GrnLineUpdateDto {
    @IsUUID()
    @IsNotEmpty()
    _id: string;

    @IsNumberString({}, { message: 'received_qty must be a numeric string' })
    @IsOptional()
    received_qty?: string;

    @IsNumberString({}, { message: 'accepted_qty must be a numeric string' })
    @IsOptional()
    accepted_qty?: string;

    @IsNumberString({}, { message: 'rejected_qty must be a numeric string' })
    @IsOptional()
    rejected_qty?: string;

    @IsString()
    @IsOptional()
    @MaxLength(60)
    batch_no?: string;

    @IsString()
    @IsOptional()
    @MaxLength(300)
    remarks?: string;
}

export class GrnUpdateDto {
    @IsDateString()
    @IsOptional()
    grn_date?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    notes?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    internal_notes?: string;

    @IsEnum(ENUM_GRN_STATUS)
    @IsOptional()
    status?: ENUM_GRN_STATUS;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => GrnLineUpdateDto)
    @IsOptional()
    lines?: GrnLineUpdateDto[];
}
