import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_PORT_TYPE } from '@modules/port-master/enums/port-master.enum';
import { PORT_MASTER_COLLECTION_NAME } from '../../constants/port-master.entity.constant';

/**
 * Port master - shared across all companies (ICEGATE customs codes are nationwide).
 * Indian ports are seeded; foreign ports are admin-added as repeat destinations emerge.
 * Shipping + Invoice consume this via FK + jsonb snapshot pattern.
 */
@Entity(PORT_MASTER_COLLECTION_NAME)
export class PortMasterEntity extends DatabaseObjectIdEntityBase {
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 20, nullable: false })
    code: string;

    @Index()
    @Column({ type: 'varchar', length: 150, nullable: false })
    name: string;

    @Index()
    @Column({ type: 'varchar', length: 10, nullable: false })
    type: ENUM_PORT_TYPE;

    /** ISO 3166-1 alpha-2 country code. 'IN' for Indian customs ports. */
    @Index()
    @Column({ type: 'varchar', length: 2, nullable: false, default: 'IN' })
    country_code: string;

    /** Indian state for Indian ports; null for foreign. */
    @Column({ type: 'varchar', length: 80, nullable: true })
    state?: string;

    @Index()
    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type PortMasterDoc = PortMasterEntity;
