import { ApiProperty } from '@nestjs/swagger';
import {
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';
import { ENUM_STATE_STATUS } from '@modules/state/enums/state.enum';

export class StateCreateRequestDto {
    @ApiProperty({ description: 'Name of the state', example: 'Gujarat' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @ApiProperty({ description: 'Parent country id', required: true })
    @IsUUID()
    @IsNotEmpty()
    country_id: string;

    @ApiProperty({ description: 'Local state code', example: 'GJ', required: false })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    state_code?: string;

    @ApiProperty({ enum: ENUM_STATE_STATUS, required: false })
    @IsEnum(ENUM_STATE_STATUS)
    @IsOptional()
    status?: ENUM_STATE_STATUS;
}
