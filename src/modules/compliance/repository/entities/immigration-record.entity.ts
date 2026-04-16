import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { IMMIGRATION_RECORD_TABLE } from '../../constants/compliance.entity.constant';
import { ENUM_IMMIGRATION_STATUS, ENUM_IMMIGRATION_RECORD_STATUS } from '../../enums/compliance.enum';

@Entity(IMMIGRATION_RECORD_TABLE)
export class ImmigrationRecordEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    user_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    location_id: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    visa_type: string; // Skilled Worker, Student, ILR, British Citizen, etc.

    @Column({ type: 'varchar', length: 50, default: ENUM_IMMIGRATION_STATUS.VISA_HOLDER })
    immigration_status: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    brp_number: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    share_code: string;

    @Column({ type: 'date', nullable: true })
    visa_start_date: string;

    @Column({ type: 'date', nullable: true })
    visa_expiry_date: string;

    @Column({ type: 'text', nullable: true })
    work_restriction: string; // e.g. "20 hours/week during term"

    @Column({ type: 'boolean', default: false })
    is_sponsored: boolean;

    @Column({ type: 'varchar', length: 50, nullable: true })
    cos_number: string;

    @Column({ type: 'date', nullable: true })
    cos_start_date: string;

    @Column({ type: 'date', nullable: true })
    cos_expiry_date: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    sponsor_license_number: string;

    @Column({ type: 'date', nullable: true })
    last_rtw_check_date: string;

    @Column({ type: 'date', nullable: true })
    next_rtw_check_date: string;

    @Column({ type: 'varchar', length: 30, default: ENUM_IMMIGRATION_RECORD_STATUS.ACTIVE })
    status: string;

    @Column({ type: 'text', nullable: true })
    notes: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type ImmigrationRecordDoc = ImmigrationRecordEntity;
