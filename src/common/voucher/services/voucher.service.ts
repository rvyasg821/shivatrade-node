import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDatabaseConnection } from '@common/database/decorators/database.decorator';
import { VoucherSequenceEntity } from '../repository/entities/voucher-sequence.entity';
import {
    ENUM_VOUCHER_DOC_TYPE,
    VOUCHER_DOC_CONFIG,
} from '../enums/voucher-doc-type.enum';

@Injectable()
export class VoucherService {
    private readonly logger = new Logger(VoucherService.name);

    constructor(
        @InjectDatabaseConnection()
        private readonly dataSource: DataSource
    ) {}

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
        const cleanCompanyPrefix = (companyPrefix || '').trim().toUpperCase() || 'CO';

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
