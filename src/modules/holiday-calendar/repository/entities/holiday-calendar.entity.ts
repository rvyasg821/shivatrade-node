import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { HOLIDAY_CALENDAR_COLLECTION_NAME } from '../../constants/holiday-calendar.entity.constant';

@Entity(HOLIDAY_CALENDAR_COLLECTION_NAME)
export class HolidayCalendarEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    location_id: string; // NULL = company-wide

    @Column({ type: 'int', nullable: false })
    year: number;

    @Column({ type: 'varchar', length: 200, nullable: false })
    name: string;

    @Column({ type: 'boolean', default: false })
    is_default: boolean; // auto-generated (e.g. UK Bank Holidays)

    @Index()
    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type HolidayCalendarDoc = HolidayCalendarEntity;
