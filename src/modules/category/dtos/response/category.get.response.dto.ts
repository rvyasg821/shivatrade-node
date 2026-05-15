import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { ENUM_CATEGORY_STATUS } from '@modules/category/enums/category.enum';

export class CategoryGetResponseDto {
    @ApiProperty({ required: true, type: String })
    _id: string;

    @ApiProperty({ required: true, type: String })
    company_id: string;

    @ApiProperty({ required: false, type: String })
    created_by?: string;

    @ApiProperty({ required: true, type: String })
    name: string;

    @ApiProperty({ required: false, type: String })
    description?: string;

    @ApiProperty({ required: false, type: String })
    parent_id?: string;

    @ApiProperty({ required: false, type: String })
    parent_name?: string;

    @ApiProperty({ required: true, type: Boolean })
    is_active: boolean;

    @ApiProperty({ required: true, enum: ENUM_CATEGORY_STATUS })
    status: ENUM_CATEGORY_STATUS;

    @ApiProperty({ required: true, type: Date })
    createdAt: Date;

    @ApiProperty({ required: true, type: Date })
    updatedAt: Date;

    @Exclude()
    soft_delete: boolean;
}
