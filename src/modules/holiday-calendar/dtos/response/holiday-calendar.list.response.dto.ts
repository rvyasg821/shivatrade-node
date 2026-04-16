import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

export class HolidayCalendarListResponseDto {
    @ApiProperty({ type: String })
    _id: string;

    @ApiProperty({ type: String })
    company_id: string;

    @ApiProperty({ type: String, required: false })
    location_id?: string;

    @ApiProperty({ type: Number })
    year: number;

    @ApiProperty({ type: String })
    name: string;

    @ApiProperty({ type: Boolean })
    is_default: boolean;

    @ApiProperty({ type: Boolean })
    is_active: boolean;

    @ApiProperty({ type: Date })
    createdAt: Date;

    @Exclude()
    soft_delete: boolean;
}
