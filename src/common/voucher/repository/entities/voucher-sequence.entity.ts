import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { VOUCHER_SEQUENCE_COLLECTION_NAME } from '../../constants/voucher.constant';

/**
 * Per-(company, doc_type, fy) running counter that backs the voucher
 * numbering service. Each row holds the highest counter issued so far for
 * its scope; `getNext()` reads + increments it inside a row-locked
 * transaction.
 */
@Entity(VOUCHER_SEQUENCE_COLLECTION_NAME)
@Unique('uq_voucher_seq_scope', ['company_id', 'doc_type', 'fy'])
export class VoucherSequenceEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    /** Stable token like 'QT', 'PFI', 'PO' (from ENUM_VOUCHER_DOC_TYPE). */
    @Index()
    @Column({ type: 'varchar', length: 20, nullable: false })
    doc_type: string;

    /** Indian FY in hyphenated form, e.g. '2026-27' (7 chars). */
    @Index()
    @Column({ type: 'varchar', length: 10, nullable: false })
    fy: string;

    /** Display prefix used in the formatted voucher_no. Usually equals doc_type
     *  but kept separate so callers can override (e.g. tenant-branded prefix). */
    @Column({ type: 'varchar', length: 10, nullable: false })
    prefix: string;

    /** Highest counter issued. Next call returns counter + 1. */
    @Column({ type: 'int', nullable: false, default: 0 })
    counter: number;
}

export type VoucherSequenceDoc = VoucherSequenceEntity;
