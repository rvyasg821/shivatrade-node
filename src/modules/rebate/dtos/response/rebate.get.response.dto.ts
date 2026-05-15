import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
    ENUM_REBATE_STATUS,
    ENUM_REBATE_TYPE,
} from '@modules/rebate/enums/rebate.enum';

export class RebateGetResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) company_id: string;
    @ApiProperty({ required: false, type: String }) created_by?: string;

    @ApiProperty({ required: true, type: String }) name: string;
    @ApiProperty({ required: true, type: String }) code: string;

    @ApiProperty({ required: true, enum: ENUM_REBATE_TYPE })
    type: ENUM_REBATE_TYPE;

    @ApiProperty({ required: true, type: String }) pct: string;

    @ApiProperty({ required: true, type: Boolean }) is_active: boolean;
    @ApiProperty({ required: true, enum: ENUM_REBATE_STATUS })
    status: ENUM_REBATE_STATUS;

    @ApiProperty({ required: true, type: Date }) createdAt: Date;
    @ApiProperty({ required: true, type: Date }) updatedAt: Date;

    @Exclude() soft_delete: boolean;
}
