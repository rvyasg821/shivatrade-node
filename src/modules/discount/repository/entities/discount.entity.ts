import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';

export const DiscountDatabaseName = 'discounts';

export enum ENUM_DISCOUNT_TYPE {
    VALUE = 'value',
    PERCENTAGE = 'percentage',
}

export enum ENUM_DISCOUNT_STATUS {
    INACTIVE = 0,
    ACTIVE = 1,
}

export enum ENUM_DURATION_TYPE {
    FOREVER = 'forever',
    FIRST_PAYMENT = 'first_payment',
    LIMITED_MONTHS = 'limited_months',
}

export enum ENUM_LOCATION_RULE_TYPE {
    ANY = 'any',
    EXACT = 'exact',
    MINIMUM = 'minimum',
    MAXIMUM = 'maximum',
    RANGE = 'range',
}

export interface ILocationRule {
    type: ENUM_LOCATION_RULE_TYPE;
    value?: number;
    min?: number;
    max?: number;
}

@Entity(DiscountDatabaseName)
export class DiscountEntity extends DatabaseObjectIdEntityBase {
    @Column({ type: 'varchar', nullable: false })
    name: string;

    @Column({ type: 'varchar', nullable: false })
    discount_type: ENUM_DISCOUNT_TYPE;

    @Column({ type: 'float', default: 0 })
    discount_value: number;

    @Index({ unique: true })
    @Column({ type: 'varchar', nullable: false })
    discount_code: string;

    @Column({ type: 'varchar', nullable: true, default: '' })
    description?: string;

    @Column({ type: 'int', default: 0 })
    max_occurances?: number;

    @Column({ type: 'timestamptz', nullable: true, default: null })
    start_date?: Date;

    @Column({ type: 'timestamptz', nullable: true, default: null })
    end_date?: Date;

    @Column({ type: 'int', default: ENUM_DISCOUNT_STATUS.ACTIVE })
    status: ENUM_DISCOUNT_STATUS;

    @Column({ type: 'boolean', default: false })
    is_expired: boolean;

    // ============ DURATION CONTROL ============
    @Column({ type: 'varchar', nullable: true, default: ENUM_DURATION_TYPE.FOREVER })
    duration_type: ENUM_DURATION_TYPE;

    @Column({ type: 'int', nullable: true, default: null })
    duration_months?: number;

    // ============ LOCATION RULES ============
    @Column({ type: 'jsonb', default: [] })
    location_rules: ILocationRule[];

    @Column({ type: 'timestamptz', nullable: true, default: null })
    deletedAt?: Date;
}

export type DiscountDoc = DiscountEntity;
