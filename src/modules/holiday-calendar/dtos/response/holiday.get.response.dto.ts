import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

export class HolidayGetResponseDto {
    @ApiProperty({ type: String })
    _id: string;

    @ApiProperty({ type: String })
    calendar_id: string;

    @ApiProperty({ type: String })
    company_id: string;

    @ApiProperty({ type: String })
    name: string;

    @ApiProperty({ type: String })
    date: string;

    @ApiProperty({ type: String })
    type: string;

    @ApiProperty({ type: Boolean })
    is_recurring: boolean;

    @ApiProperty({ type: String, required: false })
    notes?: string;

    @ApiProperty({ type: Date })
    createdAt: Date;

    @ApiProperty({ type: Date })
    updatedAt: Date;

    @Exclude()
    soft_delete: boolean;
}
