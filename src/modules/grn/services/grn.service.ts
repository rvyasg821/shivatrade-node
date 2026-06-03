import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { In } from 'typeorm';
import { GrnRepository } from '../repository/repositories/grn.repository';
import { GrnLineRepository } from '../repository/repositories/grn-line.repository';
import { GrnDoc } from '../repository/entities/grn.entity';
import { ENUM_GRN_STATUS } from '../enums/grn.enum';
import {
    GrnCreateFromPovDto,
    GrnUpdateDto,
} from '../dtos/request/grn.request.dto';
import {
    GrnGetResponseDto,
    GrnListResponseDto,
    GrnSourcePovResponseDto,
    GrnStatsResponseDto,
} from '../dtos/response/grn.response.dto';
import { PoVendorRepository } from '@modules/po-vendor/repository/repositories/po-vendor.repository';
import { PoVendorLineRepository } from '@modules/po-vendor/repository/repositories/po-vendor-line.repository';
import { ENUM_PO_VENDOR_STATUS } from '@modules/po-vendor/enums/po-vendor.enum';
import { PurchaseOrderRepository } from '@modules/purchase-order/repository/repositories/purchase-order.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import { VoucherService } from '@common/voucher/services/voucher.service';
import { ENUM_VOUCHER_DOC_TYPE } from '@common/voucher/enums/voucher-doc-type.enum';
import { PdfService } from '@common/pdf/pdf.service';

const num = (v: any): number =>
    v === null || v === undefined || v === '' ? 0 : Number(v);
const round4 = (n: number): number =>
    !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 10000) / 10000;

@Injectable()
export class GrnService {
    private readonly logger = new Logger(GrnService.name);

    constructor(
        private readonly grnRepository: GrnRepository,
        private readonly grnLineRepository: GrnLineRepository,
        private readonly povRepository: PoVendorRepository,
        private readonly povLineRepository: PoVendorLineRepository,
        private readonly poRepository: PurchaseOrderRepository,
        private readonly productRepository: ProductRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly companyRepository: CompanyRepository,
        private readonly voucherService: VoucherService,
        private readonly pdfService: PdfService
    ) {}

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

    private async getOrThrow(companyId: string, id: string): Promise<GrnDoc> {
        const grn: any = await this.grnRepository.findOne({
            _id: id,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!grn) throw new NotFoundException('GRN not found');
        return grn;
    }

    // ─── Create from a closed POV ────────────────────────────────────────
    async createFromPov(
        companyId: string,
        povId: string,
        dto: GrnCreateFromPovDto,
        createdBy: string
    ): Promise<GrnDoc> {
        const pov: any = await this.povRepository.findOne({
            _id: povId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!pov) throw new NotFoundException('Vendor PO not found');
        if (pov.status !== ENUM_PO_VENDOR_STATUS.CLOSED) {
            throw new BadRequestException(
                'A GRN can only be raised against a received (closed) Vendor PO.'
            );
        }

        // One GRN per POV.
        const existing = await this.grnRepository.findOne({
            po_vendor_id: povId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (existing) {
            throw new BadRequestException(
                'A GRN already exists for this Vendor PO.'
            );
        }

        const povLines = (await this.povLineRepository.findAll({
            po_vendor_id: povId,
        } as any)) as any[];
        const receivedLines = povLines.filter((l) => num(l.received_qty) > 0);
        if (!receivedLines.length) {
            throw new BadRequestException(
                'This Vendor PO has no received quantity to receipt.'
            );
        }

        // Reference-chain snapshot: POV → PO.
        const po: any = pov.purchase_order_id
            ? await this.poRepository.findOneById(
                  pov.purchase_order_id.toString()
              )
            : null;

        const prefix = await this.resolveCompanyPrefix(companyId);
        const voucher_no = await this.voucherService.getNext(
            companyId,
            ENUM_VOUCHER_DOC_TYPE.GRN,
            prefix
        );

        const grn = await this.grnRepository.create({
            company_id: companyId,
            created_by: createdBy,
            voucher_no,
            po_vendor_id: povId,
            po_vendor_voucher_no: pov.voucher_no || null,
            purchase_order_id: pov.purchase_order_id || null,
            purchase_order_voucher_no: po?.voucher_no || null,
            customer_po_number: po?.customer_po_number || null,
            vendor_id: pov.vendor_id || null,
            grn_date:
                dto.grn_date ||
                pov.actual_arrival_date ||
                new Date().toISOString().slice(0, 10),
            notes: dto.notes || null,
            status: ENUM_GRN_STATUS.DRAFT,
        } as any);
        const grnId = grn._id.toString();

        let seq = 0;
        for (const l of receivedLines.sort(
            (a, b) => (a.seq || 0) - (b.seq || 0)
        )) {
            seq += 1;
            const received = round4(num(l.received_qty));
            await this.grnLineRepository.create({
                company_id: companyId,
                grn_id: grnId,
                po_vendor_line_id: l._id?.toString() || null,
                product_id: l.product_id,
                description: l.description || null,
                hsn_code: l.hsn_code || null,
                unit: l.unit || null,
                ordered_qty: String(round4(num(l.ordered_qty))),
                dispatched_qty: String(round4(num(l.dispatched_qty))),
                received_qty: String(received),
                // Default: everything received is accepted; operator adjusts.
                accepted_qty: String(received),
                rejected_qty: '0',
                seq,
            } as any);
        }

        this.logger.log(`GRN ${voucher_no} created from POV ${povId}`);
        return this.grnRepository.findOneById(grnId);
    }

    // ─── Update (quality check + header) ─────────────────────────────────
    async update(
        companyId: string,
        grnId: string,
        dto: GrnUpdateDto
    ): Promise<GrnDoc> {
        const grn: any = await this.getOrThrow(companyId, grnId);
        if (dto.grn_date !== undefined) grn.grn_date = dto.grn_date;
        if (dto.notes !== undefined) grn.notes = dto.notes;
        if (dto.internal_notes !== undefined)
            grn.internal_notes = dto.internal_notes;
        if (dto.status !== undefined) grn.status = dto.status;
        await this.grnRepository.save(grn);

        if (Array.isArray(dto.lines) && dto.lines.length) {
            const lines = await this.grnLineRepository.findByGrnId(grnId);
            const byId = new Map<string, any>(
                lines.map((l: any) => [l._id.toString(), l])
            );
            for (const item of dto.lines) {
                const row = byId.get(item._id);
                if (!row) continue;
                const received = num(row.received_qty);
                let accepted =
                    item.accepted_qty !== undefined
                        ? round4(num(item.accepted_qty))
                        : num(row.accepted_qty);
                let rejected =
                    item.rejected_qty !== undefined
                        ? round4(num(item.rejected_qty))
                        : num(row.rejected_qty);
                if (accepted < 0 || rejected < 0) {
                    throw new BadRequestException(
                        'Accepted / rejected quantities cannot be negative.'
                    );
                }
                if (round4(accepted + rejected) > round4(received)) {
                    throw new BadRequestException(
                        `Accepted + rejected (${accepted + rejected}) exceeds received (${received}) on a line.`
                    );
                }
                row.accepted_qty = String(accepted);
                row.rejected_qty = String(rejected);
                if (item.batch_no !== undefined) row.batch_no = item.batch_no;
                if (item.remarks !== undefined) row.remarks = item.remarks;
                await this.grnLineRepository.save(row);
            }
        }
        return this.grnRepository.findOneById(grnId);
    }

    async softDelete(companyId: string, grnId: string): Promise<void> {
        const grn: any = await this.getOrThrow(companyId, grnId);
        grn.soft_delete = true;
        await this.grnRepository.save(grn);
    }

    // ─── List / count / stats ────────────────────────────────────────────
    buildListFind(
        companyId: string,
        filters: { status?: string | string[]; vendor_id?: string; search?: string }
    ): Record<string, any> {
        const find: any = { soft_delete: false };
        if (companyId) find.company_id = companyId;
        if (filters.vendor_id) find.vendor_id = filters.vendor_id;
        if (filters.status) find.status = filters.status;
        const searchTerm =
            typeof filters.search === 'string' ? filters.search.trim() : '';
        if (searchTerm) {
            find.$or = [
                { voucher_no: { $regex: searchTerm, $options: 'i' } },
                { po_vendor_voucher_no: { $regex: searchTerm, $options: 'i' } },
                {
                    purchase_order_voucher_no: {
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
        filters: { status?: string | string[]; vendor_id?: string; search?: string }
    ): Promise<number> {
        return this.grnRepository.getTotal(
            this.buildListFind(companyId, filters) as any
        );
    }

    async list(
        companyId: string,
        options?: { find?: Record<string, any>; paging?: any; order?: any }
    ): Promise<GrnListResponseDto[]> {
        const find = options?.find || {
            company_id: companyId,
            soft_delete: false,
        };
        const rows = await this.grnRepository.findAll(find as any, {
            paging: options?.paging,
            order: options?.order,
        });
        if (!rows.length) return [];
        const ids = rows.map((r: any) => r._id.toString());
        const vendorIds = Array.from(
            new Set(
                (rows as any[]).map((r) => r.vendor_id?.toString()).filter(Boolean)
            )
        ) as string[];
        const [lines, vendors] = await Promise.all([
            this.grnLineRepository.findAll({
                grn_id: { $in: ids },
                soft_delete: false,
            } as any) as Promise<any[]>,
            vendorIds.length
                ? (this.vendorRepository.findAll({
                      _id: In(vendorIds),
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
        ]);
        const lineCount = new Map<string, number>();
        for (const l of lines)
            lineCount.set(
                l.grn_id.toString(),
                (lineCount.get(l.grn_id.toString()) || 0) + 1
            );
        const vendorById = new Map<string, any>(
            vendors.map((v: any) => [v._id.toString(), v])
        );
        return rows.map((r: any) => {
            const dto = plainToInstance(GrnListResponseDto, r);
            dto.line_count = lineCount.get(r._id.toString()) || 0;
            dto.vendor_name = r.vendor_id
                ? vendorById.get(r.vendor_id.toString())?.company_name
                : undefined;
            return dto;
        });
    }

    async stats(
        companyId: string,
        filters: { status?: string | string[]; vendor_id?: string; search?: string }
    ): Promise<GrnStatsResponseDto> {
        const rows = await this.grnRepository.aggregate<{
            status: string;
            count: string;
        }>((qb) => {
            qb.andWhere('entity.soft_delete = :sd', { sd: false });
            qb.andWhere('entity.company_id = :cid', { cid: companyId });
            if (filters.vendor_id) {
                qb.andWhere('entity.vendor_id = :vid', { vid: filters.vendor_id });
            }
            if (filters.status) {
                if (Array.isArray(filters.status)) {
                    qb.andWhere('entity.status IN (:...st)', {
                        st: filters.status,
                    });
                } else {
                    qb.andWhere('entity.status = :st', { st: filters.status });
                }
            }
            const searchTerm =
                typeof filters.search === 'string' ? filters.search.trim() : '';
            if (searchTerm) {
                qb.andWhere(
                    '(entity.voucher_no ILIKE :q OR entity.po_vendor_voucher_no ILIKE :q OR entity.purchase_order_voucher_no ILIKE :q)',
                    { q: `%${searchTerm}%` }
                );
            }
            return qb
                .select('entity.status', 'status')
                .addSelect('COUNT(*)::int', 'count')
                .groupBy('entity.status');
        });
        const by_status: Record<string, number> = {};
        let total = 0;
        for (const r of rows) {
            const cnt = Number(r.count) || 0;
            by_status[r.status] = cnt;
            total += cnt;
        }
        return { total, by_status };
    }

    // ─── Source-POV picker (closed POVs without a GRN) ───────────────────
    async sourcePovs(companyId: string): Promise<GrnSourcePovResponseDto[]> {
        const povs = (await this.povRepository.findAll({
            company_id: companyId,
            status: ENUM_PO_VENDOR_STATUS.CLOSED,
            soft_delete: false,
        } as any)) as any[];
        if (!povs.length) return [];

        const grns = (await this.grnRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const usedPovIds = new Set(
            grns.map((g) => g.po_vendor_id?.toString()).filter(Boolean)
        );
        const candidates = povs.filter(
            (p) => !usedPovIds.has(p._id.toString())
        );
        if (!candidates.length) return [];

        const povIds = candidates.map((p) => p._id.toString());
        const vendorIds = Array.from(
            new Set(candidates.map((p) => p.vendor_id?.toString()).filter(Boolean))
        ) as string[];
        const poIds = Array.from(
            new Set(
                candidates
                    .map((p) => p.purchase_order_id?.toString())
                    .filter(Boolean)
            )
        ) as string[];
        const [lines, vendors, pos] = await Promise.all([
            this.povLineRepository.findAll({
                po_vendor_id: { $in: povIds },
            } as any) as Promise<any[]>,
            vendorIds.length
                ? (this.vendorRepository.findAll({
                      _id: In(vendorIds),
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
            poIds.length
                ? (this.poRepository.findAll({
                      _id: In(poIds),
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
        ]);
        const lineCount = new Map<string, number>();
        for (const l of lines)
            if (num(l.received_qty) > 0)
                lineCount.set(
                    l.po_vendor_id.toString(),
                    (lineCount.get(l.po_vendor_id.toString()) || 0) + 1
                );
        const vendorById = new Map<string, any>(
            vendors.map((v: any) => [v._id.toString(), v])
        );
        const poById = new Map<string, any>(
            pos.map((p: any) => [p._id.toString(), p])
        );
        return candidates
            .filter((p) => (lineCount.get(p._id.toString()) || 0) > 0)
            .map((p) => ({
                _id: p._id.toString(),
                voucher_no: p.voucher_no,
                vendor_id: p.vendor_id?.toString(),
                vendor_name: p.vendor_id
                    ? vendorById.get(p.vendor_id.toString())?.company_name
                    : undefined,
                purchase_order_voucher_no: p.purchase_order_id
                    ? poById.get(p.purchase_order_id.toString())?.voucher_no
                    : undefined,
                actual_arrival_date: p.actual_arrival_date,
                line_count: lineCount.get(p._id.toString()) || 0,
            }));
    }

    // ─── Map ─────────────────────────────────────────────────────────────
    async mapGet(companyId: string, grnId: string): Promise<GrnGetResponseDto> {
        const grn: any = await this.getOrThrow(companyId, grnId);
        const lines = (await this.grnLineRepository.findByGrnId(grnId)) as any[];

        const productIds = Array.from(
            new Set(lines.map((l) => l.product_id?.toString()).filter(Boolean))
        ) as string[];
        const [products, vendor] = await Promise.all([
            productIds.length
                ? (this.productRepository.findAll({
                      _id: In(productIds),
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
            grn.vendor_id
                ? this.vendorRepository.findOneById(grn.vendor_id.toString())
                : Promise.resolve(null),
        ]);
        const productById = new Map<string, any>(
            products.map((p: any) => [p._id.toString(), p])
        );

        const dto = plainToInstance(GrnGetResponseDto, grn);
        dto.vendor_name = (vendor as any)?.company_name;
        dto.vendor_code = (vendor as any)?.vendor_code;
        dto.lines = lines.map((l) => {
            const prod = l.product_id
                ? productById.get(l.product_id.toString())
                : null;
            return {
                _id: l._id.toString(),
                po_vendor_line_id: l.po_vendor_line_id?.toString(),
                product_id: l.product_id?.toString(),
                product_name: prod?.name,
                product_code: prod?.code,
                description: l.description,
                hsn_code: l.hsn_code,
                unit: l.unit,
                ordered_qty: l.ordered_qty,
                dispatched_qty: l.dispatched_qty,
                received_qty: l.received_qty,
                accepted_qty: l.accepted_qty,
                rejected_qty: l.rejected_qty,
                batch_no: l.batch_no,
                remarks: l.remarks,
                seq: l.seq,
            };
        });
        return dto;
    }

    // ─── PDF ─────────────────────────────────────────────────────────────
    async generatePdf(
        companyId: string,
        grnId: string
    ): Promise<{ buffer: Buffer; filename: string }> {
        const data = await this.mapGet(companyId, grnId);
        const company: any = await this.companyRepository.findOneById(companyId);
        const html = this.renderHtml(data, company);
        const buffer = await this.pdfService.generateFromHtml(html, {
            format: 'A4',
        });
        const safe = (data.voucher_no || grnId).replace(/[^A-Za-z0-9_-]+/g, '_');
        return { buffer, filename: `GRN-${safe}.pdf` };
    }

    private esc(s: any): string {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    private renderHtml(grn: GrnGetResponseDto, company: any): string {
        const rows = grn.lines
            .map(
                (l, i) => `<tr>
                <td>${i + 1}</td>
                <td>${this.esc(l.product_name || l.product_code || '-')}${
                    l.description
                        ? `<br/><small style="color:#666">${this.esc(l.description)}</small>`
                        : ''
                }</td>
                <td>${this.esc(l.hsn_code || '-')}</td>
                <td style="text-align:right">${this.esc(l.received_qty || '0')} ${this.esc(l.unit || '')}</td>
                <td style="text-align:right">${this.esc(l.accepted_qty || '0')}</td>
                <td style="text-align:right">${this.esc(l.rejected_qty || '0')}</td>
                <td>${this.esc(l.batch_no || '')}</td>
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
          .muted{color:#666;}
        </style></head><body>
          <h1>${this.esc(company?.company_name || 'Company')}</h1>
          <div class="muted">Goods Receipt Note</div>
          <div style="margin-top:8px">
            <strong>GRN No:</strong> ${this.esc(grn.voucher_no || '-')} &nbsp;
            <strong>Date:</strong> ${this.esc(grn.grn_date || '-')}<br/>
            <strong>Vendor:</strong> ${this.esc(grn.vendor_name || '-')}<br/>
            <strong>VPO:</strong> ${this.esc(grn.po_vendor_voucher_no || '-')} &nbsp;
            <strong>SO:</strong> ${this.esc(grn.purchase_order_voucher_no || '-')} &nbsp;
            <strong>Customer PO:</strong> ${this.esc(grn.customer_po_number || '-')}
          </div>
          <table>
            <thead><tr>
              <th>#</th><th>Item</th><th>HSN</th><th>Received</th>
              <th>Accepted</th><th>Rejected</th><th>Batch</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          ${grn.notes ? `<p class="muted"><strong>Notes:</strong> ${this.esc(grn.notes)}</p>` : ''}
        </body></html>`;
    }
}
