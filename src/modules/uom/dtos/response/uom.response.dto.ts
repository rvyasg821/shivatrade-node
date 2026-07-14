import { ApiProperty } from '@nestjs/swagger';
import { ENUM_UOM_STATUS } from '@modules/uom/enums/uom.enum';

export class UomResponseDto {
    @ApiProperty({ type: String }) _id: string;
    @ApiProperty({ type: String }) code: string;
    @ApiProperty({ type: String, required: false }) name?: string;
    @ApiProperty({ type: String, required: false }) uqc_code?: string;
    @ApiProperty({ type: Boolean }) allow_decimal: boolean;
    @ApiProperty({ type: Number }) sort_order: number;
    @ApiProperty({ enum: ENUM_UOM_STATUS }) status: ENUM_UOM_STATUS;

    /** How many products currently use this unit — drives the delete guard UI. */
    @ApiProperty({ type: Number, required: false }) in_use_count?: number;

    @ApiProperty({ type: Date }) createdAt: Date;
    @ApiProperty({ type: Date }) updatedAt: Date;
}

/** Lightweight shape for the product / line-item dropdowns. */
export class UomDropdownDto {
    @ApiProperty({ type: String }) _id: string;
    @ApiProperty({ type: String }) code: string;
    @ApiProperty({ type: String, required: false }) name?: string;
    @ApiProperty({ type: String, required: false }) uqc_code?: string;

    /** The frontend's old `integer` flag, inverted and now server-owned. */
    @ApiProperty({ type: Boolean }) allow_decimal: boolean;
}
