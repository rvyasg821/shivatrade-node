import { ApiProperty } from '@nestjs/swagger';

export class TrackingEventGetResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;

    @ApiProperty({ required: true, type: String }) po_vendor_id: string;
    @ApiProperty({ required: false, type: String }) po_vendor_voucher_no?: string;
    @ApiProperty({ required: false, type: String }) purchase_order_id?: string;
    @ApiProperty({ required: false, type: String })
    purchase_order_voucher_no?: string;
    @ApiProperty({ required: false, type: String }) vendor_id?: string;
    @ApiProperty({ required: false, type: String }) vendor_name?: string;

    @ApiProperty({ required: true, type: String, format: 'date-time' })
    event_at: string;

    @ApiProperty({ required: true, type: String }) event_type: string;
    @ApiProperty({ required: false, type: String }) event_type_other?: string;
    /** Display label - `event_type_other` when type=`other`, otherwise
     *  the BE-known label for the enum value (FE may still re-label). */
    @ApiProperty({ required: false, type: String }) event_type_label?: string;

    @ApiProperty({ required: false, type: String }) location?: string;
    @ApiProperty({ required: false, type: String }) notes?: string;
    @ApiProperty({ required: false, type: String }) attachment_url?: string;

    @ApiProperty({ required: true, type: Boolean }) is_post_closure: boolean;
    /** True for auto-generated lifecycle events (POV created/dispatched/
     *  received/cancelled/updated). FE shows a "system" badge and hides
     *  the retract icon on these rows. */
    @ApiProperty({ required: true, type: Boolean }) is_system: boolean;

    @ApiProperty({ required: true, type: String }) created_by: string;
    @ApiProperty({ required: false, type: String }) created_by_name?: string;

    /** Option D — true when the event has been retracted. UI strikes
     *  through the row and surfaces the retraction metadata below it. */
    @ApiProperty({ required: true, type: Boolean }) soft_delete: boolean;
    @ApiProperty({ required: false, type: String }) deleted_at?: string;
    @ApiProperty({ required: false, type: String }) deleted_by_user_id?: string;
    @ApiProperty({ required: false, type: String }) deleted_by_name?: string;
    @ApiProperty({ required: false, type: String }) deleted_reason?: string;

    @ApiProperty({ required: false, type: Date }) createdAt?: Date;
    @ApiProperty({ required: false, type: Date }) updatedAt?: Date;
}
