import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** See PRE_CLOSE_MODULE_PLAN.md — never rewrites purchase_order_line.qty. */
export class PurchaseOrderPreCloseRequestDto {
    /** Real-world completion date, may be backdated. Defaults to today if omitted. */
    @IsDateString()
    @IsOptional()
    date?: string;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    reason?: string;
}
