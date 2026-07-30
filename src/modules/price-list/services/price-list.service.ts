import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { PriceListRepository } from '../repository/repositories/price-list.repository';
import { PriceListDoc } from '../repository/entities/price-list.entity';
import { PriceListCreateRequestDto } from '../dtos/request/price-list.create.request.dto';
import { PriceListUpdateRequestDto } from '../dtos/request/price-list.update.request.dto';
import { PriceListGetResponseDto } from '../dtos/response/price-list.get.response.dto';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { CurrencyRepository } from '@modules/currency/repository/repositories/currency.repository';
import { CurrencyService } from '@modules/currency/services/currency.service';
import { ENUM_PRICE_LIST_SOURCE } from '../enums/price-list.enum';

@Injectable()
export class PriceListService {
    private readonly logger = new Logger(PriceListService.name);

    constructor(
        private readonly priceListRepository: PriceListRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly productRepository: ProductRepository,
        private readonly currencyRepository: CurrencyRepository,
        private readonly currencyService: CurrencyService
    ) {}

    private async assertReferences(
        companyId: string,
        vendorId: string,
        productId: string,
        currencyId: string
    ): Promise<void> {
        const vendor = await this.vendorRepository.findOne({
            _id: vendorId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!vendor) throw new BadRequestException('Vendor not found');

        const product = await this.productRepository.findOne({
            _id: productId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!product) throw new BadRequestException('Product not found');

        const currency = await this.currencyRepository.findOne({
            _id: currencyId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!currency) throw new BadRequestException('Currency not found');
    }

    /**
     * The price row's currency ALWAYS follows the vendor's own currency — the
     * price list no longer carries an independent currency. Resolves the
     * vendor's `currency_code` to a currency-master id, falling back to the
     * company default (INR) when the vendor has none.
     */
    private async resolveVendorCurrencyId(
        companyId: string,
        vendorId: string
    ): Promise<string> {
        const vendor: any = await this.vendorRepository.findOne({
            _id: vendorId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!vendor) throw new BadRequestException('Vendor not found');

        const code = vendor.currency_code
            ? String(vendor.currency_code).toUpperCase()
            : '';
        if (code) {
            const cur: any = await this.currencyRepository.findOne({
                company_id: companyId,
                code,
                soft_delete: false,
            } as any);
            if (cur) return cur._id.toString();
        }
        const def: any =
            (await this.currencyRepository.findOne({
                company_id: companyId,
                is_default: true,
                soft_delete: false,
            } as any)) ||
            (await this.currencyRepository.findOne({
                company_id: companyId,
                code: 'INR',
                soft_delete: false,
            } as any));
        if (!def)
            throw new BadRequestException('No currency configured for this company');
        return def._id.toString();
    }

    async create(
        companyId: string,
        data: PriceListCreateRequestDto,
        createdBy: string
    ): Promise<PriceListDoc> {
        // Currency always follows the vendor — any incoming currency_id is
        // ignored so the price list can't drift from the vendor's currency.
        const currencyId = await this.resolveVendorCurrencyId(
            companyId,
            data.vendor_id
        );
        await this.assertReferences(
            companyId,
            data.vendor_id,
            data.product_id,
            currencyId
        );

        const { currency_id: _ignoredCurrency, ...rest } = data as any;
        const row = await this.priceListRepository.create({
            ...rest,
            currency_id: currencyId,
            company_id: companyId,
            created_by: createdBy,
        } as any);

        this.logger.log(
            `Price list entry created: ${row._id} (vendor ${data.vendor_id}, product ${data.product_id})`
        );
        return row;
    }

    /**
     * Bulk create — inserts several vendor price rows in one call (the Manage
     * Vendor Pricing grid). Each row is a new versioned entry; old prices for
     * the same (vendor, product) auto-expire via the effective_date logic.
     */
    async bulkCreate(
        companyId: string,
        items: PriceListCreateRequestDto[],
        createdBy: string
    ): Promise<number> {
        let count = 0;
        for (const item of items) {
            await this.create(companyId, item, createdBy);
            count += 1;
        }
        this.logger.log(`Bulk price list create: ${count} rows for company ${companyId}`);
        return count;
    }

    /**
     * Upsert a vendor price captured from an RFQ. One price-list record is
     * maintained per (vendor, product, RFQ) — re-saving the RFQ updates that
     * same row instead of stacking duplicates. Used by both the inline RFQ
     * price save and the vendor-sheet import so they stay in sync.
     */
    async upsertFromRfq(
        companyId: string,
        data: {
            vendor_id: string;
            product_id: string;
            currency_id?: string;
            unit_price: string | number;
            source_rfq_id?: string;
            source_rfq_line_id?: string;
            source_rfq_voucher_no?: string;
        },
        createdBy?: string
    ): Promise<PriceListDoc | null> {
        if (!data.vendor_id || !data.product_id) {
            return null; // can't form a valid price-list row
        }
        // Currency always follows the vendor (price list carries none of its own).
        const currencyId = await this.resolveVendorCurrencyId(
            companyId,
            data.vendor_id
        );
        if (!currencyId) return null; // no currency to attach
        const today = new Date().toISOString().slice(0, 10);
        const unit_price = String(data.unit_price);

        // One record per (vendor, product, RFQ): match on the RFQ id when we
        // have one, else fall back to the same-day (vendor, product) row.
        const find: any = {
            company_id: companyId,
            vendor_id: data.vendor_id,
            product_id: data.product_id,
        };
        if (data.source_rfq_id) find.source_rfq_id = data.source_rfq_id;
        else find.effective_date = today;

        const existing: any = await this.priceListRepository.findOne(find);
        if (existing) {
            existing.unit_price = unit_price;
            existing.effective_date = today;
            existing.source_type = ENUM_PRICE_LIST_SOURCE.RFQ;
            if (data.source_rfq_id) existing.source_rfq_id = data.source_rfq_id;
            if (data.source_rfq_line_id)
                existing.source_rfq_line_id = data.source_rfq_line_id;
            if (data.source_rfq_voucher_no)
                existing.source_rfq_voucher_no = data.source_rfq_voucher_no;
            return this.priceListRepository.save(existing);
        }
        return this.priceListRepository.create({
            company_id: companyId,
            vendor_id: data.vendor_id,
            product_id: data.product_id,
            currency_id: currencyId,
            unit_price,
            effective_date: today,
            source_type: ENUM_PRICE_LIST_SOURCE.RFQ,
            source_rfq_id: data.source_rfq_id || null,
            source_rfq_line_id: data.source_rfq_line_id || null,
            source_rfq_voucher_no: data.source_rfq_voucher_no || null,
            created_by: createdBy,
        } as any);
    }

    async findOneById(id: string): Promise<PriceListDoc> {
        const row = await this.priceListRepository.findOneById(id);
        if (!row) throw new NotFoundException('Price list entry not found');
        return row;
    }

    async update(
        row: PriceListDoc,
        data: PriceListUpdateRequestDto
    ): Promise<PriceListDoc> {
        const companyId = row.company_id.toString();

        // Currency follows the vendor — never taken from the request.
        const { currency_id: _ignoredCurrency, ...rest } = data as any;
        Object.assign(row, rest);
        row.currency_id = await this.resolveVendorCurrencyId(
            companyId,
            row.vendor_id.toString()
        );

        if (data.vendor_id || data.product_id) {
            await this.assertReferences(
                companyId,
                row.vendor_id.toString(),
                row.product_id.toString(),
                row.currency_id.toString()
            );
        }

        const updated = await this.priceListRepository.save(row);

        this.logger.log(`Price list entry updated: ${row._id}`);
        return updated;
    }

    async hardDelete(row: PriceListDoc): Promise<void> {
        await this.priceListRepository.deleteMany({ _id: row._id.toString() } as any);
        this.logger.log(`Price list entry deleted: ${row._id}`);
    }

    async getCurrentPrice(
        companyId: string,
        vendorId: string,
        productId: string,
        currencyId?: string
    ): Promise<PriceListDoc | null> {
        return this.priceListRepository.findCurrentPrice(
            companyId,
            vendorId,
            productId,
            currencyId
        );
    }

    // ─── Mapping ────────────────────────────────────────────────────────

    async mapList(rows: PriceListDoc[]): Promise<PriceListGetResponseDto[]> {
        if (!rows.length) return [];

        const vendorIds = Array.from(new Set(rows.map((r) => r.vendor_id.toString())));
        const productIds = Array.from(new Set(rows.map((r) => r.product_id.toString())));
        const currencyIds = Array.from(new Set(rows.map((r) => r.currency_id.toString())));

        const [vendors, products, currencies] = await Promise.all([
            this.vendorRepository.findAll({ _id: { $in: vendorIds } } as any),
            this.productRepository.findAll({ _id: { $in: productIds } } as any),
            this.currencyRepository.findAll({ _id: { $in: currencyIds } } as any),
        ]);

        const vendorMap: Record<string, any> = {};
        vendors.forEach((v: any) => (vendorMap[v._id.toString()] = v));

        const productMap: Record<string, any> = {};
        products.forEach((p: any) => (productMap[p._id.toString()] = p));

        const currencyMap: Record<string, any> = {};
        currencies.forEach((c: any) => (currencyMap[c._id.toString()] = c));

        // Build a lookup of effective_dates per (vendor, product) for derived
        // valid_until calculation. We only need rows in the same set (same
        // company already, since list endpoint filtered).
        const companyId = rows[0].company_id.toString();
        const allForDerivation =
            await this.priceListRepository.findNextRowsAfter(
                companyId,
                rows.map((r) => ({
                    vendor_id: r.vendor_id.toString(),
                    product_id: r.product_id.toString(),
                    effective_date: r.effective_date,
                }))
            );
        const datesByPair: Record<string, string[]> = {};
        for (const r of allForDerivation) {
            const key = `${r.vendor_id}|${r.product_id}`;
            (datesByPair[key] ||= []).push(r.effective_date);
        }
        Object.values(datesByPair).forEach((arr) => arr.sort());

        const minusOneDay = (iso: string): string => {
            const d = new Date(iso);
            d.setDate(d.getDate() - 1);
            return d.toISOString().slice(0, 10);
        };

        return rows.map((r) => {
            const dto = plainToInstance(PriceListGetResponseDto, r);
            const v = vendorMap[r.vendor_id.toString()];
            const p = productMap[r.product_id.toString()];
            const c = currencyMap[r.currency_id.toString()];
            dto.vendor_name = v?.company_name;
            dto.vendor_code = v?.vendor_code;
            dto.product_code = p?.code;
            dto.product_name = p?.name;
            dto.currency_code = c?.code;
            dto.currency_symbol = c?.symbol;

            // Derive effective_until: explicit valid_until wins; otherwise
            // (next row's effective_date − 1 day) for same (vendor, product).
            if (r.valid_until) {
                dto.effective_until = r.valid_until;
            } else {
                const key = `${r.vendor_id}|${r.product_id}`;
                const dates = datesByPair[key] || [];
                const next = dates.find((d) => d > r.effective_date);
                dto.effective_until = next ? minusOneDay(next) : undefined;
            }
            return dto;
        });
    }

    async mapGet(row: PriceListDoc): Promise<PriceListGetResponseDto> {
        const [mapped] = await this.mapList([row]);
        return mapped;
    }

    /**
     * Map rows AND normalise every native price to the home currency (INR) for a
     * fair cross-currency "cheapest" comparison. Each row's INR value =
     * native × (its currency → INR) rate from the master (the rate on that
     * currency's own page, e.g. USD→INR = 83). Home-currency rows use rate 1.
     * Rows whose currency has NO →INR rate get `unit_price_inr = null` +
     * `inr_rate_available = false` and are sorted LAST (can't be compared).
     * Otherwise sorted by INR value ascending, so the true cheapest is first.
     */
    async mapListWithInrCompare(
        rows: PriceListDoc[]
    ): Promise<PriceListGetResponseDto[]> {
        const mapped = await this.mapList(rows);
        if (!mapped.length) return mapped;

        const companyId = rows[0].company_id.toString();
        const home = await this.currencyService
            .getDefaultCurrency(companyId)
            .catch(() => null);
        const homeCode = (home?.code || 'INR').toUpperCase();

        // One rate lookup per distinct currency id (not per row).
        const rateByCurrencyId = new Map<string, number | null>();
        for (let i = 0; i < mapped.length; i++) {
            const currencyId = rows[i].currency_id?.toString();
            if (!currencyId || rateByCurrencyId.has(currencyId)) continue;
            const code = (mapped[i].currency_code || '').toUpperCase();
            if (!code || code === homeCode) {
                rateByCurrencyId.set(currencyId, 1);
                continue;
            }
            let rate: number | null = null;
            try {
                const row = await this.currencyService.getCurrentRate(
                    companyId,
                    currencyId,
                    homeCode
                );
                if (row?.rate && Number(row.rate) > 0) rate = Number(row.rate);
            } catch {
                rate = null;
            }
            rateByCurrencyId.set(currencyId, rate);
        }

        for (let i = 0; i < mapped.length; i++) {
            const currencyId = rows[i].currency_id?.toString();
            const rate = currencyId ? rateByCurrencyId.get(currencyId) : null;
            const native = Number(mapped[i].unit_price) || 0;
            if (rate != null) {
                mapped[i].unit_price_inr = (native * rate).toFixed(2);
                mapped[i].inr_rate_available = true;
            } else {
                mapped[i].unit_price_inr = null;
                mapped[i].inr_rate_available = false;
            }
        }

        // Convertible rows first (cheapest-in-INR ascending); unconvertible last.
        mapped.sort((a, b) => {
            const aa = a.inr_rate_available ? 0 : 1;
            const bb = b.inr_rate_available ? 0 : 1;
            if (aa !== bb) return aa - bb;
            return Number(a.unit_price_inr || 0) - Number(b.unit_price_inr || 0);
        });
        return mapped;
    }
}
