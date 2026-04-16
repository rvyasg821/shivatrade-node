import { IsString, IsOptional, IsBoolean, IsInt, Min, Max, MaxLength } from 'class-validator';

export class HolidayCalendarUpdateRequestDto {
    @IsString()
    @IsOptional()
    @MaxLength(200)
    name?: string;

    @IsInt()
    @Min(2000)
    @Max(2100)
    @IsOptional()
    year?: number;

    @IsBoolean()
    @IsOptional()
    is_default?: boolean;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean;
}
