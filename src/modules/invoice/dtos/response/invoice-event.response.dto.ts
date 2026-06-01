import { ENUM_INVOICE_EVENT_TYPE } from '@modules/invoice/enums/invoice.enum';

export class InvoiceEventResponseDto {
    _id?: string;
    invoice_id?: string;
    type?: ENUM_INVOICE_EVENT_TYPE;
    type_other?: string;
    occurred_at?: Date;
    location?: string;
    notes?: string;
    created_by?: string;
    created_by_name?: string;
    createdAt?: Date;
    attachment_url?: string;
    soft_delete?: boolean;
    deleted_at?: Date;
    deleted_by_user_id?: string;
    deleted_by_name?: string;
    deleted_reason?: string;
}
