import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** See PRE_CLOSE_MODULE_PLAN.md — never rewrites ordered_qty/dispatched_qty. */
export class PoVendorPreCloseRequestDto {
    /** Real-world completion date, may be backdated. Defaults to today if omitted. */
    @IsDateString()
    @IsOptional()
    date?: string;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    reason?: string;
}
