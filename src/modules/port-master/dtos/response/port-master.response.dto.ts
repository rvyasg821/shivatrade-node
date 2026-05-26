import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { ENUM_PORT_TYPE } from '@modules/port-master/enums/port-master.enum';

export class PortMasterResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) code: string;
    @ApiProperty({ required: true, type: String }) name: string;
    @ApiProperty({ required: true, enum: ENUM_PORT_TYPE }) type: ENUM_PORT_TYPE;
    @ApiProperty({ required: true, type: String }) country_code: string;
    @ApiProperty({ required: false, type: String }) state?: string;
    @ApiProperty({ required: true, type: Boolean }) is_active: boolean;
    @ApiProperty({ required: true, type: Date }) createdAt: Date;
    @ApiProperty({ required: true, type: Date }) updatedAt: Date;

    @Exclude()
    soft_delete: boolean;
}

/** Lightweight shape for the dropdown - minimum needed to render + snapshot. */
export class PortMasterDropdownDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) code: string;
    @ApiProperty({ required: true, type: String }) name: string;
    @ApiProperty({ required: true, enum: ENUM_PORT_TYPE }) type: ENUM_PORT_TYPE;
    @ApiProperty({ required: true, type: String }) country_code: string;
    @ApiProperty({ required: false, type: String }) state?: string;

    /** Server-built UI label so FE doesn't have to compose it. */
    @ApiProperty({ required: true, type: String }) display_label: string;
}
