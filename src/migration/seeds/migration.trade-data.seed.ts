import { Command, Positional } from 'nestjs-command';
import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { ENUM_CURRENCY_STATUS } from '@modules/currency/enums/currency.enum';

/**
 * Trade data seed - destructive helpers for UAT / dev resets.
 *
 *   trade:wipe          Delete EVERY trade-related row: sales docs, customers,
 *                       vendors, leads, catalogue, masters (currencies /
 *                       exchange rates / expenses / rebates), and the
 *                       auto-created users behind customer/vendor contacts.
 *   trade:seed-masters  Insert default currencies (INR/USD/EUR/AED/GBP) +
 *                       INR→X exchange rates + 6 expenses + 2 rebates.
 *   trade:fresh         Wipe + seed in one go.
 *
 * Pass a company UUID positional arg to scope to one tenant; otherwise
 * applies to ALL companies in the DB.
 *
 * Does NOT touch: roles, permissions, system users, companies themselves.
 */
@Injectable()
export class MigrationTradeDataSeed {
    private readonly logger = new Logger(MigrationTradeDataSeed.name);

    constructor(
        @InjectDataSource(DATABASE_CONNECTION_NAME)
        private readonly dataSource: DataSource
    ) {}

    // ─────────────────────────────────────────────────────────────────
    // trade:wipe
    // ─────────────────────────────────────────────────────────────────
    @Command({
        command: 'trade:wipe [company]',
        describe:
            'Wipe sales docs, customers, vendors, catalogue, leads + their auto-created users. Optional [company] uuid scopes to one tenant.',
    })
    async wipe(
        @Positional({ name: 'company', describe: 'Company UUID (optional)', type: 'string' })
        company?: string
    ): Promise<void> {
        const scope = company ? `company_id = '${company}'` : '1=1';
        this.banner(
            'TRADE WIPE',
            company
                ? `Scoped to company ${company}`
                : 'ALL companies (no company arg passed)'
        );

        await this.dataSource.transaction(async (mgr) => {
            // ── Capture user_ids that will need cleanup BEFORE deleting contacts ──
            const customerUsers: Array<{ user_id: string }> = await mgr.query(
                `SELECT DISTINCT user_id FROM customer_contacts
                 WHERE user_id IS NOT NULL AND ${scope}`
            );
            const customerUserIds = customerUsers
                .map((r) => r.user_id)
                .filter(Boolean);

            const vendorUsers: Array<{ user_id: string }> = await mgr.query(
                `SELECT DISTINCT user_id FROM vendor_contacts
                 WHERE user_id IS NOT NULL AND ${scope}`
            );
            const vendorUserIds = vendorUsers
                .map((r) => r.user_id)
                .filter(Boolean);

            this.logger.log(
                `  Found ${customerUserIds.length} customer-linked + ${vendorUserIds.length} vendor-linked users to clean up`
            );

            // ── 0. STOCK LEDGER - reset on-hand (refs products) ──
            this.logger.log('━━━ Stock movements ━━━');
            await this.del(mgr, 'stock_movements', scope);

            // ── 1. SALES GROUP - clear first (refs customers/vendors/products) ──
            this.logger.log('━━━ Sales group ━━━');
            await this.del(mgr, 'pfi_rebates', scope);
            await this.del(mgr, 'pfi_expenses', scope);
            await this.del(mgr, 'pfi_lines', scope);
            await this.del(mgr, 'pfis', scope);
            await this.del(mgr, 'quotation_rebates', scope);
            await this.del(mgr, 'quotation_expenses', scope);
            await this.del(mgr, 'quotation_lines', scope);
            await this.del(mgr, 'quotations', scope);

            // ── 2. LEADS (referenced from quotations; safe now to clear) ──
            this.logger.log('━━━ Leads ━━━');
            await this.del(mgr, 'leads', scope);

            // ── 3. CUSTOMERS (referenced from quotations/pfis/leads) ──
            this.logger.log('━━━ Customers ━━━');
            await this.del(mgr, 'customer_addresses', scope);
            await this.del(mgr, 'customer_contacts', scope);
            await this.del(mgr, 'customers', scope);

            // ── 4. VENDORS ──
            this.logger.log('━━━ Vendors ━━━');
            await this.del(mgr, 'price_lists', scope);
            await this.del(mgr, 'vendor_bank_accounts', scope);
            await this.del(mgr, 'vendor_addresses', scope);
            await this.del(mgr, 'vendor_categories', scope);
            await this.del(mgr, 'vendor_contacts', scope);
            await this.del(mgr, 'vendors', scope);

            // ── 5. CATALOGUE ──
            this.logger.log('━━━ Catalogue ━━━');
            await this.del(mgr, 'product_rebates', scope);
            await this.del(mgr, 'product_expenses', scope);
            await this.del(mgr, 'products', scope);
            await this.del(mgr, 'categories', scope);

            // ── 6. MASTERS (currencies / exchange rates / expenses / rebates) ──
            // Safe to clear now - every dependent row above has been deleted.
            // trade:seed-masters re-creates the defaults.
            this.logger.log('━━━ Masters ━━━');
            await this.del(mgr, 'currency_exchange_rates', scope);
            await this.del(mgr, 'currencies', scope);
            await this.del(mgr, 'expenses', scope);
            await this.del(mgr, 'rebates', scope);

            // ── 7. Auto-created users (vendor + customer primary contacts) ──
            const allUserIds = [...customerUserIds, ...vendorUserIds];
            if (allUserIds.length) {
                this.logger.log('━━━ Auto-created users ━━━');
                const placeholders = allUserIds
                    .map((_, i) => `$${i + 1}`)
                    .join(',');
                const r = await mgr.query(
                    `DELETE FROM users WHERE _id IN (${placeholders})`,
                    allUserIds
                );
                this.logger.log(
                    `  ✅ users (auto-created): ${r?.[1] ?? allUserIds.length}`
                );
            }
        });

        this.logger.log('✅ Trade wipe complete');
    }

    // ─────────────────────────────────────────────────────────────────
    // trade:wipe-docs
    //   Narrow wipe — only the transactional sales/procurement documents +
    //   customers. KEEPS vendors, products, categories and masters
    //   (currencies / exchange rates / expenses / rebates) intact.
    //   Deletes: leads, RFQs, quotations, sales orders, invoices, vendor POs,
    //   GRNs, debit notes, adjustment notes, their tracking events, and
    //   customers (+ the auto-created customer login users). Also clears the
    //   stock_movements
    //   ledger so on-hand / Coverage "In Stock" resets to zero.
    //   PFI is intentionally NOT touched (retired / hide-only).
    //   Also clears voucher_sequences so document numbering restarts fresh.
    // ─────────────────────────────────────────────────────────────────
    @Command({
        command: 'trade:wipe-docs [company]',
        describe:
            'Delete sales docs (leads, rfq, quotation, sales orders, invoices), vendor POs, GRN, debit notes + customers — keeps vendors/products/masters. Optional [company] uuid scopes to one tenant.',
    })
    async wipeDocs(
        @Positional({
            name: 'company',
            describe: 'Company UUID (optional)',
            type: 'string',
        })
        company?: string
    ): Promise<void> {
        const scope = company ? `company_id = '${company}'` : '1=1';
        this.banner(
            'TRADE WIPE DOCS',
            company
                ? `Scoped to company ${company}`
                : 'ALL companies (no company arg passed)'
        );

        await this.dataSource.transaction(async mgr => {
            // Capture auto-created customer login users BEFORE deleting contacts.
            const customerUsers: Array<{ user_id: string }> = await mgr.query(
                `SELECT DISTINCT user_id FROM customer_contacts
                 WHERE user_id IS NOT NULL AND ${scope}`
            );
            const customerUserIds = customerUsers
                .map(r => r.user_id)
                .filter(Boolean);
            this.logger.log(
                `  Found ${customerUserIds.length} customer-linked users to clean up`
            );

            // ── Adjustment Notes (off-doc customer/vendor ledger postings) ──
            this.logger.log('━━━ Adjustment Notes ━━━');
            await this.del(mgr, 'adjustment_notes', scope);

            // ── Invoices (+ payments / events / lines) ──
            this.logger.log('━━━ Invoices ━━━');
            await this.del(mgr, 'invoice_payments', scope);
            await this.del(mgr, 'invoice_events', scope);
            await this.del(mgr, 'invoice_lines', scope);
            await this.del(mgr, 'invoices', scope);

            // ── Debit Notes ──
            this.logger.log('━━━ Debit Notes ━━━');
            await this.del(mgr, 'debit_note_lines', scope);
            await this.del(mgr, 'debit_notes', scope);

            // ── GRNs ──
            this.logger.log('━━━ GRNs ━━━');
            await this.del(mgr, 'grn_lines', scope);
            await this.del(mgr, 'grns', scope);

            // ── Stock ledger — reset on-hand (sourced from GRN/invoice) ──
            this.logger.log('━━━ Stock movements ━━━');
            await this.del(mgr, 'stock_movements', scope);

            // ── Vendor POs (+ payments + tracking events) ──
            this.logger.log('━━━ Vendor POs ━━━');
            await this.del(mgr, 'po_vendor_payments', scope);
            await this.del(mgr, 'po_vendor_tracking_events', scope);
            await this.del(mgr, 'po_vendor_lines', scope);
            await this.del(mgr, 'po_vendors', scope);

            // ── Sales Orders ──
            this.logger.log('━━━ Sales Orders ━━━');
            await this.del(mgr, 'purchase_order_lines', scope);
            await this.del(mgr, 'purchase_orders', scope);

            // ── Quotations ──
            this.logger.log('━━━ Quotations ━━━');
            await this.del(mgr, 'quotation_rebates', scope);
            await this.del(mgr, 'quotation_expenses', scope);
            await this.del(mgr, 'quotation_lines', scope);
            await this.del(mgr, 'quotations', scope);

            // ── RFQs ──
            this.logger.log('━━━ RFQs ━━━');
            await this.del(mgr, 'rfq_vendor_prices', scope);
            await this.del(mgr, 'rfq_vendors', scope);
            await this.del(mgr, 'rfq_lines', scope);
            await this.del(mgr, 'rfqs', scope);

            // ── Leads ──
            this.logger.log('━━━ Leads ━━━');
            await this.del(mgr, 'lead_activities', scope);
            await this.del(mgr, 'lead_lines', scope);
            await this.del(mgr, 'leads', scope);

            // ── Customers ──
            this.logger.log('━━━ Customers ━━━');
            await this.del(mgr, 'customer_addresses', scope);
            await this.del(mgr, 'customer_contacts', scope);
            await this.del(mgr, 'customers', scope);

            // ── Document numbering — reset so new docs start fresh ──
            this.logger.log('━━━ Voucher sequences ━━━');
            await this.del(mgr, 'voucher_sequences', scope);

            // ── Auto-created customer login users ──
            if (customerUserIds.length) {
                this.logger.log('━━━ Auto-created customer users ━━━');
                const placeholders = customerUserIds
                    .map((_, i) => `$${i + 1}`)
                    .join(',');
                const r = await mgr.query(
                    `DELETE FROM users WHERE _id IN (${placeholders})`,
                    customerUserIds
                );
                this.logger.log(
                    `  ✅ users (auto-created): ${r?.[1] ?? customerUserIds.length}`
                );
            }
        });

        this.logger.log('✅ Trade docs wipe complete');
    }

    // ─────────────────────────────────────────────────────────────────
    // trade:seed-masters
    // ─────────────────────────────────────────────────────────────────
    @Command({
        command: 'trade:seed-masters [company]',
        describe:
            'Seed default currencies, exchange rates, expenses, rebates. Idempotent - skips if rows already exist.',
    })
    async seedMasters(
        @Positional({ name: 'company', describe: 'Company UUID (required)', type: 'string' })
        company?: string
    ): Promise<void> {
        if (!company) {
            // Default to seeding for the first company in the DB.
            const cs: Array<{ _id: string }> = await this.dataSource.query(
                `SELECT _id FROM company ORDER BY "createdAt" ASC LIMIT 1`
            );
            if (!cs.length) {
                this.logger.error(
                    '❌ No companies found. Pass [company] arg or seed via /seed:fresh-init first.'
                );
                return;
            }
            company = cs[0]._id;
            this.logger.log(`  No company arg - defaulting to ${company}`);
        }

        // Pick any user for created_by (column name on users is camelCase
        // "companyId", differs from snake_case used elsewhere - easier to
        // just grab any user since created_by is informational).
        const us: Array<{ _id: string }> = await this.dataSource.query(
            `SELECT _id FROM users ORDER BY "createdAt" ASC LIMIT 1`
        );
        const createdBy = us[0]?._id || null;

        this.banner(
            'TRADE SEED MASTERS',
            `Company ${company}, created_by ${createdBy || '(null)'}`
        );

        await this.dataSource.transaction(async (mgr) => {
            await this.seedCurrencies(mgr, company!, createdBy);
            await this.seedExchangeRates(mgr, company!, createdBy);
            await this.seedExpenses(mgr, company!, createdBy);
            await this.seedRebates(mgr, company!, createdBy);
        });

        this.logger.log('✅ Trade master seed complete');
    }

    // ─────────────────────────────────────────────────────────────────
    // trade:fresh - wipe + seed
    // ─────────────────────────────────────────────────────────────────
    @Command({
        command: 'trade:fresh [company]',
        describe:
            'Wipe trade data + reseed default currencies/expenses/rebates. Pass [company] uuid to scope.',
    })
    async fresh(
        @Positional({ name: 'company', describe: 'Company UUID (optional)', type: 'string' })
        company?: string
    ): Promise<void> {
        await this.wipe(company);
        await this.seedMasters(company);
        this.logger.log('🎉 Trade fresh complete');
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    private async del(
        mgr: any,
        table: string,
        whereClause: string
    ): Promise<void> {
        // Use the query builder so we get a reliable affected-row count.
        // A raw `mgr.query('DELETE …')` returns an empty rows array for a
        // DELETE (no RETURNING), so the old `r?.[1]` read was always
        // undefined → logged 0 even when rows were removed.
        const res = await mgr
            .createQueryBuilder()
            .delete()
            .from(table)
            .where(whereClause)
            .execute();
        this.logger.log(`  ✅ ${table}: ${res?.affected ?? 0}`);
    }

    private banner(title: string, sub: string) {
        console.log('');
        console.log('━'.repeat(64));
        console.log(`  ${title}`);
        console.log(`  ${sub}`);
        console.log('━'.repeat(64));
    }

    // ── Seeders ──

    private async seedCurrencies(
        mgr: any,
        companyId: string,
        createdBy: string | null
    ) {
        const currencies = [
            { code: 'INR', name: 'Indian Rupee', symbol: '₹', is_default: true },
        ];

        for (const c of currencies) {
            const existing = await mgr.query(
                `SELECT _id FROM currencies
                 WHERE company_id = $1 AND code = $2 AND soft_delete = false`,
                [companyId, c.code]
            );
            if (existing.length) {
                this.logger.log(`  ↷  Currency ${c.code} exists - skipped`);
                continue;
            }
            await mgr.query(
                `INSERT INTO currencies
                 (_id, company_id, created_by, code, name, symbol,
                  is_active, is_default, status, soft_delete, "createdAt", "updatedAt")
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5,
                         true, $6, $7, false, NOW(), NOW())`,
                [
                    companyId,
                    createdBy,
                    c.code,
                    c.name,
                    c.symbol,
                    c.is_default,
                    ENUM_CURRENCY_STATUS.ACTIVE,
                ]
            );
            this.logger.log(`  +  Currency ${c.code} created`);
        }
    }

    private async seedExchangeRates(
        mgr: any,
        companyId: string,
        createdBy: string | null
    ) {
        // 1 INR = X foreign-currency. Approx early-2026 values.
        const rates: Array<{ to: string; rate: number }> = [
            { to: 'USD', rate: 0.012 },
            { to: 'EUR', rate: 0.011 },
            { to: 'AED', rate: 0.044 },
            { to: 'GBP', rate: 0.0094 },
        ];

        const inr: Array<{ _id: string }> = await mgr.query(
            `SELECT _id FROM currencies WHERE company_id = $1 AND code = 'INR' LIMIT 1`,
            [companyId]
        );
        if (!inr.length) {
            this.logger.warn('  ⚠ INR currency not found - skipping exchange rates');
            return;
        }
        const fromId = inr[0]._id;

        for (const r of rates) {
            const existing = await mgr.query(
                `SELECT _id FROM currency_exchange_rates
                 WHERE company_id = $1 AND from_currency_id = $2 AND to_currency_code = $3
                   AND effective_date = CURRENT_DATE`,
                [companyId, fromId, r.to]
            );
            if (existing.length) {
                this.logger.log(`  ↷  Rate INR→${r.to} for today exists - skipped`);
                continue;
            }
            await mgr.query(
                `INSERT INTO currency_exchange_rates
                 (_id, company_id, from_currency_id, to_currency_code, rate,
                  effective_date, created_by, "createdAt", "updatedAt")
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, CURRENT_DATE, $5, NOW(), NOW())`,
                [companyId, fromId, r.to, r.rate, createdBy]
            );
            this.logger.log(`  +  Rate INR→${r.to} = ${r.rate}`);
        }
    }

    private async seedExpenses(
        mgr: any,
        companyId: string,
        createdBy: string | null
    ) {
        const expenses = [
            { name: 'CHA Charges',      code: 'CHA', type: 'fixed',   value: 3000 },
            { name: 'Inland Transport', code: 'TRP', type: 'fixed',   value: 5000 },
            { name: 'Documentation',    code: 'DOC', type: 'fixed',   value: 1500 },
            { name: 'Marine Insurance', code: 'INS', type: 'percent', value: 0.5  },
            { name: 'Loading Charges',  code: 'LDC', type: 'fixed',   value: 2500 },
            { name: 'Bank Negotiation', code: 'BNK', type: 'percent', value: 0.25 },
        ];

        for (const e of expenses) {
            const existing = await mgr.query(
                `SELECT _id FROM expenses
                 WHERE company_id = $1 AND code = $2 AND soft_delete = false`,
                [companyId, e.code]
            );
            if (existing.length) {
                this.logger.log(`  ↷  Expense ${e.code} exists - skipped`);
                continue;
            }
            await mgr.query(
                `INSERT INTO expenses
                 (_id, company_id, created_by, name, code, type, value,
                  is_active, status, soft_delete, "createdAt", "updatedAt")
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6,
                         true, 'active', false, NOW(), NOW())`,
                [companyId, createdBy, e.name, e.code, e.type, e.value]
            );
            this.logger.log(`  +  Expense ${e.code} (${e.type}, ${e.value}) created`);
        }
    }

    private async seedRebates(
        mgr: any,
        companyId: string,
        createdBy: string | null
    ) {
        const rebates = [
            { name: 'Duty Drawback (DBK)', code: 'DBK',    type: 'percent', pct: 2.0 },
            { name: 'RoDTEP',              code: 'RODTEP', type: 'percent', pct: 1.5 },
        ];

        for (const r of rebates) {
            const existing = await mgr.query(
                `SELECT _id FROM rebates
                 WHERE company_id = $1 AND code = $2 AND soft_delete = false`,
                [companyId, r.code]
            );
            if (existing.length) {
                this.logger.log(`  ↷  Rebate ${r.code} exists - skipped`);
                continue;
            }
            await mgr.query(
                `INSERT INTO rebates
                 (_id, company_id, created_by, name, code, type, pct,
                  is_active, status, soft_delete, "createdAt", "updatedAt")
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6,
                         true, 'active', false, NOW(), NOW())`,
                [companyId, createdBy, r.name, r.code, r.type, r.pct]
            );
            this.logger.log(`  +  Rebate ${r.code} (${r.pct}%) created`);
        }
    }
}
