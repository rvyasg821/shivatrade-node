import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { HOLIDAY_COLLECTION_NAME } from '../../constants/holiday-calendar.entity.constant';
import { ENUM_HOLIDAY_TYPE } from '../../enums/holiday-calendar.enum';

@Entity(HOLIDAY_COLLECTION_NAME)
export class HolidayEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    calendar_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'varchar', length: 200, nullable: false })
    name: string;

    @Index()
    @Column({ type: 'date', nullable: false })
    date: string;

    @Column({ type: 'varchar', length: 50, default: ENUM_HOLIDAY_TYPE.COMPANY_HOLIDAY })
    type: string;

    @Column({ type: 'boolean', default: false })
    is_recurring: boolean;

    @Column({ type: 'text', nullable: true })
    notes: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type HolidayDoc = HolidayEntity;
