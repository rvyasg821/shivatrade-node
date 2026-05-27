import { IsArray, IsNotEmpty, IsUUID } from 'class-validator';

export class ShippingAttachInvoiceRequestDto {
    @IsArray()
    @IsNotEmpty()
    @IsUUID('all', { each: true })
    invoice_ids: string[];
}
