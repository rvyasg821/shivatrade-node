import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';

export const CARD_COLLECTION_NAME = 'cards';

export enum ENUM_CARD_STATUS {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
}

@Entity(CARD_COLLECTION_NAME)
export class CardEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    user_id: string;

    @Column({ type: 'varchar', nullable: false, default: '' })
    gateway: string;

    @Column({ type: 'varchar', nullable: true, default: '' })
    token_id?: string;

    @Column({ type: 'varchar', nullable: true, default: '' })
    card_id?: string;

    @Column({ type: 'varchar', length: 100, nullable: false })
    holder_name: string;

    @Column({ type: 'varchar', nullable: true, default: '' })
    card_number?: string;

    @Column({ type: 'varchar', length: 4, nullable: false })
    last4: string;

    @Column({ type: 'varchar', nullable: false })
    expiry_month: string;

    @Column({ type: 'varchar', nullable: false })
    expiry_year: string;

    @Column({ type: 'jsonb', nullable: true, default: null })
    response?: Record<string, any>;

    @Index()
    @Column({ type: 'boolean', default: false })
    is_default: boolean;

    @Index()
    @Column({ type: 'boolean', default: true })
    status: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type CardDoc = CardEntity;
