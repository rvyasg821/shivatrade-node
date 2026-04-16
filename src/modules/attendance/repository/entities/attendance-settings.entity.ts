import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { ATTENDANCE_SETTINGS_TABLE } from '../../constants/attendance.entity.constant';

@Entity(ATTENDANCE_SETTINGS_TABLE)
@Unique(['company_id', 'location_id'])
export class AttendanceSettingsEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    location_id: string; // NULL = company-wide default

    @Column({ type: 'boolean', default: false })
    face_capture_enabled: boolean;

    @Column({ type: 'float', default: 0.6 })
    face_match_threshold: number; // Euclidean distance threshold (lower = stricter)

    @Column({ type: 'boolean', default: false })
    gps_enabled: boolean;

    @Column({ type: 'int', nullable: true })
    geofence_radius_meters: number;

    @Column({ type: 'float', nullable: true })
    geofence_lat: number;

    @Column({ type: 'float', nullable: true })
    geofence_lng: number;

    @Column({ type: 'boolean', default: false })
    auto_clock_out_enabled: boolean;

    @Column({ type: 'time', nullable: true })
    auto_clock_out_time: string; // e.g. '18:00'

    @Column({ type: 'boolean', default: false })
    break_tracking_enabled: boolean;

    @Column({ type: 'boolean', default: false })
    overtime_enabled: boolean;

    @Column({ type: 'float', default: 8 })
    overtime_threshold_hours: number;

    @Column({ type: 'float', default: 1.5 })
    overtime_multiplier: number;

    @Column({ type: 'int', default: 15 })
    late_threshold_minutes: number;

    @Column({ type: 'int', default: 15 })
    early_leave_threshold_minutes: number;
}

export type AttendanceSettingsDoc = AttendanceSettingsEntity;
