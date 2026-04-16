import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_EMPLOYEE_GENDER } from '@modules/employee/enums/employee.enum';
import { EMPLOYEE_COLLECTION_NAME } from '../../constants/employee.entity.constant';

@Entity(EMPLOYEE_COLLECTION_NAME)
export class EmployeeEntity extends DatabaseObjectIdEntityBase {
    // ============ REFERENCES ============
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    location_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    // ============ BASIC INFORMATION ============
    @Column({ type: 'varchar', length: 100, nullable: false })
    first_name: string;

    @Column({ type: 'varchar', length: 100, nullable: false })
    last_name: string;

    @Index()
    @Column({ type: 'varchar', length: 200, nullable: false })
    email: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    mobile?: string;

    @Column({ type: 'jsonb', nullable: true, default: null })
    country_code?: {
        dial_code: string;
        country_code: string;
    };

    @Index()
    @Column({ type: 'varchar', length: 50, nullable: false })
    employee_code: string;

    @Column({ type: 'varchar', length: 100, nullable: false })
    designation: string;

    @Column({ type: 'varchar', length: 100, nullable: false })
    department: string;

    @Column({ type: 'timestamptz', nullable: false })
    date_of_joining: Date;

    @Column({ type: 'timestamptz', nullable: true })
    date_of_birth?: Date;

    @Column({ type: 'varchar', nullable: false })
    gender: ENUM_EMPLOYEE_GENDER;

    // ============ ADDRESS ============
    @Column({ type: 'varchar', length: 200, nullable: true })
    address_1?: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    address_2?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    city?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    state?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    country?: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    zip_code?: string;

    // ============ STATUS & FLAGS ============
    @Index()
    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;

    @Column({ type: 'timestamptz', nullable: true })
    deleted_at?: Date;
}

export type EmployeeDoc = EmployeeEntity;
