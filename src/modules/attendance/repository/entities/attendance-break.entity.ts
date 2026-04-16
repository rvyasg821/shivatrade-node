import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ATTENDANCE_BREAK_TABLE } from '../../constants/attendance.entity.constant';
import { ENUM_BREAK_TYPE } from '../../enums/attendance.enum';

@Entity(ATTENDANCE_BREAK_TABLE)
export class AttendanceBreakEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    attendance_id: string;

    @Column({ type: 'timestamptz', nullable: false })
    start_time: Date;

    @Column({ type: 'timestamptz', nullable: true })
    end_time: Date;

    @Column({ type: 'int', nullable: true })
    duration_minutes: number;

    @Column({ type: 'varchar', length: 20, default: ENUM_BREAK_TYPE.SHORT })
    type: string;
}

export type AttendanceBreakDoc = AttendanceBreakEntity;
