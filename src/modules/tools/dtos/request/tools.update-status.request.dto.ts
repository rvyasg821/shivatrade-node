import { IsEnum, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ENUM_TOOLS_STATUS } from '../../enums/tools.enum';

export class ToolsUpdateStatusRequestDto {
    @ApiProperty({
        description: 'Tool status',
        enum: ENUM_TOOLS_STATUS,
        example: ENUM_TOOLS_STATUS.ACTIVE,
    })
    @Transform(({ value }) => {
        if (typeof value === 'string') {
            return value === 'ACTIVE' ? ENUM_TOOLS_STATUS.ACTIVE : ENUM_TOOLS_STATUS.INACTIVE;
        }
        return value;
    })
    @IsEnum(ENUM_TOOLS_STATUS)
    @IsNotEmpty()
    status: ENUM_TOOLS_STATUS;
}