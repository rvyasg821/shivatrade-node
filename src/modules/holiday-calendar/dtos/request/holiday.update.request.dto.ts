import { IsString, IsOptional, IsBoolean, IsEnum, MaxLength, IsDateString } from 'class-validator';
import { ENUM_HOLIDAY_TYPE } from '../../enums/holiday-calendar.enum';

export class HolidayUpdateRequestDto {
    @IsString()
    @IsOptional()
    @MaxLength(200)
    name?: string;

    @IsDateString()
    @IsOptional()
    date?: string; // YYYY-MM-DD

    @IsEnum(ENUM_HOLIDAY_TYPE)
    @IsOptional()
    type?: ENUM_HOLIDAY_TYPE;

    @IsBoolean()
    @IsOptional()
    is_recurring?: boolean;

    @IsString()
    @IsOptional()
    notes?: string;
}
