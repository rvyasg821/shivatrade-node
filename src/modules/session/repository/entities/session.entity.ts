import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_SESSION_STATUS } from '@modules/session/enums/session.enum';

export const SessionTableName = 'sessions';

@Entity(SessionTableName)
export class SessionEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'varchar', nullable: false, default: ENUM_SESSION_STATUS.ACTIVE })
    status: ENUM_SESSION_STATUS;

    @Column({ type: 'timestamptz', nullable: true })
    revokeAt?: Date;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    user: string;

    @Column({ type: 'varchar', nullable: false })
    ip: string;

    @Column({ type: 'varchar', nullable: false })
    hostname: string;

    @Column({ type: 'varchar', nullable: false })
    protocol: string;

    @Column({ type: 'varchar', nullable: false })
    originalUrl: string;

    @Column({ type: 'varchar', nullable: false })
    method: string;

    @Column({ type: 'varchar', nullable: true })
    userAgent?: string;

    @Column({ type: 'varchar', nullable: true })
    xForwardedFor?: string;

    @Column({ type: 'varchar', nullable: true })
    xForwardedHost?: string;

    @Column({ type: 'varchar', nullable: true })
    xForwardedPorto?: string;

    @Column({ type: 'timestamptz', nullable: false })
    expiredAt: Date;
}

export type SessionDoc = SessionEntity;
