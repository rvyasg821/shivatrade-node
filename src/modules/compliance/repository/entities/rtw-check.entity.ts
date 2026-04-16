import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { RTW_CHECK_TABLE } from '../../constants/compliance.entity.constant';
import { ENUM_RTW_CHECK_TYPE, ENUM_RTW_CHECK_RESULT } from '../../enums/compliance.enum';

@Entity(RTW_CHECK_TABLE)
export class RtwCheckEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    user_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    location_id: string;

    @Column({ type: 'uuid', nullable: true })
    immigration_record_id: string;

    @Column({ type: 'uuid', nullable: true })
    checked_by: string;

    @Column({ type: 'varchar', length: 50, default: ENUM_RTW_CHECK_TYPE.MANUAL })
    check_type: string;

    @Column({ type: 'date', nullable: false })
    check_date: string;

    @Column({ type: 'varchar', length: 20, default: ENUM_RTW_CHECK_RESULT.PENDING })
    result: string;

    @Column({ type: 'date', nullable: true })
    valid_from: string;

    @Column({ type: 'date', nullable: true })
    valid_until: string; // NULL = indefinite (British citizens)

    @Column({ type: 'simple-array', nullable: true })
    document_ids: string[]; // FK to documents table

    @Column({ type: 'varchar', length: 50, nullable: true })
    share_code_used: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    employer_checking_reference: string;

    @Column({ type: 'boolean', default: false })
    follow_up_required: boolean;

    @Column({ type: 'date', nullable: true })
    follow_up_date: string;

    @Column({ type: 'text', nullable: true })
    notes: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type RtwCheckDoc = RtwCheckEntity;
