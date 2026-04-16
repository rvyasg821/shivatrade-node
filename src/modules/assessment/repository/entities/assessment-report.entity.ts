import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';

export const AssessmentReportTableName = 'assessment_reports';

@Entity(AssessmentReportTableName)
export class AssessmentReportEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    assessment_id: string;

    @Column({ type: 'jsonb', nullable: true, default: null })
    assessment_data: object;

    @Column({ type: 'jsonb', default: [] })
    group_data: Array<any>;

    @Column({ type: 'varchar', length: 100, nullable: true })
    name: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    first_name: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    last_name: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    company_name: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    email: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    mobile: string;

    @Column({ type: 'varchar', nullable: true, select: false })
    email_code: string;

    @Column({ type: 'varchar', length: 100, nullable: true, default: null })
    secondary_email: string;

    @Column({ type: 'varchar', nullable: true, default: null, select: false })
    secondary_email_code: string;

    @Column({ type: 'varchar', nullable: true, select: false })
    mobile_code: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    business_type: string;

    @Column({ type: 'int', default: 0 })
    team_size: number;

    @Column({ type: 'varchar', nullable: true })
    operation_description: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    address1: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    address2: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    city: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    state: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    country: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    zipcode: string;

    @Column({ type: 'int', default: 0 })
    total: number;

    @Column({ type: 'int', default: 0 })
    pass: number;

    @Column({ type: 'int', default: 0 })
    fail: number;

    @Column({ type: 'int', default: 0 })
    invalid: number;

    @Column({ type: 'int', default: 0 })
    score: number;

    @Column({ type: 'varchar', nullable: true })
    pdf_path: string;

    @Column({ type: 'boolean', default: false })
    email_verified: boolean;

    @Column({ type: 'boolean', default: false })
    mobile_verified: boolean;

    @Index()
    @Column({ type: 'uuid', nullable: true, default: null })
    location_id?: string;

    @Column({ type: 'int', default: 1 })
    status: number;
}

export type AssessmentReportDoc = AssessmentReportEntity;
