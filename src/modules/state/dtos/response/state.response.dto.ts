import { ApiProperty } from '@nestjs/swagger';
import { ENUM_STATE_STATUS } from '@modules/state/enums/state.enum';

export class StateResponseDto {
    @ApiProperty({ type: String }) _id: string;
    @ApiProperty({ type: String }) name: string;
    @ApiProperty({ type: String, required: false }) state_code?: string;
    @ApiProperty({ type: String }) country_id: string;
    @ApiProperty({ type: String, required: false }) country_code?: string;

    /** Resolved on read so the list can show the country without a second call. */
    @ApiProperty({ type: String, required: false }) country_name?: string;

    @ApiProperty({ enum: ENUM_STATE_STATUS }) status: ENUM_STATE_STATUS;
    @ApiProperty({ type: Date }) createdAt: Date;
    @ApiProperty({ type: Date }) updatedAt: Date;
}

/** Lightweight shape for the address-form dropdowns. */
export class StateDropdownDto {
    @ApiProperty({ type: String }) _id: string;
    @ApiProperty({ type: String }) name: string;
    @ApiProperty({ type: String, required: false }) state_code?: string;
    @ApiProperty({ type: String }) country_id: string;
    @ApiProperty({ type: String, required: false }) country_code?: string;
}
