import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_STATE_STATUS } from '@modules/state/enums/state.enum';
import { STATE_COLLECTION_NAME } from '@modules/state/constants/state.entity.constant';

/**
 * State / province master, scoped to a country.
 *
 * Reference data, shared by every company — like `countries` and `port_master`,
 * there is no `company_id` here on purpose.
 *
 * `country_id` is stored as a plain uuid rather than a TypeORM relation: the
 * country master uses the ObjectId base with soft-delete, and a hard FK would
 * fight it. The service validates the country exists before writing.
 */
@Entity(STATE_COLLECTION_NAME)
@Index(['country_id', 'name'], { unique: true })
export class StateEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'varchar', length: 100, nullable: false })
    name: string;

    /** Local code — "GJ", "MH". Optional: many countries have no official code. */
    @Column({ type: 'varchar', length: 20, nullable: true })
    state_code?: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    country_id: string;

    /**
     * Denormalised ISO-2 of the parent, copied on write. The dropdowns filter by
     * country code (that is what address forms hold), and carrying it here saves
     * a join on every keystroke.
     */
    @Index()
    @Column({ type: 'varchar', length: 10, nullable: true })
    country_code?: string;

    @Index()
    @Column({
        type: 'varchar',
        nullable: false,
        default: ENUM_STATE_STATUS.ACTIVE,
    })
    status: ENUM_STATE_STATUS;
}

export type StateDoc = StateEntity;
