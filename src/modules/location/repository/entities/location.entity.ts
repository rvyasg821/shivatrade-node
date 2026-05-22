import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_LOCATION_STATUS } from '@modules/location/enums/location.enum';
import { LOCATION_COLLECTION_NAME } from '../../constants/location.entity.constant';

/**
 * Business hours for a specific day
 */
export interface IBusinessHours {
    open: string;  // "09:00"
    close: string; // "17:00"
    is_closed: boolean;
}

/**
 * Weekly business hours
 */
export interface IWeeklyBusinessHours {
    monday: IBusinessHours;
    tuesday: IBusinessHours;
    wednesday: IBusinessHours;
    thursday: IBusinessHours;
    friday: IBusinessHours;
    saturday: IBusinessHours;
    sunday: IBusinessHours;
}

@Entity(LOCATION_COLLECTION_NAME)
export class LocationEntity extends DatabaseObjectIdEntityBase {
    // ============ REFERENCES ============
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    // ============ BASIC INFORMATION ============
    @Column({ type: 'varchar', length: 200, nullable: false })
    location_name: string;

    @Index()
    @Column({ type: 'varchar', length: 50, nullable: false })
    location_code: string; // "HQ001", "ST001" - unique per company

    @Column({ type: 'varchar', length: 500, nullable: true })
    description?: string;

    // ============ CONTACT INFORMATION ============
    @Column({ type: 'varchar', length: 200, nullable: false })
    contact_name: string;

    @Column({ type: 'varchar', length: 200, nullable: false })
    email: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    mobile?: string;

    /** Stores the full phone-input metadata so the formatted display
     *  string (`internationalNumber` / `nationalNumber`) can be rendered
     *  without re-parsing `mobile`. */
    @Column({ type: 'jsonb', nullable: true, default: null })
    country_code?: {
        code?: string;
        countryCode?: string;
        dialCode?: string;
        name?: string;
        number?: string;
        nationalNumber?: string;
        internationalNumber?: string;
        country_flag?: string;
        format?: string;
    };

    @Column({ type: 'varchar', length: 50, nullable: true })
    phone?: string; // Landline

    // ============ ADDRESS ============
    @Column({ type: 'varchar', length: 200, nullable: true })
    address_line1?: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    address_line2?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    city?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    state?: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    postcode?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    country?: string;

    // ============ GPS COORDINATES ============
    @Column({ type: 'float', nullable: true, default: null })
    latitude?: number;

    @Column({ type: 'float', nullable: true, default: null })
    longitude?: number;

    // ============ LOCATION SETTINGS ============
    @Column({ type: 'varchar', nullable: true, default: 'Europe/London' })
    timezone?: string;

    @Column({ type: 'varchar', length: 3, nullable: true, default: 'GBP' })
    currency?: string;

    @Column({ type: 'jsonb', nullable: true, default: null })
    business_hours?: IWeeklyBusinessHours;

    // ============ NOTIFICATION SETTINGS ============
    @Column({ type: 'varchar', length: 200, nullable: true })
    notification_email: string; // Primary email for admin notifications (defaults to location email)

    @Column({ type: 'boolean', default: false })
    cc_company_admin: boolean; // Also CC the company admin on notifications

    @Column({ type: 'varchar', length: 200, nullable: true })
    notification_email_cc: string; // Optional additional CC email (e.g., HR team)

    // ============ STATUS & FLAGS ============
    @Index()
    @Column({ type: 'boolean', default: false })
    is_default: boolean; // First location created for a company

    @Index()
    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({ type: 'varchar', nullable: false, default: ENUM_LOCATION_STATUS.ACTIVE })
    status: ENUM_LOCATION_STATUS;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type LocationDoc = LocationEntity;
