import { ApiProperty } from '@nestjs/swagger';

/**
 * Full receipt-detail payload for the modal's 3 sections:
 *   product → receipt (POV) → chain (PO → PFI → Quotation → Lead).
 * Values are raw strings from the SQL join; the FE formats them.
 */

class InventoryReceiptProductDto {
    @ApiProperty({ nullable: true })
    code: string | null;

    @ApiProperty({ nullable: true })
    name: string | null;

    @ApiProperty({ nullable: true })
    category_name: string | null;

    @ApiProperty({ nullable: true })
    uom: string | null;

    @ApiProperty({ nullable: true })
    hsn_code: string | null;
}

class InventoryReceiptReceiptDto {
    @ApiProperty()
    pov_id: string;

    @ApiProperty()
    pov_voucher_no: string;

    @ApiProperty()
    status: string;

    @ApiProperty({ nullable: true })
    dispatch_date: string | null;

    @ApiProperty({ nullable: true })
    actual_arrival_date: string | null;

    @ApiProperty({ nullable: true })
    vendor_name: string | null;

    @ApiProperty({ nullable: true })
    transporter_name: string | null;

    @ApiProperty({ nullable: true })
    vehicle_no: string | null;

    @ApiProperty({ nullable: true })
    lr_no: string | null;

    @ApiProperty({ nullable: true })
    ordered_qty: string | null;

    @ApiProperty({ nullable: true })
    dispatched_qty: string | null;

    @ApiProperty({ nullable: true })
    received_qty: string | null;

    @ApiProperty({ nullable: true })
    short_qty: string | null;

    @ApiProperty({ nullable: true })
    short_reason: string | null;

    @ApiProperty({ nullable: true })
    unit_price: string | null;

    @ApiProperty({ nullable: true })
    line_total: string | null;

    @ApiProperty({ nullable: true })
    currency_code: string | null;
}

class InventoryReceiptChainDto {
    @ApiProperty({ nullable: true })
    po_id: string | null;

    @ApiProperty({ nullable: true })
    po_voucher_no: string | null;

    @ApiProperty({ nullable: true })
    customer_name: string | null;

    @ApiProperty({ nullable: true })
    po_currency_code: string | null;

    @ApiProperty({ nullable: true })
    po_exchange_rate: string | null;

    @ApiProperty({ nullable: true })
    delivery_address: string | null;

    @ApiProperty({ nullable: true })
    pfi_id: string | null;

    @ApiProperty({ nullable: true })
    pfi_voucher_no: string | null;

    @ApiProperty({ nullable: true })
    quotation_id: string | null;

    @ApiProperty({ nullable: true })
    quotation_voucher_no: string | null;

    @ApiProperty({ nullable: true })
    lead_id: string | null;

    @ApiProperty({ nullable: true })
    lead_name: string | null;
}

export class InventoryReceiptDetailResponseDto {
    @ApiProperty({ type: InventoryReceiptProductDto })
    product: InventoryReceiptProductDto;

    @ApiProperty({ type: InventoryReceiptReceiptDto })
    receipt: InventoryReceiptReceiptDto;

    @ApiProperty({ type: InventoryReceiptChainDto })
    chain: InventoryReceiptChainDto;
}
