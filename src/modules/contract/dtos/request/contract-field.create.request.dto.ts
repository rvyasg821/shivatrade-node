import { IsString, IsOptional, IsBoolean, IsInt, IsIn, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ENUM_CONTRACT_FIELD_TYPE } from '../../enums/contract.enum';

export class ContractFieldCreateRequestDto {
    @ApiProperty()
    @IsString()
    contract_section_id: string;

    @ApiProperty()
    @IsString()
    contract_template_id: string;

    @ApiProperty()
    @IsString()
    @MaxLength(200)
    label: string;

    @ApiProperty({ enum: Object.values(ENUM_CONTRACT_FIELD_TYPE) })
    @IsIn(Object.values(ENUM_CONTRACT_FIELD_TYPE))
    field_type: ENUM_CONTRACT_FIELD_TYPE;

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
