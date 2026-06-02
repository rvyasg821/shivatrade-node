import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { In } from 'typeorm';
import { RfqRepository } from '../repository/repositories/rfq.repository';
import { RfqLineRepository } from '../repository/repositories/rfq-line.repository';
import { RfqVendorRepository } from '../repository/repositories/rfq-vendor.repository';
import { RfqVendorPriceRepository } from '../repository/repositories/rfq-vendor-price.repository';
import { RfqDoc } from '../repository/entities/rfq.entity';
import { ENUM_RFQ_STATUS, ENUM_RFQ_VENDOR_STATUS } from '../enums/rfq.enum';
import {
    RfqAddVendorsDto,
    RfqCreateFromLeadDto,
    RfqSelectPriceDto,
    RfqSetPricesDto,
    RfqUpdateDto,
} from '../dtos/request/rfq.request.dto';
import {
    RfqGetResponseDto,
    RfqListResponseDto,
} from '../dtos/response/rfq.response.dto';
import { LeadRepository } from '@modules/lead/repository/repositories/lead.repository';
import { LeadLineRepository } from '@modules/lead/repository/repositories/lead-line.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import { PriceListRepository } from '@modules/price-list/repository/repositories/price-list.repository';
import { VoucherService } from '@common/voucher/services/voucher.service';
import { ENUM_VOUCHER_DOC_TYPE } from '@common/voucher/enums/voucher-doc-type.enum';
import { PdfService } from '@common/pdf/pdf.service';

@Injectable()
export class RfqService {
    private readonly logger = new Logger(RfqService.name);

    constructor(
        private readonly rfqRepository: RfqRepository,
        private readonly rfqLineRepository: RfqLineRepository,
        private readonly rfqVendorRepository: RfqVendorRepository,
        private readonly rfqVendorPriceRepository: RfqVendorPriceRepository,
        private readonly leadRepository: LeadRepository,
        private readonly leadLineRepository: LeadLineRepository,
        private readonly productRepository: ProductRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly companyRepository: CompanyRepository,
        private readonly priceListRepository: PriceListRepository,
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

    private async getOrThrow(companyId: string, id: string): Promise<RfqDoc> {
        const rfq: any = await this.rfqRepository.findOne({
            _id: id,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!rfq) throw new NotFoundException('RFQ not found');
        return rfq;
    }

    // ─── Create from Lead ────────────────────────────────────────────────
    async createFromLead(
        companyId: string,
        leadId: string,
        dto: RfqCreateFromLeadDto,
        createdBy: string
    ): Promise<RfqDoc> {
        const lead: any = await this.leadRepository.findOne({
            _id: leadId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!lead) throw new NotFoundException('Lead not found');

        const leadLines = await this.leadLineRepository.findByLeadId(leadId);
        if (!leadLines.length) {
            throw new BadRequestException(
                'Lead has no requirement items to source.'
            );
        }

        const prefix = await this.resolveCompanyPrefix(companyId);
        const voucher_no = await this.voucherService.getNext(
            companyId,
            ENUM_VOUCHER_DOC_TYPE.RFQ,
            prefix
        );

        const rfq = await this.rfqRepository.create({
            company_id: companyId,
            voucher_no,
            lead_id: leadId,
            lead_voucher_no: lead.voucher_no || null,
            rfq_date: dto.rfq_date || new Date().toISOString().slice(0, 10),
            notes: dto.notes || null,
            status: ENUM_RFQ_STATUS.DRAFT,
            created_by: createdBy,
        } as any);
        const rfqId = rfq._id.toString();

        let seq = 0;
        for (const l of leadLines as any[]) {
            seq += 1;
            await this.rfqLineRepository.create({
                company_id: companyId,
                rfq_id: rfqId,
                product_id: l.product_id || null,
                lead_line_id: l._id?.toString() || null,
                description: l.description || null,
                customer_reference: l.customer_reference || null,
                qty: l.qty != null ? String(l.qty) : '0',
                unit: l.unit || null,
                hs_code: l.hs_code || null,
                seq,
            } as any);
        }

        if (Array.isArray(dto.vendor_ids) && dto.vendor_ids.length) {
            await this.addVendors(companyId, rfqId, {
                vendor_ids: dto.vendor_ids,
            });
        }

        this.logger.log(`RFQ created from lead ${leadId}: ${rfqId} (${voucher_no})`);
        return this.rfqRepository.findOneById(rfqId);
    }

    // ─── Vendors ─────────────────────────────────────────────────────────
    async addVendors(
        companyId: string,
        rfqId: string,
        dto: RfqAddVendorsDto
    ): Promise<void> {
        await this.getOrThrow(companyId, rfqId);
        const existing = await this.rfqVendorRepository.findByRfqId(rfqId);
        const existingIds = new Set(
            existing.map((v: any) => v.vendor_id?.toString())
        );
        const lines = await this.rfqLineRepository.findByRfqId(rfqId);
        for (const vendorId of dto.vendor_ids || []) {
            if (existingIds.has(vendorId)) continue;
            await this.rfqVendorRepository.create({
                company_id: companyId,
                rfq_id: rfqId,
                vendor_id: vendorId,
                status: ENUM_RFQ_VENDOR_STATUS.INVITED,
            } as any);
            // Pre-fill this vendor's grid cells from the price list (their last
            // known price per product) as a starting reference for the quote.
            for (const l of lines as any[]) {
                if (!l.product_id) continue;
                const pl: any = await this.priceListRepository.findCurrentPrice(
                    companyId,
                    vendorId,
                    l.product_id.toString()
                );
                if (!pl) continue;
                await this.rfqVendorPriceRepository.create({
                    company_id: companyId,
                    rfq_id: rfqId,
                    rfq_line_id: l._id.toString(),
                    vendor_id: vendorId,
                    unit_price: String(pl.unit_price ?? '0'),
                    lead_time_days: pl.lead_time_days ?? null,
                    moq: pl.moq ?? null,
                    is_selected: false,
                } as any);
            }
        }
    }

    async removeVendor(
        companyId: string,
        rfqId: string,
        vendorId: string
    ): Promise<void> {
        await this.getOrThrow(companyId, rfqId);
        const rows = await this.rfqVendorRepository.findByRfqId(rfqId);
        const row: any = rows.find(
            (v: any) => v.vendor_id?.toString() === vendorId
        );
        if (row) {
            row.soft_delete = true;
            await this.rfqVendorRepository.save(row);
        }
        // Drop this vendor's prices too.
        const prices = await this.rfqVendorPriceRepository.findByRfqId(rfqId);
        for (const p of prices as any[]) {
            if (p.vendor_id?.toString() === vendorId) {
                p.soft_delete = true;
                await this.rfqVendorPriceRepository.save(p);
            }
        }
    }

    // ─── Prices (comparison grid) ────────────────────────────────────────
    async setPrices(
        companyId: string,
        rfqId: string,
        dto: RfqSetPricesDto
    ): Promise<void> {
        await this.getOrThrow(companyId, rfqId);
        const existing = await this.rfqVendorPriceRepository.findByRfqId(rfqId);
        const byKey = new Map<string, any>();
        for (const p of existing as any[]) {
            byKey.set(`${p.rfq_line_id}|${p.vendor_id}`, p);
        }
        const touchedVendors = new Set<string>();
        for (const item of dto.prices || []) {
            const key = `${item.rfq_line_id}|${item.vendor_id}`;
            touchedVendors.add(item.vendor_id);
            const row = byKey.get(key);
            if (row) {
                row.unit_price = String(item.unit_price);
                row.currency_code = item.currency_code || row.currency_code;
                row.lead_time_days = item.lead_time_days ?? row.lead_time_days;
                row.moq = item.moq ?? row.moq;
                row.notes = item.notes ?? row.notes;
                await this.rfqVendorPriceRepository.save(row);
            } else {
                await this.rfqVendorPriceRepository.create({
                    company_id: companyId,
                    rfq_id: rfqId,
                    rfq_line_id: item.rfq_line_id,
                    vendor_id: item.vendor_id,
                    unit_price: String(item.unit_price),
                    currency_code: item.currency_code || null,
                    lead_time_days: item.lead_time_days ?? null,
                    moq: item.moq ?? null,
                    notes: item.notes || null,
                    is_selected: false,
                } as any);
            }
        }
        // Mark quoting vendors + bump RFQ status.
        const vendors = await this.rfqVendorRepository.findByRfqId(rfqId);
        for (const v of vendors as any[]) {
            if (touchedVendors.has(v.vendor_id?.toString())) {
                v.status = ENUM_RFQ_VENDOR_STATUS.QUOTED;
                await this.rfqVendorRepository.save(v);
            }
        }
        await this.bumpStatusToQuoting(rfqId);
    }

    private async bumpStatusToQuoting(rfqId: string): Promise<void> {
        const rfq: any = await this.rfqRepository.findOneById(rfqId);
        if (rfq && rfq.status === ENUM_RFQ_STATUS.DRAFT) {
            rfq.status = ENUM_RFQ_STATUS.QUOTING;
            await this.rfqRepository.save(rfq);
        }
    }

    // ─── Select best price per line ──────────────────────────────────────
    async selectPrice(
        companyId: string,
        rfqId: string,
        dto: RfqSelectPriceDto
    ): Promise<void> {
        await this.getOrThrow(companyId, rfqId);
        const prices = await this.rfqVendorPriceRepository.findByRfqId(rfqId);
        const lineRows = (prices as any[]).filter(
            (p) => p.rfq_line_id?.toString() === dto.rfq_line_id
        );
        let found = false;
        for (const p of lineRows) {
            const shouldSelect = p.vendor_id?.toString() === dto.vendor_id;
            if (shouldSelect) found = true;
            if (p.is_selected !== shouldSelect) {
                p.is_selected = shouldSelect;
                await this.rfqVendorPriceRepository.save(p);
            }
        }
        if (!found) {
            throw new BadRequestException(
                'No price recorded for that line/vendor.'
            );
        }
        await this.maybeComplete(rfqId);
    }

    /** Mark RFQ completed once every line has a selected price. */
    private async maybeComplete(rfqId: string): Promise<void> {
        const [lines, prices, rfq] = await Promise.all([
            this.rfqLineRepository.findByRfqId(rfqId),
            this.rfqVendorPriceRepository.findByRfqId(rfqId),
            this.rfqRepository.findOneById(rfqId) as Promise<any>,
        ]);
        const selectedLineIds = new Set(
            (prices as any[])
                .filter((p) => p.is_selected)
                .map((p) => p.rfq_line_id?.toString())
        );
        const allSelected =
            lines.length > 0 &&
            lines.every((l: any) => selectedLineIds.has(l._id.toString()));
        const next = allSelected
            ? ENUM_RFQ_STATUS.COMPLETED
            : ENUM_RFQ_STATUS.QUOTING;
        if (rfq && rfq.status !== next && rfq.status !== ENUM_RFQ_STATUS.CANCELLED) {
            rfq.status = next;
            await this.rfqRepository.save(rfq);
        }
    }

    // ─── Header update / delete ──────────────────────────────────────────
    async update(
        companyId: string,
        rfqId: string,
        dto: RfqUpdateDto
    ): Promise<RfqDoc> {
        const rfq: any = await this.getOrThrow(companyId, rfqId);
        if (dto.notes !== undefined) rfq.notes = dto.notes;
        if (dto.rfq_date !== undefined) rfq.rfq_date = dto.rfq_date;
        if (dto.status !== undefined) rfq.status = dto.status;
        await this.rfqRepository.save(rfq);
        return this.rfqRepository.findOneById(rfqId);
    }

    async softDelete(companyId: string, rfqId: string): Promise<void> {
        const rfq: any = await this.getOrThrow(companyId, rfqId);
        rfq.soft_delete = true;
        await this.rfqRepository.save(rfq);
    }

    // ─── Read / map ──────────────────────────────────────────────────────
    async list(companyId: string, options?: any): Promise<RfqListResponseDto[]> {
        const rows = await this.rfqRepository.findByCompanyId(companyId, options);
        if (!rows.length) return [];
        const ids = rows.map((r: any) => r._id.toString());
        const [lines, vendors] = await Promise.all([
            this.rfqLineRepository.findAll({
                rfq_id: { $in: ids },
                soft_delete: false,
            } as any) as Promise<any[]>,
            this.rfqVendorRepository.findAll({
                rfq_id: { $in: ids },
                soft_delete: false,
            } as any) as Promise<any[]>,
        ]);
        const lineCount = new Map<string, number>();
        for (const l of lines)
            lineCount.set(
                l.rfq_id.toString(),
                (lineCount.get(l.rfq_id.toString()) || 0) + 1
            );
        const vendorCount = new Map<string, number>();
        for (const v of vendors)
            vendorCount.set(
                v.rfq_id.toString(),
                (vendorCount.get(v.rfq_id.toString()) || 0) + 1
            );
        return rows.map((r: any) => {
            const dto = plainToInstance(RfqListResponseDto, r);
            dto.line_count = lineCount.get(r._id.toString()) || 0;
            dto.vendor_count = vendorCount.get(r._id.toString()) || 0;
            return dto;
        });
    }

    async mapGet(companyId: string, rfqId: string): Promise<RfqGetResponseDto> {
        const rfq: any = await this.getOrThrow(companyId, rfqId);
        const [lines, vendors, prices] = await Promise.all([
            this.rfqLineRepository.findByRfqId(rfqId),
            this.rfqVendorRepository.findByRfqId(rfqId),
            this.rfqVendorPriceRepository.findByRfqId(rfqId),
        ]);

        const productIds = Array.from(
            new Set(
                (lines as any[])
                    .map((l) => l.product_id?.toString())
                    .filter(Boolean)
            )
        ) as string[];
        const vendorIds = Array.from(
            new Set(
                (vendors as any[]).map((v) => v.vendor_id?.toString())
            )
        ) as string[];
        const [products, vendorRows] = await Promise.all([
            productIds.length
                ? (this.productRepository.findAll({
                      _id: In(productIds),
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
            vendorIds.length
                ? (this.vendorRepository.findAll({
                      _id: In(vendorIds),
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
        ]);
        const productById = new Map<string, any>(
            products.map((p: any) => [p._id.toString(), p])
        );
        const vendorById = new Map<string, any>(
            vendorRows.map((v: any) => [v._id.toString(), v])
        );

        const dto = plainToInstance(RfqGetResponseDto, rfq);
        dto.lines = (lines as any[]).map((l) => {
            const prod = l.product_id
                ? productById.get(l.product_id.toString())
                : null;
            return {
                _id: l._id.toString(),
                product_id: l.product_id?.toString(),
                product_name: prod?.name,
                product_code: prod?.code,
                description: l.description,
                customer_reference: l.customer_reference,
                qty: l.qty,
                unit: l.unit,
                hs_code: l.hs_code,
                seq: l.seq,
            };
        });
        dto.vendors = (vendors as any[]).map((v) => {
            const ven = vendorById.get(v.vendor_id?.toString());
            return {
                _id: v._id.toString(),
                vendor_id: v.vendor_id?.toString(),
                vendor_name: ven?.company_name,
                vendor_code: ven?.vendor_code,
                status: v.status,
                sent_at: v.sent_at,
            };
        });
        dto.prices = (prices as any[]).map((p) => ({
            _id: p._id.toString(),
            rfq_line_id: p.rfq_line_id?.toString(),
            vendor_id: p.vendor_id?.toString(),
            unit_price: p.unit_price,
            currency_code: p.currency_code,
            lead_time_days: p.lead_time_days,
            moq: p.moq,
            notes: p.notes,
            is_selected: !!p.is_selected,
        }));
        return dto;
    }

    // ─── "Please quote" PDF (per vendor) ─────────────────────────────────
    async generatePdf(
        companyId: string,
        rfqId: string,
        vendorId?: string
    ): Promise<{ buffer: Buffer; filename: string }> {
        const data = await this.mapGet(companyId, rfqId);
        const company: any = await this.companyRepository.findOneById(companyId);
        const vendor = vendorId
            ? data.vendors.find((v) => v.vendor_id === vendorId)
            : null;
        const html = this.renderQuoteHtml(data, company, vendor);
        const buffer = await this.pdfService.generateFromHtml(html, {
            format: 'A4',
        });
        const safe = (data.voucher_no || rfqId).replace(/[^A-Za-z0-9_-]+/g, '_');
        return { buffer, filename: `RFQ-${safe}.pdf` };
    }

    private esc(s: any): string {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    private renderQuoteHtml(
        rfq: RfqGetResponseDto,
        company: any,
        vendor: any
    ): string {
        const rows = rfq.lines
            .map(
                (l, i) => `<tr>
                <td>${i + 1}</td>
                <td>${this.esc(l.product_name || l.product_code || '-')}${
                    l.description
                        ? `<br/><small style="color:#666">${this.esc(l.description)}</small>`
                        : ''
                }</td>
                <td>${this.esc(l.hs_code || '-')}</td>
                <td style="text-align:right">${this.esc(l.qty || '-')} ${this.esc(l.unit || '')}</td>
                <td style="width:120px"></td>
                <td style="width:90px"></td>
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
          <div class="muted">Request for Quotation</div>
          <div style="margin-top:8px">
            <strong>RFQ No:</strong> ${this.esc(rfq.voucher_no || '-')} &nbsp;
            <strong>Date:</strong> ${this.esc(rfq.rfq_date || '-')}<br/>
            ${vendor ? `<strong>To:</strong> ${this.esc(vendor.vendor_name || '')}` : ''}
          </div>
          <p>Please quote your best price and lead time for the items below.</p>
          <table>
            <thead><tr>
              <th>#</th><th>Item</th><th>HS Code</th><th>Qty</th>
              <th>Unit Price</th><th>Lead Time</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          ${rfq.notes ? `<p class="muted"><strong>Notes:</strong> ${this.esc(rfq.notes)}</p>` : ''}
        </body></html>`;
    }
}
