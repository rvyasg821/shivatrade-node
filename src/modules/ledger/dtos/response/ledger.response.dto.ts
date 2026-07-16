import { ApiProperty } from '@nestjs/swagger';

export class LedgerRowDto {
    @ApiProperty({ type: String }) date: string;
    /** invoice | receipt | bill | payment | adjustment */
    @ApiProperty({ type: String }) type: string;
    @ApiProperty({ type: String }) particulars: string;
    @ApiProperty({ required: false, type: String }) voucher_no?: string;
    @ApiProperty({ type: Number }) dr: number;
    @ApiProperty({ type: Number }) cr: number;
    /** Running balance after this row (customer: ΣDR−ΣCR; vendor: ΣCR−ΣDR). */
    @ApiProperty({ type: Number }) balance: number;
}

export class LedgerResponseDto {
    @ApiProperty({ type: String }) party_type: string;
    @ApiProperty({ type: String }) party_id: string;
    @ApiProperty({ required: false, type: String }) party_name?: string;
    @ApiProperty({ type: String }) currency_code: string;
    @ApiProperty({ type: [LedgerRowDto] }) rows: LedgerRowDto[];
    @ApiProperty({ type: Number }) total_dr: number;
    @ApiProperty({ type: Number }) total_cr: number;
    @ApiProperty({ type: Number }) balance: number;
}
