import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsBoolean,
    IsNumber,
    Min,
    MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    ENUM_EXPENSE_STATUS,
    ENUM_EXPENSE_TYPE,
} from '@modules/expense/enums/expense.enum';

export class ExpenseCreateRequestDto {
    @IsString() @IsNotEmpty() @MaxLength(150) name: string;
    @IsString() @IsNotEmpty() @MaxLength(30) code: string;

    /** Expense HSN/SAC code — independent of product HSN. Optional. */
    @IsString() @IsOptional() @MaxLength(20) hsn_code?: string;

    @IsEnum(ENUM_EXPENSE_TYPE) @IsOptional() type?: ENUM_EXPENSE_TYPE;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    value: number;

    @IsEnum(ENUM_EXPENSE_STATUS) @IsOptional() status?: ENUM_EXPENSE_STATUS;
    @IsBoolean() @IsOptional() is_active?: boolean;
}
