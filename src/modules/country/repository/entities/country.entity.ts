import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_COUNTRY_STATUS } from '@modules/country/enums/country.enum';

export const CountryTableName = 'countries';

@Entity(CountryTableName)
export class CountryEntity extends DatabaseObjectIdEntityBase {
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 100, nullable: false })
    name: string;

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 100, nullable: false })
    slug: string;

    @Column({ type: 'varchar', length: 20, nullable: false })
    currency_code: string;

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 10, nullable: false })
    country_code: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    time_zone?: string;

    @Index()
    @Column({ type: 'varchar', nullable: false, default: ENUM_COUNTRY_STATUS.ACTIVE })
    status: ENUM_COUNTRY_STATUS;
}

export type CountryDoc = CountryEntity;
