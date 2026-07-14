import { ApiProperty } from '@nestjs/swagger';
import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import { ENUM_UOM_STATUS } from '@modules/uom/enums/uom.enum';

export class UomCreateRequestDto {
    /** The value stored on products and lines. Uppercased? NO — see the service. */
    @ApiProperty({ description: 'Unit code', example: 'KG' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(30)
    code: string;

    @ApiProperty({ description: 'Human label', example: 'Kilogram', required: false })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    name?: string;

    @ApiProperty({
        description: 'GST Unit Quantity Code printed on GSTR-1 / Shipping Bill',
        example: 'KGS',
        required: false,
    })
    @IsString()
    @IsOptional()
    @MaxLength(10)
    uqc_code?: string;

    @ApiProperty({
        description: 'False for countable units — blocks fractional quantities',
        required: false,
    })
    @IsBoolean()
    @IsOptional()
    allow_decimal?: boolean;

    @ApiProperty({ required: false })
    @IsInt()
    @IsOptional()
    sort_order?: number;

    @ApiProperty({ enum: ENUM_UOM_STATUS, required: false })
    @IsEnum(ENUM_UOM_STATUS)
    @IsOptional()
    status?: ENUM_UOM_STATUS;
}
