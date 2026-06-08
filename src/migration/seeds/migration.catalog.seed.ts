import { Command } from 'nestjs-command';
import { Injectable, Logger } from '@nestjs/common';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import { CategoryRepository } from '@modules/category/repository/repositories/category.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { RebateRepository } from '@modules/rebate/repository/repositories/rebate.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';

// Catalog master data parsed from the client's Tally exports
// (docs/item Master.xlsx + Vendor Master.xlsx). Generated into JSON so the
// seed has no runtime Excel dependency.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CATALOG = require('../data/catalog-seed.json') as {
    categories: string[];
    products: Array<{ name: string; category: string; unit: string }>;
    vendors: string[];
};

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
            await this.seedRebates(companyId);
            await this.seedExpenses(companyId);

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
        let seq = 0;
        for (const p of CATALOG.products) {
            seq += 1;
            const code = `STIPL-P${String(seq).padStart(4, '0')}`;
            const existingByCode: any = await this.productRepository.findOne({
                company_id: companyId,
                code,
            } as any);
            if (existingByCode) continue;
            // Also skip if a product with the same name already exists (avoids
            // dupes when codes were assigned differently on a prior run).
            const existingByName: any = await this.productRepository.findOne({
                company_id: companyId,
                name: p.name,
            } as any);
            if (existingByName) continue;

            const category_id = catByName[p.category];
            if (!category_id) continue; // category seeding guarantees this exists

            await this.productRepository.create({
                company_id: companyId,
                code,
                name: p.name,
                category_id,
                unit_of_measure: p.unit || 'Nos',
                is_active: true,
            } as any);
            created += 1;
        }
        this.logger.log(
            `Products: ${created} created, ${CATALOG.products.length - created} skipped/existing`,
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
    private async seedRebates(companyId: string): Promise<void> {
        let created = 0;
        for (const r of DEFAULT_REBATES) {
            const existing: any = await this.rebateRepository.findOne({
                company_id: companyId,
                code: r.code,
            } as any);
            if (existing) continue;
            await this.rebateRepository.create({
                company_id: companyId,
                name: r.name,
                code: r.code,
                type: 'percent',
                pct: '0',
                is_active: true,
            } as any);
            created += 1;
        }
        this.logger.log(`Rebates: ${created} created`);
    }

    /** Baseline export cost-head expense masters (fixed amount, 0 default). */
    private async seedExpenses(companyId: string): Promise<void> {
        let created = 0;
        for (const e of DEFAULT_EXPENSES) {
            const existing: any = await this.expenseRepository.findOne({
                company_id: companyId,
                code: e.code,
            } as any);
            if (existing) continue;
            await this.expenseRepository.create({
                company_id: companyId,
                name: e.name,
                code: e.code,
                type: 'fixed',
                value: '0',
                is_active: true,
            } as any);
            created += 1;
        }
        this.logger.log(`Expenses: ${created} created`);
    }
}
