import { ApiProperty } from '@nestjs/swagger';
import { ENUM_CITY_STATUS } from '@modules/city/enums/city.enum';

export class CityResponseDto {
    @ApiProperty({ type: String }) _id: string;
    @ApiProperty({ type: String }) name: string;
    @ApiProperty({ type: String, required: false }) city_code?: string;
    @ApiProperty({ type: String }) state_id: string;
    @ApiProperty({ type: String }) country_id: string;

    /** Resolved on read so the list shows names, not uuids. */
    @ApiProperty({ type: String, required: false }) state_name?: string;
    @ApiProperty({ type: String, required: false }) country_name?: string;

    @ApiProperty({ enum: ENUM_CITY_STATUS }) status: ENUM_CITY_STATUS;
    @ApiProperty({ type: Date }) createdAt: Date;
    @ApiProperty({ type: Date }) updatedAt: Date;
}

export class CityDropdownDto {
    @ApiProperty({ type: String }) _id: string;
    @ApiProperty({ type: String }) name: string;
    @ApiProperty({ type: String, required: false }) city_code?: string;
    @ApiProperty({ type: String }) state_id: string;
    @ApiProperty({ type: String }) country_id: string;
}
