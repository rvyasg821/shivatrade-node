import { IsInt, IsNotEmpty, Min, Max, IsUUID, IsOptional } from 'class-validator';

export class ImportUkHolidaysRequestDto {
    @IsInt()
    @Min(2000)
    @Max(2100)
    @IsNotEmpty()
    year: number;

    @IsUUID()
    @IsOptional()
    calendar_id?: string; // If provided, import into existing calendar; else create new
}
