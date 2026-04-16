import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LeaveRejectRequestDto {
    @ApiProperty()
    @IsString()
    reason: string;
}
