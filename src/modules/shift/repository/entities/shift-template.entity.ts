import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { SHIFT_TEMPLATE_TABLE } from '../../constants/shift.entity.constant';

@Entity(SHIFT_TEMPLATE_TABLE)
export class ShiftTemplateEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: true, default: null })
    location_id: string | null; // NULL = company-wide, UUID = location-specific

    @Column({ type: 'varchar', length: 200, nullable: false })
    name: string;

    @Column({ type: 'varchar', length: 20, nullable: false })
    code: string;

    @Column({ type: 'time', nullable: false })
    start_time: string; // HH:MM:SS

    @Column({ type: 'time', nullable: false })
    end_time: string;

    @Column({ type: 'int', default: 0 })
    break_minutes: number;

    @Column({ type: 'varchar', length: 7, nullable: true })
    color: string; // hex color e.g. #3b82f6

    @Column({ type: 'boolean', default: false })
    is_overnight: boolean; // spans midnight

    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type ShiftTemplateDoc = ShiftTemplateEntity;
