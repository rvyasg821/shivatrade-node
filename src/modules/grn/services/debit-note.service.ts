import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { In } from 'typeorm';
import { CreatorScopeService } from '@modules/creator-scope/creator-scope.service';
import { getCurrencySymbol } from '@modules/currency/constants/currency.symbols.constant';

import { GrnRepository } from '../repository/repositories/grn.repository';
import { GrnLineRepository } from '../repository/repositories/grn-line.repository';
import { DebitNoteRepository } from '../repository/repositories/debit-note.repository';
import { DebitNoteLineRepository } from '../repository/repositories/debit-note-line.repository';
import { DebitNoteDoc } from '../repository/entities/debit-note.entity';
import { ENUM_GRN_STATUS } from '../enums/grn.enum';
import { ENUM_DEBIT_NOTE_STATUS } from '../enums/debit-note.enum';
import {
    DebitNoteCreateFromGrnDto,
    DebitNoteUpdateDto,
} from '../dtos/request/debit-note.request.dto';
import {
    DebitNoteGetResponseDto,
    DebitNoteListResponseDto,
} from '../dtos/response/debit-note.response.dto';
import { PoVendorRepository } from '@modules/po-vendor/repository/repositories/po-vendor.repository';
import { PoVendorLineRepository } from '@modules/po-vendor/repository/repositories/po-vendor-line.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { CompanySettingsRepository } from '@modules/company-settings/repository/repositories/company-settings.repository';
import { VoucherService } from '@common/voucher/services/voucher.service';
import { ENUM_VOUCHER_DOC_TYPE } from '@common/voucher/enums/voucher-doc-type.enum';
import { PdfService } from '@common/pdf/pdf.service';
import {
    buildPdfLetterhead,
    buildPdfHeaderTemplate,
    buildPdfFooterTemplate,
    loadCompanyLogoDataUri,
} from '@common/pdf/pdf-letterhead.util';
import { PoVendorTrackingEventRepository } from '@modules/tracking-event/repository/repositories/po-vendor-tracking-event.repository';
import { ENUM_TRACKING_EVENT_TYPE } from '@modules/tracking-event/enums/tracking-event.enum';

const num = (v: any): number =>
    v === null || v === undefined || v === '' ? 0 : Number(v);
const round4 = (n: number): number =>
    !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 10000) / 10000;

interface DebitNoteListFilters {
    status?: string | string[];
    vendor_id?: string;
    grn_id?: string;
    po_vendor_id?: string;
    search?: string;
}

/**
 * Debit Note lifecycle — a vendor return for QC-rejected goods, raised against
 * a confirmed GRN. Standalone financial record: it does not mutate the GRN,
 * the POV, or the derived inventory. Lives inside the GRN module.
 */
@Injectable()
export class DebitNoteService {
    private readonly logger = new Logger(DebitNoteService.name);

    constructor(
        private readonly debitNoteRepository: DebitNoteRepository,
        private readonly debitNoteLineRepository: DebitNoteLineRepository,
        private readonly grnRepository: GrnRepository,
        private readonly grnLineRepository: GrnLineRepository,
        private readonly povRepository: PoVendorRepository,
        private readonly povLineRepository: PoVendorLineRepository,
        private readonly productRepository: ProductRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly companyRepository: CompanyRepository,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly companySettingsRepository: CompanySettingsRepository,
        private readonly voucherService: VoucherService,
        private readonly pdfService: PdfService,
        private readonly trackingEventRepository: PoVendorTrackingEventRepository
    ) {}

    /**
     * Emit a system tracking event onto a POV's timeline. Best-effort — a
     * failure here never breaks the Debit Note action that triggered it.
     */
    private async emitPovEvent(
        companyId: string,
        povId: string,
        eventType: ENUM_TRACKING_EVENT_TYPE,
        userId?: string,
        notes?: string
    ): Promise<void> {
        if (!povId || !userId) return;
        try {
            await this.trackingEventRepository.create({
                company_id: companyId,
                po_vendor_id: povId,
                event_at: new Date(),
                event_type: eventType,
                location: null,
                notes: notes || null,
                is_post_closure: false,
                is_system: true,
                created_by: userId,
            } as any);
        } catch (err) {
            this.logger.warn(
                `emitPovEvent(${eventType}) failed for POV ${povId}: ${
                    (err as any)?.message || err
                }`
            );
        }
    }

    private async resolveCompanyPrefix(companyId: string): Promise<string> {
        const company: any = await this.companyRepository.findOneById(companyId);
        const explicit = company?.voucher_prefix?.trim();
        if (explicit) return explicit.toUpperCase();
        return (
            company?.company_name
                ?.replace(/[^A-Za-z0-9]/g, '')
                .slice(0, 5)
                .toUpperCase() || 'CO'
        );
    }

    private async getOrThrow(
        companyId: string,
        id: string
    ): Promise<DebitNoteDoc> {
        const dn: any = await this.debitNoteRepository.findOne({
            _id: id,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!dn) throw new NotFoundException('Debit Note not found');
        return dn;
    }

    // ─── Create from a confirmed GRN ─────────────────────────────────────
    // Seeds one line per GRN line that had rejected_qty > 0. returned_qty
    // defaults to the rejected qty; unit_price defaults to the source POV
    // line price. Per-line overrides may be passed in the DTO.
    async createFromGrn(
        companyId: string,
        grnId: string,
        dto: DebitNoteCreateFromGrnDto,
        createdBy: string
    ): Promise<DebitNoteDoc> {
        const grn: any = await this.grnRepository.findOne({
            _id: grnId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!grn) throw new NotFoundException('GRN not found');
        if (grn.status !== ENUM_GRN_STATUS.CONFIRMED) {
            throw new BadRequestException(
                'A Debit Note can only be raised against a confirmed GRN.'
            );
        }

        // One active Debit Note per GRN.
        const existing = await this.debitNoteRepository.findByGrnId(
            companyId,
            grnId
        );
        if (
            existing.some(
                (d) => d.status !== ENUM_DEBIT_NOTE_STATUS.CANCELLED
            )
        ) {
            throw new BadRequestException(
                'A Debit Note already exists for this GRN.'
            );
        }

        const grnLines = (await this.grnLineRepository.findByGrnId(
            grnId
        )) as any[];
        const rejectedLines = grnLines.filter(
            (l) => round4(num(l.rejected_qty)) > 1e-6
        );
        if (!rejectedLines.length) {
            throw new BadRequestException(
                'This GRN has no rejected quantity to return.'
            );
        }

        // POV for currency + per-line unit prices.
        const pov: any = grn.po_vendor_id
            ? await this.povRepository.findOneById(grn.po_vendor_id.toString())
            : null;
        const povLines = grn.po_vendor_id
            ? ((await this.povLineRepository.findAll({
                  po_vendor_id: grn.po_vendor_id,
              } as any)) as any[])
            : [];
        const povLineById = new Map<string, any>(
            povLines.map((l: any) => [l._id.toString(), l])
        );

        // Products for name / part_no snapshots.
        const productIds = Array.from(
            new Set(
                rejectedLines.map((l) => l.product_id?.toString()).filter(Boolean)
            )
        ) as string[];
        const products = productIds.length
            ? ((await this.productRepository.findAll({
                  _id: In(productIds),
              } as any)) as any[])
            : [];
        const productById = new Map<string, any>(
            products.map((p: any) => [p._id.toString(), p])
        );

        // Per-line overrides keyed by source GRN line id.
        const overrideByGrnLine = new Map(
            (dto.lines || []).map((o) => [o.grn_line_id, o])
        );

        const prefix = await this.resolveCompanyPrefix(companyId);
        const voucher_no = await this.voucherService.getNext(
            companyId,
            ENUM_VOUCHER_DOC_TYPE.DEBIT_NOTE,
            prefix
        );

        // Build line rows first so we can total the header.
        let seq = 0;
        let total = 0;
        const rows: any[] = [];
        for (const gl of rejectedLines.sort(
            (a, b) => (a.seq || 0) - (b.seq || 0)
        )) {
            const ov = overrideByGrnLine.get(gl._id.toString());
            const rejected = round4(num(gl.rejected_qty));
            let returned =
                ov?.returned_qty !== undefined
                    ? round4(num(ov.returned_qty))
                    : rejected;
            if (returned < 0) returned = 0;
            if (returned > rejected + 1e-6) {
                throw new BadRequestException(
                    `Returned qty (${returned}) exceeds rejected (${rejected}) on a line.`
                );
            }
            const povLine = gl.po_vendor_line_id
                ? povLineById.get(gl.po_vendor_line_id.toString())
                : null;
            let unitPrice =
                ov?.unit_price !== undefined
                    ? round4(num(ov.unit_price))
                    : round4(num(povLine?.unit_price));
            if (unitPrice < 0) unitPrice = 0;
            const lineTotal = round4(returned * unitPrice);
            total = round4(total + lineTotal);
            const prod = productById.get(gl.product_id?.toString());
            seq += 1;
            rows.push({
                company_id: companyId,
                grn_line_id: gl._id?.toString() || null,
                po_vendor_line_id: gl.po_vendor_line_id?.toString() || null,
                product_id: gl.product_id,
                description: gl.description || null,
                hsn_code: gl.hsn_code || prod?.hsn_code || null,
                part_no: gl.part_no || prod?.part_no || null,
                unit: gl.unit || null,
                rejected_qty: String(rejected),
                returned_qty: String(returned),
                unit_price: String(unitPrice),
                line_total: String(lineTotal),
                remarks: ov?.remarks || null,
                seq,
            });
        }

        const dn = await this.debitNoteRepository.create({
            company_id: companyId,
            created_by: createdBy,
            voucher_no,
            grn_id: grnId,
            grn_voucher_no: grn.voucher_no || null,
            po_vendor_id: grn.po_vendor_id || null,
            po_vendor_voucher_no: grn.po_vendor_voucher_no || null,
            purchase_order_id: grn.purchase_order_id || null,
            purchase_order_voucher_no: grn.purchase_order_voucher_no || null,
            vendor_id: grn.vendor_id || null,
            dn_date:
                dto.dn_date ||
                grn.grn_date ||
                new Date().toISOString().slice(0, 10),
            currency_code: pov?.currency_code || null,
            exchange_rate: pov?.exchange_rate || null,
            total_amount: String(total),
            notes: dto.notes || null,
            status: ENUM_DEBIT_NOTE_STATUS.DRAFT,
        } as any);
        const dnId = dn._id.toString();

        for (const r of rows) {
            await this.debitNoteLineRepository.create({
                ...r,
                debit_note_id: dnId,
            } as any);
        }

        this.logger.log(`Debit Note ${voucher_no} created from GRN ${grnId}`);
        return this.debitNoteRepository.findOneById(dnId);
    }

    // ─── Update (line edits while draft + status transitions) ────────────
    async update(
        companyId: string,
        dnId: string,
        dto: DebitNoteUpdateDto,
        userId?: string
    ): Promise<DebitNoteDoc> {
        const dn: any = await this.getOrThrow(companyId, dnId);
        if (dn.status === ENUM_DEBIT_NOTE_STATUS.CANCELLED) {
            throw new BadRequestException(
                'A cancelled Debit Note cannot be edited.'
            );
        }

        if (dto.dn_date !== undefined) dn.dn_date = dto.dn_date;
        if (dto.notes !== undefined) dn.notes = dto.notes;

        if (Array.isArray(dto.lines) && dto.lines.length) {
            if (dn.status !== ENUM_DEBIT_NOTE_STATUS.DRAFT) {
                throw new BadRequestException(
                    'Debit Note lines can only be edited while in draft.'
                );
            }
            const lines = await this.debitNoteLineRepository.findByDebitNoteId(
                dnId
            );
            const byId = new Map<string, any>(
                lines.map((l: any) => [l._id.toString(), l])
            );
            for (const item of dto.lines) {
                const row = byId.get(item._id);
                if (!row) continue;
                const rejected = round4(num(row.rejected_qty));
                const returned =
                    item.returned_qty !== undefined
                        ? round4(num(item.returned_qty))
                        : round4(num(row.returned_qty));
                if (returned < 0) {
                    throw new BadRequestException(
                        'Returned quantity cannot be negative.'
                    );
                }
                if (returned > rejected + 1e-6) {
                    throw new BadRequestException(
                        `Returned qty (${returned}) exceeds rejected (${rejected}) on a line.`
                    );
                }
                const unitPrice =
                    item.unit_price !== undefined
                        ? round4(num(item.unit_price))
                        : round4(num(row.unit_price));
                if (unitPrice < 0) {
                    throw new BadRequestException(
                        'Unit price cannot be negative.'
                    );
                }
                row.returned_qty = String(returned);
                row.unit_price = String(unitPrice);
                row.line_total = String(round4(returned * unitPrice));
                if (item.remarks !== undefined) row.remarks = item.remarks;
                await this.debitNoteLineRepository.save(row);
            }
        }

        // Recompute the header total from the (possibly edited) lines.
        const allLines = await this.debitNoteLineRepository.findByDebitNoteId(
            dnId
        );
        dn.total_amount = String(
            round4(allLines.reduce((s, l: any) => s + num(l.line_total), 0))
        );

        // Status transition: draft → issued / cancelled, issued → cancelled.
        if (dto.status !== undefined && dto.status !== dn.status) {
            const from = dn.status;
            const ok =
                (from === ENUM_DEBIT_NOTE_STATUS.DRAFT &&
                    (dto.status === ENUM_DEBIT_NOTE_STATUS.ISSUED ||
                        dto.status === ENUM_DEBIT_NOTE_STATUS.CANCELLED)) ||
                (from === ENUM_DEBIT_NOTE_STATUS.ISSUED &&
                    dto.status === ENUM_DEBIT_NOTE_STATUS.CANCELLED);
            if (!ok) {
                throw new BadRequestException(
                    `Cannot change Debit Note status from ${from} to ${dto.status}.`
                );
            }
            dn.status = dto.status;

            // Surface the Debit Note lifecycle change on the POV timeline.
            const povId = dn.po_vendor_id?.toString();
            const cur = dn.currency_code ? ` ${dn.currency_code}` : '';
            if (dto.status === ENUM_DEBIT_NOTE_STATUS.ISSUED) {
                const totalQty = round4(
                    allLines.reduce((s, l: any) => s + num(l.returned_qty), 0)
                );
                await this.emitPovEvent(
                    companyId,
                    povId,
                    ENUM_TRACKING_EVENT_TYPE.DEBIT_NOTE_ISSUED,
                    userId,
                    `Debit Note ${dn.voucher_no || dnId} issued — returned ${totalQty}, amount ${dn.total_amount}${cur}.`
                );
            } else if (dto.status === ENUM_DEBIT_NOTE_STATUS.CANCELLED) {
                await this.emitPovEvent(
                    companyId,
                    povId,
                    ENUM_TRACKING_EVENT_TYPE.DEBIT_NOTE_CANCELLED,
                    userId,
                    `Debit Note ${dn.voucher_no || dnId} cancelled.`
                );
            }
        }

        await this.debitNoteRepository.save(dn);
        return this.debitNoteRepository.findOneById(dnId);
    }

    async softDelete(companyId: string, dnId: string): Promise<void> {
        const dn: any = await this.getOrThrow(companyId, dnId);
        dn.soft_delete = true;
        await this.debitNoteRepository.save(dn);
    }

    /**
     * Delete policy: a Debit Note is the end of the chain (nothing references
     * it), so only the draft rule applies — a confirmed DN must be cancelled;
     * a DRAFT is HARD-deleted with its lines.
     */
    async deleteWithGuard(companyId: string, dnId: string): Promise<void> {
        const dn: any = await this.getOrThrow(companyId, dnId);
        if (dn.status !== ENUM_DEBIT_NOTE_STATUS.DRAFT) {
            throw new BadRequestException(
                'Only a draft Debit Note can be deleted. Cancel it instead.'
            );
        }
        await this.debitNoteLineRepository.deleteMany({
            debit_note_id: dnId,
        } as any);
        await this.debitNoteRepository.delete({ _id: dnId } as any);
    }

    /**
     * Bulk delete: loop the guarded single-delete per id, collecting which were
     * deleted and which were skipped (with the guard's own reason). Never
     * bypasses `deleteWithGuard`.
     */
    async deleteMany(
        companyId: string,
        ids: string[],
        deletedBy?: string
    ): Promise<{
        deleted: string[];
        skipped: Array<{ id: string; reason: string }>;
    }> {
        const deleted: string[] = [];
        const skipped: Array<{ id: string; reason: string }> = [];
        for (const id of ids) {
            try {
                await this.deleteWithGuard(companyId, id);
                deleted.push(id);
            } catch (e: any) {
                skipped.push({ id, reason: e?.message || 'Cannot delete' });
            }
        }
        return { deleted, skipped };
    }

    // ─── Read ────────────────────────────────────────────────────────────
    async mapGet(
        companyId: string,
        dnId: string
    ): Promise<DebitNoteGetResponseDto> {
        const dn: any = await this.getOrThrow(companyId, dnId);
        const lines = (await this.debitNoteLineRepository.findByDebitNoteId(
            dnId
        )) as any[];

        const productIds = Array.from(
            new Set(lines.map((l) => l.product_id?.toString()).filter(Boolean))
        ) as string[];
        const [products, vendor] = await Promise.all([
            productIds.length
                ? (this.productRepository.findAll({
                      _id: In(productIds),
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
            dn.vendor_id
                ? this.vendorRepository.findOneById(dn.vendor_id.toString())
                : Promise.resolve(null),
        ]);
        const productById = new Map<string, any>(
            products.map((p: any) => [p._id.toString(), p])
        );

        const dto = plainToInstance(DebitNoteGetResponseDto, dn);
        dto.vendor_name = (vendor as any)?.company_name;
        dto.vendor_code = (vendor as any)?.vendor_code;
        dto.lines = lines.map((l) => {
            const prod = l.product_id
                ? productById.get(l.product_id.toString())
                : null;
            return {
                _id: l._id.toString(),
                grn_line_id: l.grn_line_id?.toString(),
                po_vendor_line_id: l.po_vendor_line_id?.toString(),
                product_id: l.product_id?.toString(),
                product_name: prod?.name,
                product_code: prod?.code,
                description: l.description,
                hsn_code: l.hsn_code || prod?.hsn_code,
                part_no: l.part_no || prod?.part_no,
                unit: l.unit,
                rejected_qty: l.rejected_qty,
                returned_qty: l.returned_qty,
                unit_price: l.unit_price,
                line_total: l.line_total,
                remarks: l.remarks,
                seq: l.seq,
            };
        });
        return dto;
    }

    buildListFind(
        companyId: string,
        filters: DebitNoteListFilters
    ): Record<string, any> {
        const find: any = { soft_delete: false };
        if (companyId) find.company_id = companyId;
        if (filters.vendor_id) find.vendor_id = filters.vendor_id;
        if (filters.grn_id) find.grn_id = filters.grn_id;
        if (filters.po_vendor_id) find.po_vendor_id = filters.po_vendor_id;
        if (filters.status) find.status = filters.status;
        const searchTerm =
            typeof filters.search === 'string' ? filters.search.trim() : '';
        if (searchTerm) {
            find.$or = [
                { voucher_no: { $regex: searchTerm, $options: 'i' } },
                { grn_voucher_no: { $regex: searchTerm, $options: 'i' } },
                {
                    po_vendor_voucher_no: {
                        $regex: searchTerm,
                        $options: 'i',
                    },
                },
            ];
        }
        return find;
    }

    async count(
        companyId: string,
        filters: DebitNoteListFilters,
        creator?: undefined | string | string[]
    ): Promise<number> {
        return this.debitNoteRepository.getTotal({
            ...this.buildListFind(companyId, filters),
            ...CreatorScopeService.toFind(creator),
        } as any);
    }

    async list(
        companyId: string,
        options?: { find?: Record<string, any>; paging?: any; order?: any }
    ): Promise<DebitNoteListResponseDto[]> {
        const find = options?.find || {
            company_id: companyId,
            soft_delete: false,
        };
        const rows = await this.debitNoteRepository.findAll(find as any, {
            paging: options?.paging,
            order: options?.order,
        });
        if (!rows.length) return [];
        const ids = rows.map((r: any) => r._id.toString());
        const vendorIds = Array.from(
            new Set(
                (rows as any[])
                    .map((r) => r.vendor_id?.toString())
                    .filter(Boolean)
            )
        ) as string[];
        const [lines, vendors] = await Promise.all([
            this.debitNoteLineRepository.findAll({
                debit_note_id: { $in: ids },
                soft_delete: false,
            } as any) as Promise<any[]>,
            vendorIds.length
                ? (this.vendorRepository.findAll({
                      _id: In(vendorIds),
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
        ]);
        const lineCount = new Map<string, number>();
        const qtyByDn = new Map<string, number>();
        const priceSetByDn = new Map<string, Set<number>>();
        for (const l of lines) {
            const k = l.debit_note_id.toString();
            lineCount.set(k, (lineCount.get(k) || 0) + 1);
            qtyByDn.set(k, (qtyByDn.get(k) || 0) + num(l.returned_qty));
            const ps = priceSetByDn.get(k) || new Set<number>();
            ps.add(round4(num(l.unit_price)));
            priceSetByDn.set(k, ps);
        }
        const vendorById = new Map<string, any>(
            (vendors as any[]).map((v) => [v._id.toString(), v])
        );
        return (rows as any[]).map((r) => ({
            _id: r._id.toString(),
            voucher_no: r.voucher_no,
            grn_voucher_no: r.grn_voucher_no,
            po_vendor_voucher_no: r.po_vendor_voucher_no,
            vendor_id: r.vendor_id?.toString(),
            vendor_name: r.vendor_id
                ? vendorById.get(r.vendor_id.toString())?.company_name
                : undefined,
            dn_date: r.dn_date,
            currency_code: r.currency_code,
            exchange_rate: r.exchange_rate,
            total_amount: r.total_amount,
            status: r.status,
            line_count: lineCount.get(r._id.toString()) || 0,
            total_qty: String(round4(qtyByDn.get(r._id.toString()) || 0)),
            unit_price:
                priceSetByDn.get(r._id.toString())?.size === 1
                    ? String([...priceSetByDn.get(r._id.toString())][0])
                    : null,
            createdAt: r.createdAt,
        }));
    }

    /** Debit Notes raised against a given GRN (for the GRN detail / POV tab). */
    async listByGrn(
        companyId: string,
        grnId: string
    ): Promise<DebitNoteListResponseDto[]> {
        const find = this.buildListFind(companyId, { grn_id: grnId });
        return this.list(companyId, { find });
    }

    // ─── PDF ─────────────────────────────────────────────────────────────
    async generatePdf(
        companyId: string,
        dnId: string
    ): Promise<{ buffer: Buffer; filename: string }> {
        const data = await this.mapGet(companyId, dnId);
        const company: any = await this.companyRepository.findOneById(companyId);

        // Letterhead logo — from company-settings (same source as the other
        // sales/purchase PDFs), falling back to the bundled brand logo.
        let logoDataUri = '';
        try {
            const settingsRows: any[] =
                await this.companySettingsRepository.findAll({
                    company_id: companyId,
                } as any);
            const setting =
                (settingsRows || []).find((r) => !r.location_id) ||
                (settingsRows || [])[0];
            logoDataUri = loadCompanyLogoDataUri(setting?.logo_url);
        } catch {
            logoDataUri = loadCompanyLogoDataUri();
        }

        // GSTIN — prefer the corporate address, fall back to tax number.
        let gstin = company?.tax_number || '';
        try {
            const addresses =
                await this.companyAddressRepository.findByCompanyId(companyId);
            const corp: any =
                (addresses || []).find(
                    (a: any) => a.type === 'corporate' && a.is_default
                ) ||
                (addresses || []).find((a: any) => a.type === 'corporate') ||
                (addresses || []).find((a: any) => a.is_default) ||
                (addresses || [])[0];
            gstin = corp?.gstin || company?.tax_number || '';
        } catch {
            /* graceful */
        }

        const idLine = [
            gstin ? `GSTIN: ${gstin}` : '',
            company?.pan ? `PAN: ${company.pan}` : '',
            company?.cin ? `CIN: ${company.cin}` : '',
            company?.iec ? `IEC: ${company.iec}` : '',
            company?.website || '',
        ]
            .filter(Boolean)
            .join('  ·  ');

        const html = this.renderHtml(data, company, logoDataUri);
        const buffer = await this.pdfService.generateFromHtml(html, {
            format: 'A4',
            margin: {
                top: '18mm',
                right: '12mm',
                bottom: '18mm',
                left: '12mm',
            },
            displayHeaderFooter: true,
            headerTemplate: buildPdfHeaderTemplate({
                companyName: company?.company_name,
                docLabel: 'DEBIT NOTE',
                voucherNo: data.voucher_no,
            }),
            footerTemplate: buildPdfFooterTemplate({
                voucherNo: data.voucher_no,
                addressLine: company?.footer_address || '',
                idLine,
            }),
        });
        const safe = (data.voucher_no || dnId).replace(/[^A-Za-z0-9_-]+/g, '_');
        return { buffer, filename: `DN-${safe}.pdf` };
    }

    /** Generate the PDF from the DN id alone — resolves the company from the
     *  Debit Note row. Used by the no-auth public ticket route (new-tab open). */
    async generatePdfById(
        dnId: string
    ): Promise<{ buffer: Buffer; filename: string }> {
        const row: any = await this.debitNoteRepository.findOneById(dnId);
        if (!row) throw new NotFoundException('Debit Note not found');
        return this.generatePdf(row.company_id.toString(), dnId);
    }

    private esc(s: any): string {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    private renderHtml(
        dn: DebitNoteGetResponseDto,
        company: any,
        logoDataUri = ''
    ): string {
        // Shared letterhead — logo + company identity in the header; address
        // + tax IDs print in the footer (via the running footer template).
        const letterhead = buildPdfLetterhead(
            {
                logoDataUri,
                name: company?.company_name,
                phone: company?.mobile,
                email: company?.email,
            },
            {
                title: 'Debit Note',
                voucherNo: dn.voucher_no || '-',
                statusBadge: (dn as any).status || '',
            }
        );
        const cur = dn.currency_code ? ` ${this.esc(dn.currency_code)}` : '';
        const money = (v: any): string => {
            const n = Number(v);
            return (isFinite(n) ? n : 0).toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            });
        };
        // Amounts are stored NATIVE in the POV's own currency (the return is
        // settled in that currency), so render each amount AS-IS with the POV
        // currency symbol — no INR conversion.
        const dnSym = getCurrencySymbol(dn.currency_code || 'INR') || '₹';
        const moneyCcy = (v: any): string => `${dnSym}${money(v)}`;
        const rows = (dn.lines || [])
            .map(
                (l, i) => `<tr>
                <td>${i + 1}</td>
                <td>${this.esc(l.product_name || l.product_code || '-')}${
                    l.description
                        ? `<br/><small style="color:#666">${this.esc(l.description)}</small>`
                        : ''
                }</td>
                <td>${this.esc(l.part_no || '-')}</td>
                <td>${this.esc(l.hsn_code || '-')}</td>
                <td style="text-align:right">${money(l.returned_qty)} ${this.esc(l.unit || '')}</td>
                <td style="text-align:right">${moneyCcy(l.unit_price)}</td>
                <td style="text-align:right">${moneyCcy(l.line_total)}</td>
                <td>${this.esc(l.remarks || '')}</td>
            </tr>`
            )
            .join('');
        return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#222;}
          h1{font-size:18px;color:#09418B;margin:0 0 2px;}
          table{width:100%;border-collapse:collapse;margin-top:10px;}
          th,td{border:1px solid #ccc;padding:6px;text-align:left;vertical-align:top;}
          th{background:#f4f5f7;}
          tfoot td{font-weight:bold;}
          .muted{color:#666;}
        </style></head><body>
          ${letterhead}
          <div class="muted" style="margin-bottom:4px">Vendor Return</div>
          <div style="margin-top:8px">
            <strong>Debit Note No:</strong> ${this.esc(dn.voucher_no || '-')} &nbsp;
            <strong>Date:</strong> ${this.esc(dn.dn_date || '-')}<br/>
            <strong>Vendor:</strong> ${this.esc(dn.vendor_name || '-')}<br/>
            <strong>GRN:</strong> ${this.esc(dn.grn_voucher_no || '-')} &nbsp;
            <strong>VPO:</strong> ${this.esc(dn.po_vendor_voucher_no || '-')} &nbsp;
            <strong>SO:</strong> ${this.esc(dn.purchase_order_voucher_no || '-')}
          </div>
          <table>
            <thead><tr>
              <th>#</th><th>Item</th><th>Part No</th><th>HSN</th>
              <th>Return Qty</th><th>Unit Price</th><th>Amount</th><th>Remarks</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr>
              <td colspan="6" style="text-align:right">Total${cur}</td>
              <td style="text-align:right">${moneyCcy(dn.total_amount)}</td>
              <td></td>
            </tr></tfoot>
          </table>
          ${dn.notes ? `<p class="muted"><strong>Notes:</strong> ${this.esc(dn.notes)}</p>` : ''}
        </body></html>`;
    }
}
