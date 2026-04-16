import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';

export const SharedUserTableName = 'sharedusers';

export enum ENUM_SHARED_USER_TYPE {
    ADMIN = 'Admin',
    COMPANY_ADMIN = 'Company Admin',
    TENANT_USER = 'Tenant User',
}

@Entity(SharedUserTableName)
export class SharedUserEntity extends DatabaseObjectIdEntityBase {
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 100, nullable: false })
    email: string;

    @Column({ type: 'varchar', nullable: false, select: false })
    password: string;

    @Index()
    @Column({ type: 'varchar', nullable: true, default: null })
    tenantId: string | null;

    @Index()
    @Column({ type: 'varchar', nullable: true, default: null })
    companyId: string | null;

    @Index()
    @Column({ type: 'varchar', nullable: false })
    userType: ENUM_SHARED_USER_TYPE;

    @Index()
    @Column({ type: 'varchar', nullable: true, default: null })
    originalUserId: string | null;
}

export type SharedUserDoc = SharedUserEntity;
