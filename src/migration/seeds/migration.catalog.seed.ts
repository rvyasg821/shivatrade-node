import { Command } from 'nestjs-command';
import { Injectable, Logger } from '@nestjs/common';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import { CategoryRepository } from '@modules/category/repository/repositories/category.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { RebateRepository } from '@modules/rebate/repository/repositories/rebate.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import { ProductRebateRepository } from '@modules/product/repository/repositories/product-rebate.repository';
import { ProductExpenseRepository } from '@modules/product/repository/repositories/product-expense.repository';

// Catalog master data parsed from the client's Tally exports
// (docs/item Master.xlsx + Vendor Master.xlsx). Generated into JSON so the
// seed has no runtime Excel dependency.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CATALOG = require('../data/catalog-seed.json') as {
    categories: string[];
    products: Array<{ name: string; category: string; unit: string }>;
    vendors: string[];
};

// Per-product HSN / GST + DEMO price & margin, keyed by product code.
// HSN/GST are AI-derived by category/keyword — verify before production.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ENRICHMENT = require('../data/catalog-enrichment.json') as Record<
    string,
    { hsn_code: string; tax_pct: number; selling_price: number; margin_pct: number }
>;

// Demo rebate/expense defaults attached to every product (per-product override
// values on the master link tables). Real values set per product / per quote.
const PRODUCT_REBATES = [
    { code: 'DBK', pct: '1.5' },
    { code: 'RODTEP', pct: '0.8' },
];
const PRODUCT_EXPENSES = [
    { code: 'TRANSPORT', value: '50' },
    { code: 'PACKING', value: '30' },
    { code: 'CHA', value: '200' },
];

/** Standard Indian export incentive schemes (percent, default 0 — editable). */
const DEFAULT_REBATES = [
    { code: 'DBK', name: 'Duty Drawback' },
    { code: 'RODTEP', name: 'RoDTEP' },
    { code: 'MEIS', name: 'MEIS' },
    { code: 'ROSCTL', name: 'RoSCTL' },
];

/** Standard export cost heads (fixed amount, default 0 — editable). */
const DEFAULT_EXPENSES = [
    { code: 'TRANSPORT', name: 'Transport' },
    { code: 'PACKING', name: 'Packing' },
    { code: 'CHA', name: 'CHA Charges' },
    { code: 'INSURANCE', name: 'Insurance' },
    { code: 'CLEARING', name: 'Clearing & Forwarding' },
    { code: 'OTHER', name: 'Other' },
];

/**
 * Seeds the ShivaTrades catalog from the client masters: categories, products
 * and vendors, plus baseline rebate + expense masters. Idempotent — every row
 * is matched on a natural key and only the missing ones are inserted, so it is
 * safe to re-run and never duplicates or overwrites hand-edited data.
 *
 * Price-list rows are deliberately NOT seeded: prices enter the system through
 * the RFQ vendor-sheet flow (export → vendor fills → import).
 */
@Injectable()
export class MigrationCatalogSeed {
    private readonly logger = new Logger(MigrationCatalogSeed.name);

    private static readonly COMPANY_CODE = 'STIPL';

    constructor(
        private readonly companyRepository: CompanyRepository,
        private readonly categoryRepository: CategoryRepository,
        private readonly productRepository: ProductRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly rebateRepository: RebateRepository,
        private readonly expenseRepository: ExpenseRepository,
        private readonly productRebateRepository: ProductRebateRepository,
        private readonly productExpenseRepository: ProductExpenseRepository,
    ) {}

    @Command({
        command: 'seed:catalog',
        describe:
            'seed ShivaTrades catalog (categories, products, vendors, rebates, expenses) from client masters — idempotent',
    })
    async seed(): Promise<void> {
        try {
            const company: any = await this.companyRepository.findOne({
                company_code: MigrationCatalogSeed.COMPANY_CODE,
            } as any);
            if (!company) {
                throw new Error(
                    'ShivaTrades company (STIPL) not found. Run "yarn seed:shivatrade-tenant" first.',
                );
            }
            const companyId = String(company._id);

            const catByName = await this.seedCategories(companyId);
            await this.seedProducts(companyId, catByName);
            await this.seedVendors(companyId);
            const rebateByCode = await this.seedRebates(companyId);
            const expenseByCode = await this.seedExpenses(companyId);
            await this.seedProductLinks(companyId, rebateByCode, expenseByCode);

            this.logger.log('✅ Catalog seed complete');
        } catch (err: any) {
            this.logger.error(`❌ Catalog seed failed: ${err?.message || err}`);
            throw new Error(err);
        }
    }

    /** Insert any missing categories; return a name → id map for product linking. */
    private async seedCategories(
        companyId: string,
    ): Promise<Record<string, string>> {
        const map: Record<string, string> = {};
        let created = 0;
        for (const name of CATALOG.categories) {
            const existing: any = await this.categoryRepository.findOne({
                company_id: companyId,
                name,
            } as any);
            if (existing) {
                map[name] = String(existing._id);
                continue;
            }
            const row: any = await this.categoryRepository.create({
                company_id: companyId,
                name,
                is_active: true,
            } as any);
            map[name] = String(row._id);
            created += 1;
        }
        this.logger.log(
            `Categories: ${created} created, ${CATALOG.categories.length - created} existing`,
        );
        return map;
    }

    /** Insert products (matched by code), generating a sequential STIPL code. */
    private async seedProducts(
        companyId: string,
        catByName: Record<string, string>,
    ): Promise<void> {
        let created = 0;
        let enriched = 0;
        let seq = 0;
        for (const p of CATALOG.products) {
            seq += 1;
            const code = `STIPL-P${String(seq).padStart(4, '0')}`;
            const e = ENRICHMENT[code];
            const category_id = catByName[p.category];
            if (!category_id) continue; // category seeding guarantees this exists

            const existing: any =
                (await this.productRepository.findOne({
                    company_id: companyId,
                    code,
                } as any)) ||
                (await this.productRepository.findOne({
                    company_id: companyId,
                    name: p.name,
                } as any));

            if (existing) {
                // Backfill HSN/GST + demo price/margin on an already-seeded
                // product only when the field is still empty — never clobber a
                // value the user has set by hand.
                if (e) {
                    const patch: any = {};
                    if (existing.hsn_code == null) patch.hsn_code = e.hsn_code;
                    if (existing.tax_pct == null) patch.tax_pct = String(e.tax_pct);
                    if (existing.selling_price == null)
                        patch.selling_price = String(e.selling_price);
                    if (existing.margin_pct == null)
                        patch.margin_pct = String(e.margin_pct);
                    if (Object.keys(patch).length) {
                        Object.assign(existing, patch);
                        await this.productRepository.save(existing);
                        enriched += 1;
                    }
                }
                continue;
            }

            await this.productRepository.create({
                company_id: companyId,
                code,
                name: p.name,
                category_id,
                unit_of_measure: p.unit || 'Nos',
                hsn_code: e?.hsn_code,
                tax_pct: e ? String(e.tax_pct) : undefined,
                selling_price: e ? String(e.selling_price) : undefined,
                margin_pct: e ? String(e.margin_pct) : undefined,
                is_active: true,
            } as any);
            created += 1;
        }
        this.logger.log(
            `Products: ${created} created, ${enriched} enriched (HSN/price backfill)`,
        );
    }

    /** Insert vendors (matched by company_name), generating a sequential code. */
    private async seedVendors(companyId: string): Promise<void> {
        let created = 0;
        let seq = 0;
        for (const name of CATALOG.vendors) {
            seq += 1;
            const existing: any = await this.vendorRepository.findOne({
                company_id: companyId,
                company_name: name,
            } as any);
            if (existing) continue;
            await this.vendorRepository.create({
                company_id: companyId,
                company_name: name,
                vendor_code: `VEN-${String(seq).padStart(4, '0')}`,
                is_active: true,
            } as any);
            created += 1;
        }
        this.logger.log(
            `Vendors: ${created} created, ${CATALOG.vendors.length - created} existing`,
        );
    }

    /** Baseline export-incentive rebate masters (percent, 0% default). */
    private async seedRebates(
        companyId: string,
    ): Promise<Record<string, string>> {
        const map: Record<string, string> = {};
        let created = 0;
        for (const r of DEFAULT_REBATES) {
            let row: any = await this.rebateRepository.findOne({
                company_id: companyId,
                code: r.code,
            } as any);
            if (!row) {
                row = await this.rebateRepository.create({
                    company_id: companyId,
                    name: r.name,
                    code: r.code,
                    type: 'percent',
                    pct: '0',
                    is_active: true,
                } as any);
                created += 1;
            }
            map[r.code] = String(row._id);
        }
        this.logger.log(`Rebates: ${created} created`);
        return map;
    }

    /** Baseline export cost-head expense masters (fixed amount, 0 default). */
    private async seedExpenses(
        companyId: string,
    ): Promise<Record<string, string>> {
        const map: Record<string, string> = {};
        let created = 0;
        for (const e of DEFAULT_EXPENSES) {
            let row: any = await this.expenseRepository.findOne({
                company_id: companyId,
                code: e.code,
            } as any);
            if (!row) {
                row = await this.expenseRepository.create({
                    company_id: companyId,
                    name: e.name,
                    code: e.code,
                    type: 'fixed',
                    value: '0',
                    is_active: true,
                } as any);
                created += 1;
            }
            map[e.code] = String(row._id);
        }
        this.logger.log(`Expenses: ${created} created`);
        return map;
    }

    /**
     * Attach DEMO per-product rebates + expenses to every product (the
     * master-level fallback used at quotation time when no price-list row
     * exists). Idempotent — skips a link that already exists.
     */
    private async seedProductLinks(
        companyId: string,
        rebateByCode: Record<string, string>,
        expenseByCode: Record<string, string>,
    ): Promise<void> {
        const products: any[] = await this.productRepository.findAll({
            company_id: companyId,
        } as any);
        let rebLinks = 0;
        let expLinks = 0;
        for (const p of products) {
            const product_id = String(p._id);
            for (const r of PRODUCT_REBATES) {
                const rebate_id = rebateByCode[r.code];
                if (!rebate_id) continue;
                const exists: any = await this.productRebateRepository.findOne({
                    product_id,
                    rebate_id,
                } as any);
                if (exists) continue;
                await this.productRebateRepository.create({
                    company_id: companyId,
                    product_id,
                    rebate_id,
                    type: 'percent',
                    pct: r.pct,
                } as any);
                rebLinks += 1;
            }
            for (const ex of PRODUCT_EXPENSES) {
                const expense_id = expenseByCode[ex.code];
                if (!expense_id) continue;
                const exists: any = await this.productExpenseRepository.findOne({
                    product_id,
                    expense_id,
                } as any);
                if (exists) continue;
                await this.productExpenseRepository.create({
                    company_id: companyId,
                    product_id,
                    expense_id,
                    type: 'fixed',
                    value: ex.value,
                } as any);
                expLinks += 1;
            }
        }
        this.logger.log(
            `Product links: ${rebLinks} rebate + ${expLinks} expense links created`,
        );
    }
}
