import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_CITY_STATUS } from '@modules/city/enums/city.enum';
import { CITY_COLLECTION_NAME } from '@modules/city/constants/city.entity.constant';

/**
 * City master, scoped to a state (and, denormalised, to that state's country).
 *
 * Shared reference data, no `company_id` — same as `states` and `countries`.
 * Ships EMPTY: there is no city list worth seeding, so the client enters the
 * ones they actually ship to. That is why the address forms still accept a
 * typed value rather than forcing a pick from this table.
 */
@Entity(CITY_COLLECTION_NAME)
@Index(['state_id', 'name'], { unique: true })
export class CityEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'varchar', length: 100, nullable: false })
    name: string;

    /** Optional local code — most cities have none. */
    @Column({ type: 'varchar', length: 20, nullable: true })
    city_code?: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    state_id: string;

    /**
     * Copied from the parent state on write. Lets the country → city dropdown
     * filter without joining through `states` on every keystroke.
     */
    @Index()
    @Column({ type: 'uuid', nullable: false })
    country_id: string;

    @Index()
    @Column({
        type: 'varchar',
        nullable: false,
        default: ENUM_CITY_STATUS.ACTIVE,
    })
    status: ENUM_CITY_STATUS;
}

export type CityDoc = CityEntity;
