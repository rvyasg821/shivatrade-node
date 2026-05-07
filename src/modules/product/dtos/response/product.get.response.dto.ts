import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { ENUM_PRODUCT_STATUS } from '@modules/product/enums/product.enum';

export class ProductRebateLinkResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) rebate_id: string;
    @ApiProperty({ required: true, type: String }) code: string;
    @ApiProperty({ required: true, type: String }) name: string;
    /** Effective pct: per-product override if present, otherwise master's pct. */
    @ApiProperty({ required: true, type: String }) pct: string;
    @ApiProperty({ required: false, type: Boolean }) is_override?: boolean;
}

export class ProductExpenseLinkResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) expense_id: string;
    @ApiProperty({ required: true, type: String }) code: string;
    @ApiProperty({ required: true, type: String }) name: string;
    @ApiProperty({ required: true, type: String }) type: string;
    @ApiProperty({ required: true, type: String }) base: string;
    /** Effective value: per-product override if present, otherwise master's value. */
    @ApiProperty({ required: true, type: String }) value: string;
    @ApiProperty({ required: false, type: Boolean }) is_override?: boolean;
}

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

    @ApiProperty({ required: false, type: String })
    selling_price?: string;

    @ApiProperty({ required: false, type: String })
    currency_id?: string;

    @ApiProperty({ required: false, type: String })
    currency_code?: string;

    @ApiProperty({ required: false, type: String })
    part_no?: string;

    @ApiProperty({ required: false, type: Number })
    pack_size?: number;

    @ApiProperty({ required: false, type: String })
    net_weight_per_unit?: string;

    @ApiProperty({ required: false, type: String })
    gross_weight_per_unit?: string;

    @ApiProperty({ required: false, type: String })
    country_of_origin?: string;

    @ApiProperty({ required: false, type: [ProductRebateLinkResponseDto] })
    rebates?: ProductRebateLinkResponseDto[];

    @ApiProperty({ required: false, type: [ProductExpenseLinkResponseDto] })
    expenses?: ProductExpenseLinkResponseDto[];

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
