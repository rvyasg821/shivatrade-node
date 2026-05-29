import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';

import { ShippingRepository } from '../repository/repositories/shipping.repository';
import { ShippingEventRepository } from '../repository/repositories/shipping-event.repository';
import { ShippingInvoiceRepository } from '../repository/repositories/shipping-invoice.repository';
import { ShippingDoc } from '../repository/entities/shipping.entity';
import {
    ENUM_SHIPPING_EVENT_TYPE,
    ENUM_SHIPPING_MODE,
    ENUM_SHIPPING_STATUS,
    SEA_MODES,
    SHIPPING_STATUS_TRANSITIONS,
    SYSTEM_SHIPPING_EVENT_TYPES,
} from '../enums/shipping.enum';
import { ShippingCreateRequestDto } from '../dtos/request/shipping.create.request.dto';
import { ShippingUpdateRequestDto } from '../dtos/request/shipping.update.request.dto';
import { ShippingTransitionRequestDto } from '../dtos/request/shipping.transition.request.dto';
import { ShippingEventCreateRequestDto } from '../dtos/request/shipping-event.create.request.dto';
import {
    ShippingEventDto,
    ShippingGetResponseDto,
    ShippingInvoiceAttachmentDto,
    ShippingListResponseDto,
} from '../dtos/response/shipping.get.response.dto';

import { VoucherService } from '@common/voucher/services/voucher.service';
import { ENUM_VOUCHER_DOC_TYPE } from '@common/voucher/enums/voucher-doc-type.enum';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import { CompanyBankAccountRepository } from '@modules/company/repository/repositories/company-bank-account.repository';
import { InvoiceRepository } from '@modules/invoice/repository/repositories/invoice.repository';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';

const num = (v: any) =>
    v === null || v === undefined || v === '' ? 0 : Number(v);
const round2 = (n: number) =>
    !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class ShippingService {
    private readonly logger = new Logger(ShippingService.name);

    constructor(
        private readonly shippingRepository: ShippingRepository,
        private readonly shippingEventRepository: ShippingEventRepository,
        private readonly shippingInvoiceRepository: ShippingInvoiceRepository,
        private readonly voucherService: VoucherService,
        private readonly companyRepository: CompanyRepository,
        private readonly companyBankAccountRepository: CompanyBankAccountRepository,
        private readonly invoiceRepository: InvoiceRepository,
        private readonly userRepository: UserRepository
    ) {}

    // ─── Create (DRAFT) ─────────────────────────────────────────────────

    async create(
        companyId: string,
        data: ShippingCreateRequestDto,
        userId: string
    ): Promise<ShippingDoc> {
        this.assertModeValid(data.mode);

        const company: any =
            (await this.companyRepository.findOneById(companyId)) || {};
        const bankAccounts = await this.companyBankAccountRepository.findAll({
            company_id: companyId,
            soft_delete: false,
            is_active: true,
        } as any);
        const defaultBank: any =
            (bankAccounts as any[]).find((b: any) => b.is_default) ||
            (bankAccounts as any[])[0];

        const row = await this.shippingRepository.create({
            company_id: companyId,
            created_by: userId,
            mode: data.mode,
            status: ENUM_SHIPPING_STATUS.DRAFT,
            customer_id: data.customer_id,
            customer_snapshot: (data as any).customer_snapshot,
            consignee_id: data.consignee_id || null,
            consignee_address_id: data.consignee_address_id,
            consignee_snapshot: (data as any).consignee_snapshot,
            notify_party_id: data.notify_party_id,
            notify_party_snapshot: data.notify_party_snapshot,
            forwarder_id: data.forwarder_id,
            bl_awb_no: data.bl_awb_no,
            bl_awb_date: data.bl_awb_date,
            bl_awb_type: data.bl_awb_type || this.defaultBlAwbType(data.mode),
            shipping_bill_no: data.shipping_bill_no,
            shipping_bill_date: data.shipping_bill_date,
            shipping_bill_type: data.shipping_bill_type,
            let_export_order_date: data.let_export_order_date,
            egm_no: data.egm_no,
            egm_date: data.egm_date,
            container_no: data.container_no,
            seal_no: data.seal_no,
            container_type: data.container_type,
            vessel_name: data.vessel_name,
            voyage_no: data.voyage_no,
            flight_no: data.flight_no,
            pre_carriage_by: data.pre_carriage_by,
            place_of_receipt: data.place_of_receipt,
            port_of_loading_id: data.port_of_loading_id,
            port_of_loading_snapshot: data.port_of_loading_snapshot,
            port_of_discharge_id: data.port_of_discharge_id,
            port_of_discharge_snapshot: data.port_of_discharge_snapshot,
            place_of_delivery: data.place_of_delivery,
            country_of_origin: data.country_of_origin || 'India',
            country_of_destination: data.country_of_destination,
            booking_date: data.booking_date,
            gate_in_date: data.gate_in_date,
            etd: data.etd,
            eta: data.eta,
            total_packages: data.total_packages,
            package_type: data.package_type,
            net_weight_kg: data.net_weight_kg,
            gross_weight_kg: data.gross_weight_kg,
            volume_cbm: data.volume_cbm,
            marks_and_nos: data.marks_and_nos,
            marine_insurance_policy_no: data.marine_insurance_policy_no,
            insurance_company: data.insurance_company,
            policy_amount_inr: data.policy_amount_inr,
            freight_charges_inr: data.freight_charges_inr || '0',
            insurance_charges_inr: data.insurance_charges_inr || '0',
            cha_charges_inr: data.cha_charges_inr || '0',
            forwarder_charges_inr: data.forwarder_charges_inr || '0',
            other_charges_inr: data.other_charges_inr || '0',
            iec_code: company.iec || undefined,
            ad_code: defaultBank?.ad_code || undefined,
            notes: data.notes,
            internal_notes: data.internal_notes,
        } as any);

        await this.recompute(row._id.toString());

        // Attach invoices (optional at create).
        if (data.invoice_ids?.length) {
            await this.attachInvoices(
                row._id.toString(),
                companyId,
                data.invoice_ids
            );
        }

        await this.emitSystemEvent(
            row._id.toString(),
            companyId,
            ENUM_SHIPPING_EVENT_TYPE.SHIPPING_CREATED,
            userId,
            `Shipping DRAFT created (${data.mode})`
        );

        this.logger.log(`Shipping DRAFT created: ${row._id}`);
        return this.shippingRepository.findOneById(row._id.toString());
    }

    // ─── Update ─────────────────────────────────────────────────────────

    async update(
        row: ShippingDoc,
        data: ShippingUpdateRequestDto,
        userId: string
    ): Promise<ShippingDoc> {
        if (row.status === ENUM_SHIPPING_STATUS.CANCELLED) {
            throw new BadRequestException('Cancelled shipping cannot be updated.');
        }
        if (row.status === ENUM_SHIPPING_STATUS.DELIVERED) {
            throw new BadRequestException(
                'Delivered shipping is closed for edits.'
            );
        }

        // Mode is locked once booked.
        if (
            row.status !== ENUM_SHIPPING_STATUS.DRAFT &&
            data.mode &&
            data.mode !== row.mode
        ) {
            throw new BadRequestException(
                'Mode cannot be changed after booking.'
            );
        }

        const { invoice_ids: _ignore, ...patch } = data as any;
        Object.assign(row, patch);
        if (data.mode) row.bl_awb_type = this.defaultBlAwbType(data.mode);

        await this.shippingRepository.save(row);
        await this.recompute(row._id.toString());

        await this.emitSystemEvent(
            row._id.toString(),
            row.company_id.toString(),
            ENUM_SHIPPING_EVENT_TYPE.SHIPPING_UPDATED,
            userId,
            `Updated`
        );

        return this.shippingRepository.findOneById(row._id.toString());
    }

    // ─── Status transitions ─────────────────────────────────────────────

    async transitionTo(
        row: ShippingDoc,
        data: ShippingTransitionRequestDto,
        userId: string
    ): Promise<ShippingDoc> {
        const from = row.status as ENUM_SHIPPING_STATUS;
        const to = data.to;
        const allowed = SHIPPING_STATUS_TRANSITIONS[from] || [];
        if (!allowed.includes(to)) {
            throw new BadRequestException(
                `Cannot transition shipping from ${from} to ${to}.`
            );
        }

        // Per-target gates.
        if (to === ENUM_SHIPPING_STATUS.BOOKED) {
            row.booking_date = data.booking_date || row.booking_date;
            if (!row.booking_date) {
                throw new BadRequestException(
                    'booking_date is required to mark booked.'
                );
            }
            // Assign voucher_no at BOOKED.
            const company: any =
                (await this.companyRepository.findOneById(
                    row.company_id.toString()
                )) || {};
            const prefix =
                (company.voucher_prefix || '').toUpperCase().trim() ||
                (company.company_name || 'CO').substring(0, 5).toUpperCase();
            row.voucher_no = await this.voucherService.getNext(
                row.company_id.toString(),
                ENUM_VOUCHER_DOC_TYPE.SHIPPING,
                prefix,
                new Date()
            );
            row.booked_by = userId;
            row.booked_at = new Date();
        }
        if (to === ENUM_SHIPPING_STATUS.DISPATCHED) {
            row.actual_dispatch_date =
                data.actual_dispatch_date || row.actual_dispatch_date;
            if (!row.actual_dispatch_date) {
                throw new BadRequestException(
                    'actual_dispatch_date is required to mark dispatched.'
                );
            }
            if (!row.let_export_order_date) {
                throw new BadRequestException(
                    'let_export_order_date must be set before dispatch.'
                );
            }
        }
        if (to === ENUM_SHIPPING_STATUS.ARRIVED) {
            row.actual_arrival_date =
                data.actual_arrival_date || row.actual_arrival_date;
            if (!row.actual_arrival_date) {
                throw new BadRequestException(
                    'actual_arrival_date is required to mark arrived.'
                );
            }
        }
        if (to === ENUM_SHIPPING_STATUS.CLEARED) {
            row.customs_cleared_date =
                data.customs_cleared_date || row.customs_cleared_date;
            if (!row.customs_cleared_date) {
                throw new BadRequestException(
                    'customs_cleared_date is required to mark cleared.'
                );
            }
        }
        if (to === ENUM_SHIPPING_STATUS.DELIVERED) {
            row.delivered_date = data.delivered_date || row.delivered_date;
            if (!row.delivered_date) {
                throw new BadRequestException(
                    'delivered_date is required to mark delivered.'
                );
            }
        }

        row.status = to;
        await this.shippingRepository.save(row);

        const eventType = this.systemEventForStatus(to);
        if (eventType) {
            await this.emitSystemEvent(
                row._id.toString(),
                row.company_id.toString(),
                eventType,
                userId,
                data.notes || `Transitioned to ${to}`
            );
        }

        this.logger.log(`Shipping ${row._id} → ${to}`);
        return this.shippingRepository.findOneById(row._id.toString());
    }

    private systemEventForStatus(
        status: ENUM_SHIPPING_STATUS
    ): ENUM_SHIPPING_EVENT_TYPE | undefined {
        switch (status) {
            case ENUM_SHIPPING_STATUS.BOOKED:
                return ENUM_SHIPPING_EVENT_TYPE.SHIPPING_BOOKED;
            case ENUM_SHIPPING_STATUS.DISPATCHED:
                return ENUM_SHIPPING_EVENT_TYPE.SHIPPING_DISPATCHED;
            case ENUM_SHIPPING_STATUS.ARRIVED:
                return ENUM_SHIPPING_EVENT_TYPE.SHIPPING_ARRIVED;
            case ENUM_SHIPPING_STATUS.CLEARED:
                return ENUM_SHIPPING_EVENT_TYPE.SHIPPING_CLEARED;
            case ENUM_SHIPPING_STATUS.DELIVERED:
                return ENUM_SHIPPING_EVENT_TYPE.SHIPPING_DELIVERED;
            case ENUM_SHIPPING_STATUS.CANCELLED:
                return ENUM_SHIPPING_EVENT_TYPE.SHIPPING_CANCELLED;
            default:
                return undefined;
        }
    }

    // ─── Cancel ─────────────────────────────────────────────────────────

    async cancel(
        row: ShippingDoc,
        reason: string | undefined,
        userId: string
    ): Promise<ShippingDoc> {
        if (
            row.status === ENUM_SHIPPING_STATUS.DELIVERED ||
            row.status === ENUM_SHIPPING_STATUS.CANCELLED
        ) {
            throw new BadRequestException(
                'Delivered/cancelled shipping cannot be cancelled.'
            );
        }
        row.status = ENUM_SHIPPING_STATUS.CANCELLED;
        row.cancelled_by = userId;
        row.cancelled_at = new Date();
        row.cancelled_reason = reason;
        await this.shippingRepository.save(row);

        await this.emitSystemEvent(
            row._id.toString(),
            row.company_id.toString(),
            ENUM_SHIPPING_EVENT_TYPE.SHIPPING_CANCELLED,
            userId,
            reason || 'Cancelled'
        );

        this.logger.log(`Shipping cancelled: ${row._id}`);
        return row;
    }

    // ─── Find ───────────────────────────────────────────────────────────

    async findOneById(id: string): Promise<ShippingDoc> {
        const row = await this.shippingRepository.findOneById(id);
        if (!row || row.soft_delete) {
            throw new NotFoundException('Shipping not found');
        }
        return row;
    }

    async softDelete(row: ShippingDoc): Promise<ShippingDoc> {
        if (row.status !== ENUM_SHIPPING_STATUS.DRAFT) {
            throw new BadRequestException(
                'Only DRAFT shipping can be deleted; cancel instead.'
            );
        }
        row.soft_delete = true;
        return this.shippingRepository.save(row);
    }

    // ─── Invoice attach / detach ───────────────────────────────────────

    async attachInvoices(
        shippingId: string,
        companyId: string,
        invoiceIds: string[]
    ): Promise<void> {
        // Each invoice can be attached to at most one shipping at a time
        // (DB unique constraint on invoice_id). Reject if any is already
        // attached elsewhere - Phase 1 doesn't reassign.
        const existing = await this.shippingInvoiceRepository.findByInvoiceIds(
            invoiceIds
        );
        for (const r of existing) {
            if (r.shipping_id.toString() !== shippingId) {
                throw new BadRequestException(
                    `Invoice ${r.invoice_id} is already attached to another shipping.`
                );
            }
        }

        for (const invoiceId of invoiceIds) {
            if (existing.find((e) => e.invoice_id.toString() === invoiceId)) {
                continue; // already attached to this shipping
            }
            const inv: any = await this.invoiceRepository.findOneById(invoiceId);
            if (!inv || inv.soft_delete || inv.company_id.toString() !== companyId) {
                throw new BadRequestException(
                    `Invoice ${invoiceId} not found in this company.`
                );
            }

            await this.shippingInvoiceRepository.create({
                shipping_id: shippingId,
                invoice_id: invoiceId,
                company_id: companyId,
                invoice_voucher_no: inv.voucher_no,
                invoice_grand_total: inv.grand_total,
                invoice_currency_code: inv.currency_code,
            } as any);

            // Also write back the shipping_id snapshot onto the invoice.
            inv.shipping_id = shippingId;
            await this.invoiceRepository.save(inv);
        }
    }

    async detachInvoice(invoiceId: string): Promise<void> {
        const link: any =
            await this.shippingInvoiceRepository.findByInvoiceId(invoiceId);
        if (!link) return;
        // The join row is small + identifiable by `invoice_id` unique key -
        // a hard delete is cleaner than soft_delete (which we don't even
        // have on the join entity).
        await (this.shippingInvoiceRepository as any)._repository.delete({
            _id: link._id,
        });
        const inv: any = await this.invoiceRepository.findOneById(invoiceId);
        if (inv) {
            inv.shipping_id = null;
            inv.shipping_voucher_no = null;
            await this.invoiceRepository.save(inv);
        }
    }

    // ─── Manual events ──────────────────────────────────────────────────

    async addEvent(
        row: ShippingDoc,
        data: ShippingEventCreateRequestDto,
        userId: string,
        attachmentUrl?: string
    ): Promise<any> {
        if (SYSTEM_SHIPPING_EVENT_TYPES.includes(data.type)) {
            throw new BadRequestException(
                `Event type ${data.type} is system-emitted and cannot be added manually.`
            );
        }
        if (row.status === ENUM_SHIPPING_STATUS.DRAFT) {
            throw new BadRequestException(
                'Manual events can only be added after BOOKED.'
            );
        }
        const ev = await this.shippingEventRepository.create({
            shipping_id: row._id.toString(),
            company_id: row.company_id.toString(),
            type: data.type,
            type_other: data.type_other,
            occurred_at: new Date(data.occurred_at),
            location: data.location,
            notes: data.notes,
            attachment_url: attachmentUrl,
            is_system: false,
            created_by: userId,
        } as any);
        return ev;
    }

    async retractEvent(
        eventId: string,
        userId: string,
        reason: string
    ): Promise<void> {
        const ev: any = await this.shippingEventRepository.findOneById(eventId);
        if (!ev) throw new NotFoundException('Event not found');
        if (ev.is_system) {
            throw new BadRequestException(
                'System events cannot be retracted.'
            );
        }
        if (ev.soft_delete) {
            throw new BadRequestException('Event is already retracted.');
        }
        if (!reason || !reason.trim()) {
            throw new BadRequestException(
                'A reason is required to retract an event.'
            );
        }
        ev.soft_delete = true;
        ev.deleted_at = new Date();
        ev.deleted_by_user_id = userId;
        ev.deleted_reason = reason.trim();
        await this.shippingEventRepository.save(ev);
    }

    // ─── Recompute totals ──────────────────────────────────────────────

    async recompute(shippingId: string): Promise<void> {
        const row = await this.shippingRepository.findOneById(shippingId);
        if (!row) return;
        const total = round2(
            num(row.freight_charges_inr) +
                num(row.insurance_charges_inr) +
                num(row.cha_charges_inr) +
                num(row.forwarder_charges_inr) +
                num(row.other_charges_inr)
        );
        row.total_cost_inr = String(total);
        await this.shippingRepository.save(row);
    }

    // ─── Validation helpers ────────────────────────────────────────────

    private assertModeValid(mode: ENUM_SHIPPING_MODE): void {
        if (!Object.values(ENUM_SHIPPING_MODE).includes(mode)) {
            throw new BadRequestException(`Unknown shipping mode: ${mode}`);
        }
    }

    private defaultBlAwbType(mode: ENUM_SHIPPING_MODE): string {
        if (SEA_MODES.includes(mode)) return 'BL';
        if (mode === ENUM_SHIPPING_MODE.AIR_COURIER) return 'Courier';
        return 'AWB';
    }

    // ─── System event helper ───────────────────────────────────────────

    private async emitSystemEvent(
        shippingId: string,
        companyId: string,
        type: ENUM_SHIPPING_EVENT_TYPE,
        userId: string,
        notes?: string
    ): Promise<void> {
        try {
            await this.shippingEventRepository.create({
                shipping_id: shippingId,
                company_id: companyId,
                type,
                occurred_at: new Date(),
                notes,
                is_system: true,
                created_by: userId,
            } as any);
        } catch (err: any) {
            // Never let event logging break the parent flow.
            this.logger.warn(
                `Failed to emit shipping event ${type} for ${shippingId}: ${
                    err?.message || err
                }`
            );
        }
    }

    // ─── Mappers ───────────────────────────────────────────────────────

    async mapGet(row: ShippingDoc): Promise<ShippingGetResponseDto> {
        const events = await this.shippingEventRepository.findAllByShippingId(
            row._id.toString()
        );
        const links = await this.shippingInvoiceRepository.findByShippingId(
            row._id.toString()
        );
        const dto = plainToInstance(ShippingGetResponseDto, row);

        // Batch-resolve user names for created_by + deleted_by_user_id so
        // the FE can show "— Logged by …" / "Retracted by …" without a
        // per-row lookup.
        const userIds = Array.from(
            new Set(
                events
                    .flatMap((e: any) => [
                        e.created_by?.toString(),
                        e.deleted_by_user_id?.toString(),
                    ])
                    .filter(Boolean)
            )
        );
        const userNameMap = new Map<string, string>();
        if (userIds.length) {
            const users: any[] = await this.userRepository.findAll({
                _id: { $in: userIds },
            } as any);
            for (const u of users) {
                userNameMap.set(
                    u._id.toString(),
                    u.name || u.contact_name || u.email || ''
                );
            }
        }

        dto.events = events.map((e: any) => {
            const ev: any = plainToInstance(ShippingEventDto, e);
            if (e.created_by) {
                ev.created_by_name = userNameMap.get(e.created_by.toString());
            }
            if (e.deleted_by_user_id) {
                ev.deleted_by_name = userNameMap.get(
                    e.deleted_by_user_id.toString()
                );
            }
            return ev;
        });
        dto.invoices = links.map((l) =>
            plainToInstance(ShippingInvoiceAttachmentDto, l)
        );
        return dto;
    }

    mapList(row: any): ShippingListResponseDto {
        return plainToInstance(ShippingListResponseDto, row);
    }
}
