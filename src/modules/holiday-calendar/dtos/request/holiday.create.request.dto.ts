import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEnum, MaxLength, IsDateString, IsUUID } from 'class-validator';
import { ENUM_HOLIDAY_TYPE } from '../../enums/holiday-calendar.enum';

export class HolidayCreateRequestDto {
    @IsUUID()
    @IsNotEmpty()
    calendar_id: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    name: string;

    @IsDateString()
    @IsNotEmpty()
    date: string; // YYYY-MM-DD

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
