import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AdjustmentNoteVoidRequestDto {
    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string;
}
