import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { ATTENDANCE_RECORD_TABLE } from '../../constants/attendance.entity.constant';
import { ENUM_ATTENDANCE_STATUS, ENUM_ATTENDANCE_SOURCE } from '../../enums/attendance.enum';

@Entity(ATTENDANCE_RECORD_TABLE)
@Unique(['user_id', 'date'])
export class AttendanceRecordEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    user_id: string;

    @Column({ type: 'uuid', nullable: true })
    location_id: string;

    @Index()
    @Column({ type: 'date', nullable: false })
    date: string;

    @Column({ type: 'timestamptz', nullable: true })
    clock_in: Date;

    @Column({ type: 'timestamptz', nullable: true })
    clock_out: Date;

    @Column({ type: 'jsonb', nullable: true })
    clock_in_face_descriptor: any; // TensorFlow.js face descriptor

    @Column({ type: 'jsonb', nullable: true })
    clock_out_face_descriptor: any;

    @Column({ type: 'jsonb', nullable: true })
    clock_in_gps: any; // { lat, lng }

    @Column({ type: 'jsonb', nullable: true })
    clock_out_gps: any;

    @Column({ type: 'float', default: 0 })
    total_hours: number;

    @Column({ type: 'float', default: 0 })
    regular_hours: number;

    @Column({ type: 'float', default: 0 })
    overtime_hours: number;

    @Column({ type: 'int', default: 0 })
    break_minutes: number;

    @Column({ type: 'varchar', length: 20, default: ENUM_ATTENDANCE_STATUS.PRESENT })
    status: string;

    @Column({ type: 'boolean', default: false })
    is_late: boolean;

    @Column({ type: 'boolean', default: false })
    is_early_leave: boolean;

    @Column({ type: 'varchar', length: 20, default: ENUM_ATTENDANCE_SOURCE.WEB })
    source: string;

    @Column({ type: 'text', nullable: true })
    notes: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type AttendanceRecordDoc = AttendanceRecordEntity;
