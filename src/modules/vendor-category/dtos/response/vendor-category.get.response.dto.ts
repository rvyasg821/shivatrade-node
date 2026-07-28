import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { ENUM_VENDOR_CATEGORY_STATUS } from '@modules/vendor-category/enums/vendor-category.enum';

export class VendorCategoryGetResponseDto {
    @ApiProperty({ required: true, type: String })
    _id: string;

    @ApiProperty({ required: true, type: String })
    company_id: string;

    @ApiProperty({ required: false, type: String })
    created_by?: string;

    @ApiProperty({ required: true, type: String })
    name: string;

    @ApiProperty({ required: false, type: String })
    code?: string;

    @ApiProperty({ required: false, type: String })
    description?: string;

    @ApiProperty({ required: true, type: Boolean })
    is_active: boolean;

    @ApiProperty({ required: true, enum: ENUM_VENDOR_CATEGORY_STATUS })
    status: ENUM_VENDOR_CATEGORY_STATUS;

    @ApiProperty({ required: true, type: Date })
    createdAt: Date;

    @ApiProperty({ required: true, type: Date })
    updatedAt: Date;

    @Exclude()
    soft_delete: boolean;
}
