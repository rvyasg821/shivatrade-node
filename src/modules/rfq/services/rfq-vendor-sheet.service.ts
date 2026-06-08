import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import { LeadRepository } from '@modules/lead/repository/repositories/lead.repository';
import { LeadLineRepository } from '@modules/lead/repository/repositories/lead-line.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { PriceListImportExportService } from '@modules/price-list/services/price-list.import-export.service';
import { PriceListService } from '@modules/price-list/services/price-list.service';
import { PriceListRepository } from '@modules/price-list/repository/repositories/price-list.repository';
import { ENUM_PRICE_LIST_SOURCE } from '@modules/price-list/enums/price-list.enum';
import { RfqRepository } from '../repository/repositories/rfq.repository';
import { RfqLineRepository } from '../repository/repositories/rfq-line.repository';

// adm-zip ships no bundled type declarations; require it as `any`.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip: any = require('adm-zip');

const SHEET_NAME = 'Price Request';

/** Today as DD/MM/YYYY — accepted by the price-list import parser. */
function todayDDMMYYYY(): string {
    const iso = new Date().toISOString().slice(0, 10);
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

/** Make a value safe for a zip-entry / file name. */
function sanitizeName(s: string): string {
    return (
        (s || '')
            .replace(/[^A-Za-z0-9._-]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'sheet'
    );
}

/**
 * Builds the per-vendor RFQ price-request sheets for a lead and bundles them
 * into a single ZIP. One .xlsx per vendor (confidentiality — no vendor sees
 * another's prices). Columns align to the price-list import format so the
 * returned file re-imports cleanly; `unit_price` is left blank for the vendor
 * to fill. Keyed off `lead_id` + `vendor_ids` because the RFQ is still a draft
 * (no `rfq_id`) at export time.
 */
@Injectable()
export class RfqVendorSheetService {
    private readonly logger = new Logger(RfqVendorSheetService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly leadRepository: LeadRepository,
        private readonly leadLineRepository: LeadLineRepository,
        private readonly productRepository: ProductRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly importExportService: PriceListImportExportService,
        private readonly priceListService: PriceListService,
        private readonly priceListRepository: PriceListRepository,
        private readonly rfqRepository: RfqRepository,
        private readonly rfqLineRepository: RfqLineRepository
    ) {}

    async buildVendorPriceSheets(
        companyId: string,
        leadId: string,
        vendorIds: string[]
    ): Promise<{ filename: string; zip: Buffer }> {
        if (!leadId) throw new BadRequestException('lead_id is required');
        const ids = Array.from(new Set((vendorIds || []).filter(Boolean)));
        if (!ids.length) {
            throw new BadRequestException('At least one vendor is required');
        }

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

        const [products, vendors] = await Promise.all([
            this.productRepository.findByCompanyId(companyId),
            this.vendorRepository.findByCompanyId(companyId),
        ]);
        const productById = new Map<string, any>(
            products.map((p: any) => [p._id.toString(), p])
        );
        const vendorById = new Map<string, any>(
            vendors.map((v: any) => [v._id.toString(), v])
        );

        const today = todayDDMMYYYY();
        const leadVoucher = sanitizeName(
            lead.voucher_no || `LEAD-${leadId.slice(0, 6)}`
        );

        const zip = new AdmZip();
        for (const vendorId of ids) {
            const vendor = vendorById.get(vendorId);
            if (!vendor) continue; // skip unknown vendor ids silently
            const vendorCode =
                vendor.vendor_code ||
                vendor.company_name ||
                vendorId.slice(0, 6);

            const rows = (leadLines as any[]).map((l) => {
                const product = l.product_id
                    ? productById.get(l.product_id.toString())
                    : null;
                return {
                    vendor_code: vendorCode,
                    product_code: product?.code || '',
                    product_name: product?.name || l.description || '',
                    hsn_code: product?.hsn_code || l.hs_code || '',
                    qty: l.qty != null ? String(l.qty) : '',
                    unit: l.unit || '',
                    currency_code: 'INR',
                    unit_price: '', // vendor fills this
                    discount_pct: '',
                    effective_date: today,
                    valid_until: today,
                };
            });

            const buf = this.fileService.writeExcel([
                { data: rows, sheetName: SHEET_NAME },
            ]);
            zip.addFile(
                `RFQ-${leadVoucher}-${sanitizeName(vendorCode)}.xlsx`,
                buf
            );
        }

        const entries = zip.getEntries ? zip.getEntries() : [];
        if (!entries.length) {
            throw new BadRequestException('No valid vendors to export.');
        }

        this.logger.log(
            `Built ${entries.length} vendor price sheet(s) for lead ${leadId}`
        );
        return {
            filename: `RFQ-${leadVoucher}-price-requests.zip`,
            zip: zip.toBuffer(),
        };
    }

    /**
     * Single-vendor price-request sheet (one .xlsx, no zip). When `productIds`
     * is provided, only those lines are included — the user checks the products
     * the vendor actually supplies before exporting, one vendor at a time.
     */
    async buildVendorPriceSheet(
        companyId: string,
        leadId: string,
        vendorId: string,
        productIds?: string[]
    ): Promise<{ filename: string; buffer: Buffer }> {
        if (!leadId) throw new BadRequestException('lead_id is required');
        if (!vendorId) throw new BadRequestException('vendor_id is required');

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

        const [products, vendor] = await Promise.all([
            this.productRepository.findByCompanyId(companyId),
            this.vendorRepository.findOneById(vendorId) as Promise<any>,
        ]);
        if (!vendor) throw new NotFoundException('Vendor not found');
        const productById = new Map<string, any>(
            products.map((p: any) => [p._id.toString(), p])
        );

        const wanted =
            productIds && productIds.length
                ? new Set(productIds.map((s) => s.trim()).filter(Boolean))
                : null;
        const filteredLines = wanted
            ? (leadLines as any[]).filter(
                  (l) => l.product_id && wanted.has(l.product_id.toString())
              )
            : (leadLines as any[]);
        if (!filteredLines.length) {
            throw new BadRequestException('No products selected to export.');
        }

        const today = todayDDMMYYYY();
        const leadVoucher = sanitizeName(
            lead.voucher_no || `LEAD-${leadId.slice(0, 6)}`
        );
        const vendorCode =
            vendor.vendor_code || vendor.company_name || vendorId.slice(0, 6);

        const rows = filteredLines.map((l) => {
            const product = l.product_id
                ? productById.get(l.product_id.toString())
                : null;
            return {
                vendor_code: vendorCode,
                product_code: product?.code || '',
                product_name: product?.name || l.description || '',
                hsn_code: product?.hsn_code || l.hs_code || '',
                qty: l.qty != null ? String(l.qty) : '',
                unit: l.unit || '',
                currency_code: 'INR',
                unit_price: '',
                discount_pct: '',
                effective_date: today,
                valid_until: today,
            };
        });

        const buffer = this.fileService.writeExcel([
            { data: rows, sheetName: SHEET_NAME },
        ]);
        return {
            filename: `RFQ-${leadVoucher}-${sanitizeName(vendorCode)}.xlsx`,
            buffer,
        };
    }

    /**
     * Import one vendor's returned price sheet. The vendor identity comes from
     * `vendorId` (the dropdown) — the sheet's `vendor_code` column is ignored.
     * Reuses the price-list vendor-scoped parser, upserts the price list (new
     * dated row; same-day rows are updated, not duplicated), and returns the
     * parsed prices so the comparison grid can be seeded.
     */
    async importVendorPrices(
        companyId: string,
        vendorId: string,
        fileBuffer: Buffer,
        userId: string,
        preview = false,
        rfqId?: string
    ): Promise<any> {
        if (!vendorId) throw new BadRequestException('vendor_id is required');

        // Vendor-scoped parse — only product_code + unit_price are required;
        // products are matched by code, row-level problems are collected.
        const { summary, rows } =
            await this.importExportService.parseAndValidate(
                fileBuffer,
                companyId,
                vendorId
            );

        // Step 1 (preview): just the parsed summary + rows; no price-list write.
        if (preview) {
            return { summary, rows };
        }

        // ── Source traceability: stamp each written price with its RFQ origin ──
        // Resolve the RFQ voucher (for display) and a product_id → rfq_line_id
        // map so each price row links back to the exact RFQ line. Falls back to
        // 'import' when no rfqId is supplied (plain price-list upload path).
        let rfqVoucherNo: string | undefined;
        const rfqLineByProduct: Record<string, string> = {};
        if (rfqId) {
            const rfq: any = await this.rfqRepository.findOne({
                _id: rfqId,
                company_id: companyId,
            } as any);
            rfqVoucherNo = rfq?.voucher_no;
            const rfqLines: any[] = await this.rfqLineRepository.findAll({
                rfq_id: rfqId,
            } as any);
            for (const rl of rfqLines || []) {
                if (rl?.product_id && !rfqLineByProduct[rl.product_id]) {
                    rfqLineByProduct[rl.product_id] = rl._id.toString();
                }
            }
        }
        const sourceType = rfqId
            ? ENUM_PRICE_LIST_SOURCE.RFQ
            : ENUM_PRICE_LIST_SOURCE.IMPORT;

        const out: {
            rows: Array<{
                product_id: string;
                product_code: string;
                unit_price: string;
                discount_pct: string;
                effective_date: string;
                valid_until: string;
            }>;
            errors: Array<{ row: number; message: string }>;
        } = { rows: [], errors: [] };

        const today = new Date().toISOString().slice(0, 10);

        for (const r of rows) {
            if (r.status === 'error') {
                out.errors.push({
                    row: r.rowNum,
                    message: r.errors.join('; ') || 'Invalid row',
                });
                continue;
            }
            const d = r.data;
            if (!d.product_id || d.unit_price == null || d.unit_price === '') {
                out.errors.push({
                    row: r.rowNum,
                    message: 'Missing product match or price',
                });
                continue;
            }

            const effective_date = d.effective_date || today;
            const valid_until = d.valid_until || effective_date;
            const unit_price = String(d.unit_price);
            const discount_pct =
                d.discount_pct != null ? String(d.discount_pct) : '';

            try {
                // Same-day upsert: one row per (vendor, product, effective_date).
                const existing: any = await this.priceListRepository.findOne({
                    company_id: companyId,
                    vendor_id: vendorId,
                    product_id: d.product_id,
                    effective_date,
                } as any);
                const sourceRfqLineId = rfqLineByProduct[d.product_id];
                if (existing) {
                    existing.unit_price = unit_price;
                    if (d.discount_pct != null) {
                        existing.discount_pct = discount_pct;
                    }
                    existing.valid_until = valid_until;
                    existing.source_type = sourceType;
                    existing.source_rfq_id = rfqId || null;
                    existing.source_rfq_line_id = sourceRfqLineId || null;
                    existing.source_rfq_voucher_no = rfqVoucherNo || null;
                    await this.priceListRepository.save(existing);
                } else {
                    await this.priceListService.create(
                        companyId,
                        {
                            vendor_id: vendorId,
                            product_id: d.product_id,
                            currency_id: d.currency_id,
                            unit_price,
                            discount_pct: discount_pct || undefined,
                            effective_date,
                            valid_until,
                            source_type: sourceType,
                            source_rfq_id: rfqId || undefined,
                            source_rfq_line_id: sourceRfqLineId || undefined,
                            source_rfq_voucher_no: rfqVoucherNo || undefined,
                        } as any,
                        userId
                    );
                }

                out.rows.push({
                    product_id: d.product_id,
                    product_code: d.product_code,
                    unit_price,
                    discount_pct,
                    effective_date,
                    valid_until,
                });
            } catch (err: any) {
                out.errors.push({
                    row: r.rowNum,
                    message: err?.message || 'Failed to save price',
                });
            }
        }

        this.logger.log(
            `Imported ${out.rows.length} price(s) for vendor ${vendorId} (${out.errors.length} error rows)`
        );
        return out;
    }
}
