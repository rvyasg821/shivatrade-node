import { Type } from 'class-transformer';
import { IsArray, IsString, IsNumber, ValidateNested, Min, Max } from 'class-validator';

export class PlanDisplayOrderItemDto {
    @IsString()
    id: string;

    @IsNumber()
    @Min(0)
    @Max(999)
    order: number;
}

export class PlanUpdateDisplayOrderRequestDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PlanDisplayOrderItemDto)
    plans: PlanDisplayOrderItemDto[];
}