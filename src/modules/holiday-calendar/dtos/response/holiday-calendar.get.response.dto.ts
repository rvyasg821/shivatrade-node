import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Type } from 'class-transformer';
import { HolidayGetResponseDto } from './holiday.get.response.dto';

export class HolidayCalendarGetResponseDto {
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

    @ApiProperty({ type: Date })
    updatedAt: Date;

    // Populated by controller/service when fetching single calendar
    @ApiProperty({ type: [HolidayGetResponseDto], required: false })
    @Type(() => HolidayGetResponseDto)
    holidays?: HolidayGetResponseDto[];

    @Exclude()
    soft_delete: boolean;
}
