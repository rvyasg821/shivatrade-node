import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsNumber,
    MaxLength,
    Min,
    Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ENUM_TOOLS_STATUS } from '../../enums/tools.enum';

export class ToolsCreateRequestDto {
    @ApiProperty({
        description: 'Tool name',
        example: 'AI Assistant',
        maxLength: 100,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @ApiProperty({
        description: 'Tool name slug',
        example: 'AI Assistant',
        maxLength: 100,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    slug: string;

    @ApiProperty({
        description: 'Tool description',
        example: 'Advanced AI assistant for productivity',
        maxLength: 500,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    description: string;

    @ApiPropertyOptional({
        description: 'Display order for sorting tools',
        example: 1,
        minimum: 0,
        maximum: 999,
        default: 0,
    })
    @IsNumber()
    @Min(0)
    @Max(999)
    @IsOptional()
    @Transform(({ value }) => value ?? 0)
    displayOrder?: number;

    @ApiProperty({
        description: 'Tool status',
        enum: ENUM_TOOLS_STATUS,
        example: ENUM_TOOLS_STATUS.ACTIVE,
        default: ENUM_TOOLS_STATUS.ACTIVE,
        required: false,
    })
    @IsEnum(ENUM_TOOLS_STATUS)
    @IsOptional()
    @Transform(({ value }) => {
        if (value === undefined) {
            return ENUM_TOOLS_STATUS.ACTIVE;
        }
        if (typeof value === 'string') {
            return value === 'ACTIVE' ? ENUM_TOOLS_STATUS.ACTIVE : ENUM_TOOLS_STATUS.INACTIVE;
        }
        return value;
    })
    status?: ENUM_TOOLS_STATUS;
}