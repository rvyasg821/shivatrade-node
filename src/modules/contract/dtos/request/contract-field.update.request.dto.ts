import { IsString, IsOptional, IsBoolean, IsInt, IsIn, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ENUM_CONTRACT_FIELD_TYPE } from '../../enums/contract.enum';

export class ContractFieldUpdateRequestDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(200)
    label?: string;

    @ApiPropertyOptional({ enum: Object.values(ENUM_CONTRACT_FIELD_TYPE) })
    @IsOptional()
    @IsIn(Object.values(ENUM_CONTRACT_FIELD_TYPE))
    field_type?: ENUM_CONTRACT_FIELD_TYPE;

    @ApiPropertyOptional()
    @IsOptional()
    options?: any[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    is_required?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    is_readonly?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    auto_populate_from?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    default_value?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(200)
    placeholder?: string;

    @ApiPropertyOptional()
    @IsOptional()
    validation_rules?: any;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    order?: number;
}
