import { IsString, IsOptional, IsBoolean, IsInt, Min, MaxLength, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ENUM_CONTRACT_TEMPLATE_STATUS } from '../../enums/contract.enum';

export class ContractTemplateUpdateRequestDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(200)
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ enum: Object.values(ENUM_CONTRACT_TEMPLATE_STATUS) })
    @IsOptional()
    @IsIn(Object.values(ENUM_CONTRACT_TEMPLATE_STATUS))
    status?: ENUM_CONTRACT_TEMPLATE_STATUS;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    is_default?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    requires_signature?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(1)
    version?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    is_system?: boolean;
}
