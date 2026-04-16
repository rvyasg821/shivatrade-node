import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, Min, Max, MaxLength, IsUUID } from 'class-validator';

export class HolidayCalendarCreateRequestDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    name: string;

    @IsInt()
    @Min(2000)
    @Max(2100)
    year: number;

    @IsUUID()
    @IsOptional()
    location_id?: string;

    @IsBoolean()
    @IsOptional()
    is_default?: boolean;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean;
}
