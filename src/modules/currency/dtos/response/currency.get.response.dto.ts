import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { ENUM_CURRENCY_STATUS } from '@modules/currency/enums/currency.enum';

export class CurrencyGetResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) company_id: string;
    @ApiProperty({ required: false, type: String }) created_by?: string;

    @ApiProperty({ required: true, type: String }) code: string;
    @ApiProperty({ required: true, type: String }) name: string;
    @ApiProperty({ required: false, type: String }) symbol?: string;

    @ApiProperty({ required: true, type: Boolean }) is_active: boolean;
    @ApiProperty({ required: true, enum: ENUM_CURRENCY_STATUS }) status: ENUM_CURRENCY_STATUS;

    @ApiProperty({ required: true, type: Date }) createdAt: Date;
    @ApiProperty({ required: true, type: Date }) updatedAt: Date;

    @Exclude() soft_delete: boolean;
}

export class ExchangeRateResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) from_currency_id: string;
    @ApiProperty({ required: false, type: String }) from_currency_code?: string;
    @ApiProperty({ required: true, type: String }) to_currency_id: string;
    @ApiProperty({ required: false, type: String }) to_currency_code?: string;
    @ApiProperty({ required: true, type: String }) rate: string;
    @ApiProperty({ required: true, type: String }) effective_date: string;
    @ApiProperty({ required: true, type: Date }) createdAt: Date;
}
