import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDatabaseConnection } from '@common/database/decorators/database.decorator';
import { VoucherSequenceEntity } from '../repository/entities/voucher-sequence.entity';
import {
    ENUM_VOUCHER_DOC_TYPE,
    VOUCHER_DOC_CONFIG,
} from '../enums/voucher-doc-type.enum';
import { CompanySettingsRepository } from '@modules/company-settings/repository/repositories/company-settings.repository';

// Per-module voucher prefix override fields on company settings, keyed by
// doc type. When set, replaces the leading company prefix for that document.
const PREFIX_FIELD_BY_DOC: Partial<Record<ENUM_VOUCHER_DOC_TYPE, string>> = {
    [ENUM_VOUCHER_DOC_TYPE.LEAD]: 'lead_voucher_prefix',
    [ENUM_VOUCHER_DOC_TYPE.RFQ]: 'rfq_voucher_prefix',
    [ENUM_VOUCHER_DOC_TYPE.QUOTATION]: 'quotation_voucher_prefix',
    [ENUM_VOUCHER_DOC_TYPE.PURCHASE_ORDER]: 'sales_order_voucher_prefix',
    [ENUM_VOUCHER_DOC_TYPE.INVOICE_EXPORT]: 'invoice_voucher_prefix',
    [ENUM_VOUCHER_DOC_TYPE.PO_VENDOR]: 'po_vendor_voucher_prefix',
    [ENUM_VOUCHER_DOC_TYPE.GRN]: 'grn_voucher_prefix',
    [ENUM_VOUCHER_DOC_TYPE.DEBIT_NOTE]: 'debit_note_voucher_prefix',
    [ENUM_VOUCHER_DOC_TYPE.PAYMENT_VOUCHER]: 'payment_voucher_prefix',
};

@Injectable()
export class VoucherService {
    private readonly logger = new Logger(VoucherService.name);

    constructor(
        @InjectDatabaseConnection()
        private readonly dataSource: DataSource,
        private readonly companySettingsRepository: CompanySettingsRepository
    ) {}

    /**
     * Company-configured per-module prefix override (the company-wide default
     * settings row, location_id = null). Best-effort: any lookup failure falls
     * back to the caller-supplied company prefix (current behaviour).
     */
    private async resolvePrefixOverride(
        companyId: string,
        docType: ENUM_VOUCHER_DOC_TYPE
    ): Promise<string | null> {
        const field = PREFIX_FIELD_BY_DOC[docType];
        if (!field) return null;
        try {
            const rows: any[] = await this.companySettingsRepository.findAll({
                company_id: companyId,
            } as any);
            const setting =
                (rows || []).find((r) => !r.location_id) || (rows || [])[0];
            const val = setting?.[field];
            return val && String(val).trim() ? String(val).trim() : null;
        } catch {
            return null;
        }
    }

    /**
     * Returns a formatted voucher number per ShivaTrades sheet, e.g.
     *   STIPL/PI0001/2026-27   (PFI, glued)
     *   STIPL/OS/0001/2026-27  (PO, separated)
     *   STIPL/QT0001/2026-27   (Quotation, glued)
     *
     * Concurrency-safe: the row holding the (company, doc_type, fy) counter
     * is fetched with `SELECT ... FOR UPDATE` inside a transaction so two
     * simultaneous callers never receive the same number. If the row does
     * not yet exist for this scope, it is inserted with counter = 1.
     */
    async getNext(
        companyId: string,
        docType: ENUM_VOUCHER_DOC_TYPE,
        companyPrefix: string,
        asOfDate?: Date
    ): Promise<string> {
        const fy = this.getIndianFY(asOfDate || new Date());
        const cfg = VOUCHER_DOC_CONFIG[docType];
        const overridePrefix = await this.resolvePrefixOverride(
            companyId,
            docType
        );
        const cleanCompanyPrefix =
            (overridePrefix || companyPrefix || '').trim().toUpperCase() || 'CO';

        const counter = await this.dataSource.transaction(async (manager) => {
            const repo = manager.getRepository(VoucherSequenceEntity);

            const existing = await repo
                .createQueryBuilder('seq')
                .setLock('pessimistic_write')
                .where('seq.company_id = :companyId', { companyId })
                .andWhere('seq.doc_type = :docType', { docType })
                .andWhere('seq.fy = :fy', { fy })
                .getOne();

            if (existing) {
                existing.counter += 1;
                await repo.save(existing);
                return existing.counter;
            }

            const fresh = repo.create({
                company_id: companyId,
                doc_type: docType,
                fy,
                prefix: cleanCompanyPrefix,
                counter: 1,
            });
            await repo.save(fresh);
            return 1;
        });

        return this.format(
            cleanCompanyPrefix,
            cfg.token,
            cfg.style,
            counter,
            fy,
            cfg.padDigits
        );
    }

    /**
     * Indian Financial Year encoded with hyphenated full years to match
     * ShivaTrades sheet - e.g. `2026-27` for FY 2026-27 (1 Apr 2026 → 31
     * Mar 2027).
     */
    getIndianFY(date: Date): string {
        const m = date.getMonth(); // 0-indexed: 0=Jan, 3=Apr
        const y = date.getFullYear();
        const startYear = m >= 3 ? y : y - 1;
        const endYY = String((startYear + 1) % 100).padStart(2, '0');
        return `${startYear}-${endYY}`;
    }

    /**
     * Builds the displayed voucher number.
     *   glued     → COMPANY/TOKEN0001/FY    (e.g. STIPL/PI0001/2026-27)
     *   separated → COMPANY/TOKEN/0001/FY   (e.g. STIPL/OS/0001/2026-27)
     *   compact   → COMPANY001/FY           (e.g. STIPL001/2025-26 - Invoice)
     */
    private format(
        companyPrefix: string,
        token: string,
        style: 'glued' | 'separated' | 'compact',
        counter: number,
        fy: string,
        padDigits: number = 4
    ): string {
        const padded = counter.toString().padStart(padDigits, '0');
        if (style === 'glued') {
            return `${companyPrefix}/${token}${padded}/${fy}`;
        }
        if (style === 'compact') {
            return `${companyPrefix}${padded}/${fy}`;
        }
        return `${companyPrefix}/${token}/${padded}/${fy}`;
    }
}
