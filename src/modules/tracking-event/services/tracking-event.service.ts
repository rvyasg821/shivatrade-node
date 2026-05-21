import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';

import { PoVendorTrackingEventRepository } from '../repository/repositories/po-vendor-tracking-event.repository';
import { PoVendorTrackingEventDoc } from '../repository/entities/po-vendor-tracking-event.entity';
import { TrackingEventCreateRequestDto } from '../dtos/request/tracking-event.create.request.dto';
import { TrackingEventGetResponseDto } from '../dtos/response/tracking-event.get.response.dto';
import { ENUM_TRACKING_EVENT_TYPE } from '../enums/tracking-event.enum';

import { PoVendorRepository } from '@modules/po-vendor/repository/repositories/po-vendor.repository';
import { ENUM_PO_VENDOR_STATUS } from '@modules/po-vendor/enums/po-vendor.enum';
import { PurchaseOrderRepository } from '@modules/purchase-order/repository/repositories/purchase-order.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';

/**
 * Human-readable labels for the event-type enum. Tracking plan §5.
 * FE has its own copy in `src/constants/options.js` - keep in sync.
 */
const EVENT_TYPE_LABELS: Record<string, string> = {
    [ENUM_TRACKING_EVENT_TYPE.VEHICLE_LOADED]: 'Vehicle Loaded',
    [ENUM_TRACKING_EVENT_TYPE.LEFT_VENDOR]: 'Left Vendor',
    [ENUM_TRACKING_EVENT_TYPE.IN_TRANSIT_UPDATE]: 'In-transit Update',
    [ENUM_TRACKING_EVENT_TYPE.REACHED_CHECKPOINT]: 'Reached Checkpoint',
    [ENUM_TRACKING_EVENT_TYPE.CUSTOMS_CLEARANCE]: 'Customs / Border Cleared',
    [ENUM_TRACKING_EVENT_TYPE.NEAR_DESTINATION]: 'Near Destination',
    [ENUM_TRACKING_EVENT_TYPE.ARRIVED_DESTINATION]: 'Arrived at Destination',
    [ENUM_TRACKING_EVENT_TYPE.UNLOADING_STARTED]: 'Unloading Started',
    [ENUM_TRACKING_EVENT_TYPE.UNLOADING_COMPLETE]: 'Unloading Complete',
    [ENUM_TRACKING_EVENT_TYPE.DELAY_REPORTED]: 'Delay Reported',
    [ENUM_TRACKING_EVENT_TYPE.DAMAGE_REPORTED]: 'Damage Reported',
    [ENUM_TRACKING_EVENT_TYPE.OTHER]: 'Other',
};

@Injectable()
export class TrackingEventService {
    private readonly logger = new Logger(TrackingEventService.name);

    constructor(
        private readonly trackingEventRepository: PoVendorTrackingEventRepository,
        private readonly povRepository: PoVendorRepository,
        private readonly poRepository: PurchaseOrderRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly userRepository: UserRepository
    ) {}

    // ─── Create (Tracking plan §6, §10) ─────────────────────────────────

    async create(
        companyId: string,
        createdBy: string,
        data: TrackingEventCreateRequestDto,
        attachmentUrl?: string
    ): Promise<PoVendorTrackingEventDoc> {
        // Parent POV must exist, belong to this company, not soft-deleted.
        const pov: any = await this.povRepository.findOne({
            _id: data.po_vendor_id,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!pov) throw new NotFoundException('Parent POV not found');

        // §6 - allowed statuses: dispatched, closed.
        if (
            pov.status !== ENUM_PO_VENDOR_STATUS.DISPATCHED &&
            pov.status !== ENUM_PO_VENDOR_STATUS.CLOSED
        ) {
            if (pov.status === ENUM_PO_VENDOR_STATUS.CANCELLED) {
                throw new BadRequestException(
                    'Cannot add events on cancelled POVs.'
                );
            }
            throw new BadRequestException(
                'Tracking events can only be added after dispatch.'
            );
        }

        if (
            data.event_type === ENUM_TRACKING_EVENT_TYPE.OTHER &&
            !data.event_type_other?.trim()
        ) {
            throw new BadRequestException(
                'event_type_other is required when event_type = other.'
            );
        }

        const row = await this.trackingEventRepository.create({
            company_id: companyId,
            po_vendor_id: data.po_vendor_id,
            event_at: new Date(data.event_at),
            event_type: data.event_type,
            event_type_other: data.event_type_other?.trim() || null,
            location: data.location?.trim() || null,
            notes: data.notes || null,
            attachment_url: attachmentUrl || null,
            is_post_closure: pov.status === ENUM_PO_VENDOR_STATUS.CLOSED,
            created_by: createdBy,
        } as any);

        this.logger.log(
            `Tracking event created: ${row._id} on POV ${data.po_vendor_id} (${data.event_type})`
        );
        return this.trackingEventRepository.findOneById(row._id.toString());
    }

    // ─── Read ───────────────────────────────────────────────────────────

    async listByPov(
        companyId: string,
        povId: string
    ): Promise<PoVendorTrackingEventDoc[]> {
        // Option D: include soft-deleted (retracted) events so the UI
        // can render them with strikethrough + deletion reason.
        return this.trackingEventRepository.findAll(
            {
                company_id: companyId,
                po_vendor_id: povId,
            } as any,
            { order: { event_at: 'DESC' as any } } as any
        );
    }

    /**
     * Cross-POV ops feed. Supports filters per §12.
     * Search matches `location` or `notes`.
     */
    async listFeed(filters: {
        companyId: string;
        poVendorId?: string;
        purchaseOrderId?: string;
        vendorId?: string;
        eventType?: string;
        dateFrom?: string;
        dateTo?: string;
        search?: string;
        page?: number;
        perPage?: number;
    }): Promise<{ rows: PoVendorTrackingEventDoc[]; total: number }> {
        // First narrow POV ids if PO or vendor filter was supplied -
        // tracking_event has no PO/vendor column (only po_vendor_id), so
        // we translate those filters to a po_vendor_id IN(...) clause.
        // Option D: include soft-deleted events; UI strikes them through.
        const where: any = {
            company_id: filters.companyId,
        };

        if (filters.poVendorId) {
            where.po_vendor_id = filters.poVendorId;
        } else if (filters.purchaseOrderId || filters.vendorId) {
            const povWhere: any = {
                company_id: filters.companyId,
                soft_delete: false,
            };
            if (filters.purchaseOrderId)
                povWhere.purchase_order_id = filters.purchaseOrderId;
            if (filters.vendorId) povWhere.vendor_id = filters.vendorId;
            const povs = await this.povRepository.findAll(povWhere);
            const ids = (povs as any[]).map(p => p._id.toString());
            if (!ids.length) return { rows: [], total: 0 };
            where.po_vendor_id = { $in: ids };
        }

        if (filters.eventType) where.event_type = filters.eventType;

        if (filters.dateFrom && filters.dateTo) {
            where.event_at = { $gte: filters.dateFrom, $lte: filters.dateTo };
        } else if (filters.dateFrom) {
            where.event_at = { $gte: filters.dateFrom };
        } else if (filters.dateTo) {
            where.event_at = { $lte: filters.dateTo };
        }

        if (filters.search) {
            where.$or = [
                { location: { $regex: filters.search, $options: 'i' } },
                { notes: { $regex: filters.search, $options: 'i' } },
            ];
        }

        const total = await this.trackingEventRepository.getTotal(where);
        const rows = await this.trackingEventRepository.findAll(where, {
            order: { event_at: 'DESC' as any },
            ...(filters.page && filters.perPage
                ? {
                      skip: (filters.page - 1) * filters.perPage,
                      take: filters.perPage,
                  }
                : {}),
        } as any);
        return { rows, total };
    }

    // ─── Soft delete (Option D — retract with reason) ──────────────────

    /**
     * Mark an event as retracted. The row stays in the DB and is still
     * returned by `listByPov` / `listFeed`, but with `soft_delete=true`
     * + retraction metadata so the UI renders it struck-through with
     * "Retracted by <user>: <reason>". Idempotent — re-retracting a row
     * is a no-op (chain-of-custody requires we don't overwrite the
     * original deleter / reason).
     */
    async softDelete(
        eventId: string,
        companyId: string,
        userId: string,
        reason: string
    ): Promise<PoVendorTrackingEventDoc> {
        if (!reason || !reason.trim()) {
            throw new BadRequestException(
                'A reason is required to retract a tracking event.'
            );
        }
        const row: any = await this.trackingEventRepository.findOne({
            _id: eventId,
            company_id: companyId,
        } as any);
        if (!row) throw new NotFoundException('Tracking event not found');
        if (row.soft_delete) {
            // Already retracted — return as-is. Don't overwrite the
            // original deleter / reason (would destroy the audit trail).
            return row;
        }

        row.soft_delete = true;
        row.deleted_at = new Date();
        row.deleted_by_user_id = userId;
        row.deleted_reason = reason.trim();
        await this.trackingEventRepository.save(row);

        this.logger.log(
            `Tracking event retracted: ${eventId} by ${userId} (${reason.trim()})`
        );
        return this.trackingEventRepository.findOneById(eventId);
    }

    // ─── Hydration ──────────────────────────────────────────────────────

    async mapList(
        rows: PoVendorTrackingEventDoc[]
    ): Promise<TrackingEventGetResponseDto[]> {
        if (!rows.length) return [];

        const povIds = unique(rows.map(r => (r as any).po_vendor_id?.toString()));
        const userIds = unique([
            ...rows.map(r => (r as any).created_by?.toString()),
            ...rows.map(r => (r as any).deleted_by_user_id?.toString()),
        ]);

        const povs = povIds.length
            ? await this.povRepository.findAll({ _id: { $in: povIds } } as any)
            : [];

        const poIds = unique(
            (povs as any[]).map(p => p.purchase_order_id?.toString())
        );
        const vendorIds = unique(
            (povs as any[]).map(p => p.vendor_id?.toString())
        );

        const [pos, vendors, users] = await Promise.all([
            poIds.length
                ? this.poRepository.findAll({ _id: { $in: poIds } } as any)
                : Promise.resolve([] as any[]),
            vendorIds.length
                ? this.vendorRepository.findAll({
                      _id: { $in: vendorIds },
                  } as any)
                : Promise.resolve([] as any[]),
            userIds.length
                ? this.userRepository.findAll({ _id: { $in: userIds } } as any)
                : Promise.resolve([] as any[]),
        ]);

        const povMap = toMap(povs as any[]);
        const poMap = toMap(pos as any[]);
        const vendorMap = toMap(vendors as any[]);
        const userNameMap = new Map<string, string>();
        for (const u of users as any[]) {
            userNameMap.set(u._id.toString(), u.name || u.email || '');
        }

        return (rows as any[]).map(r => {
            const pov: any = r.po_vendor_id
                ? povMap.get(r.po_vendor_id.toString())
                : null;
            const po: any = pov?.purchase_order_id
                ? poMap.get(pov.purchase_order_id.toString())
                : null;
            const vendor: any = pov?.vendor_id
                ? vendorMap.get(pov.vendor_id.toString())
                : null;
            const eventTypeLabel =
                r.event_type === ENUM_TRACKING_EVENT_TYPE.OTHER
                    ? r.event_type_other || 'Other'
                    : EVENT_TYPE_LABELS[r.event_type] || r.event_type;

            return {
                _id: r._id.toString(),
                po_vendor_id: r.po_vendor_id?.toString(),
                po_vendor_voucher_no: pov?.voucher_no,
                purchase_order_id: pov?.purchase_order_id?.toString(),
                purchase_order_voucher_no: po?.voucher_no,
                vendor_id: pov?.vendor_id?.toString(),
                vendor_name: (vendor as any)?.company_name,
                event_at:
                    r.event_at instanceof Date
                        ? r.event_at.toISOString()
                        : r.event_at,
                event_type: r.event_type,
                event_type_other: r.event_type_other || undefined,
                event_type_label: eventTypeLabel,
                location: r.location || undefined,
                notes: r.notes || undefined,
                attachment_url: r.attachment_url || undefined,
                is_post_closure: !!r.is_post_closure,
                created_by: r.created_by?.toString(),
                created_by_name: r.created_by
                    ? userNameMap.get(r.created_by.toString())
                    : undefined,
                soft_delete: !!r.soft_delete,
                deleted_at:
                    r.deleted_at instanceof Date
                        ? r.deleted_at.toISOString()
                        : r.deleted_at || undefined,
                deleted_by_user_id: r.deleted_by_user_id?.toString(),
                deleted_by_name: r.deleted_by_user_id
                    ? userNameMap.get(r.deleted_by_user_id.toString())
                    : undefined,
                deleted_reason: r.deleted_reason || undefined,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
            };
        });
    }

    async mapGet(
        row: PoVendorTrackingEventDoc
    ): Promise<TrackingEventGetResponseDto> {
        const [m] = await this.mapList([row]);
        return m;
    }
}

function unique(arr: (string | undefined)[]): string[] {
    return Array.from(
        new Set(arr.filter((v): v is string => typeof v === 'string' && !!v))
    );
}

function toMap<T extends { _id: any }>(arr: T[]): Map<string, T> {
    const m = new Map<string, T>();
    for (const item of arr) {
        const k = item._id?.toString();
        if (k) m.set(k, item);
    }
    return m;
}
