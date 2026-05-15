import { ApiProperty } from '@nestjs/swagger';
import { ENUM_LEAD_ACTIVITY_TYPE } from '../../enums/lead-activity.enum';

export class LeadActivityGetResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) lead_id: string;
    @ApiProperty({ required: true, enum: ENUM_LEAD_ACTIVITY_TYPE })
    type: ENUM_LEAD_ACTIVITY_TYPE;
    @ApiProperty({ required: false, type: String }) body?: string;
    @ApiProperty({ required: false, type: Object }) metadata?: Record<string, any>;
    @ApiProperty({ required: false, type: String }) created_by?: string;
    @ApiProperty({ required: false, type: String }) created_by_name?: string;
    @ApiProperty({ required: true, type: Date }) createdAt: Date;
    @ApiProperty({ required: true, type: Date }) updatedAt: Date;
}
