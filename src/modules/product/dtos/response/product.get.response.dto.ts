import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { ENUM_PRODUCT_STATUS } from '@modules/product/enums/product.enum';

export class ProductGetResponseDto {
    @ApiProperty({ required: true, type: String })
    _id: string;

    @ApiProperty({ required: true, type: String })
    company_id: string;

    @ApiProperty({ required: false, type: String })
    created_by?: string;

    @ApiProperty({ required: true, type: String })
    code: string;

    @ApiProperty({ required: true, type: String })
    name: string;

    @ApiProperty({ required: false, type: String })
    category_id?: string;

    @ApiProperty({ required: false, type: String })
    category_name?: string;

    @ApiProperty({ required: false, type: String })
    description?: string;

    @ApiProperty({ required: false, type: String })
    specifications?: string;

    @ApiProperty({ required: false, type: String })
    packaging_details?: string;

    @ApiProperty({ required: false, type: String })
    quality_parameters?: string;

    @ApiProperty({ required: false, type: String })
    hsn_code?: string;

    @ApiProperty({ required: false, type: String })
    unit_of_measure?: string;

    @ApiProperty({ required: true, type: Boolean })
    is_active: boolean;

    @ApiProperty({ required: true, enum: ENUM_PRODUCT_STATUS })
    status: ENUM_PRODUCT_STATUS;

    @ApiProperty({ required: true, type: Date })
    createdAt: Date;

    @ApiProperty({ required: true, type: Date })
    updatedAt: Date;

    @Exclude()
    soft_delete: boolean;
}
