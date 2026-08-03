import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
    ENUM_EXPENSE_STATUS,
    ENUM_EXPENSE_TYPE,
} from '@modules/expense/enums/expense.enum';

export class ExpenseGetResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) company_id: string;
    @ApiProperty({ required: false, type: String }) created_by?: string;

    @ApiProperty({ required: true, type: String }) name: string;
    @ApiProperty({ required: true, type: String }) code: string;
    @ApiProperty({ required: false, type: String }) hsn_code?: string;
    @ApiProperty({ required: true, enum: ENUM_EXPENSE_TYPE }) type: ENUM_EXPENSE_TYPE;
    @ApiProperty({ required: true, type: String }) value: string;

    @ApiProperty({ required: true, type: Boolean }) is_active: boolean;
    @ApiProperty({ required: true, enum: ENUM_EXPENSE_STATUS })
    status: ENUM_EXPENSE_STATUS;

    @ApiProperty({ required: true, type: Date }) createdAt: Date;
    @ApiProperty({ required: true, type: Date }) updatedAt: Date;

    @Exclude() soft_delete: boolean;
}
