import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';

export const CompanyLookupTableName = 'company_lookups';

@Entity(CompanyLookupTableName)
@Index(['companyId', 'type', 'name'], { unique: true })
export class CompanyLookupEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'varchar', length: 100, nullable: false })
    companyId: string;

    @Index()
    @Column({ type: 'varchar', length: 50, nullable: false })
    type: string; // 'designation' | 'department' | extensible

    @Column({ type: 'varchar', length: 150, nullable: false })
    name: string;

    @Column({ type: 'boolean', default: true })
    isActive: boolean;
}

export type CompanyLookupDoc = CompanyLookupEntity;
