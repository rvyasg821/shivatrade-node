import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { EMPLOYEE_LOCATION_ASSIGNMENT_COLLECTION_NAME } from '../../constants/employee.entity.constant';

@Entity(EMPLOYEE_LOCATION_ASSIGNMENT_COLLECTION_NAME)
@Index(['employee_id', 'location_id'], { unique: true })
export class EmployeeLocationAssignmentEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    employee_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    location_id: string;

    @Column({ type: 'timestamptz', nullable: true })
    start_date?: Date;

    @Column({ type: 'timestamptz', nullable: true })
    end_date?: Date;

    @Column({ type: 'boolean', default: true })
    is_active: boolean;
}
