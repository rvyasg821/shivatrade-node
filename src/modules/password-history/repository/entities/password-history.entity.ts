import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_PASSWORD_HISTORY_TYPE } from '@modules/password-history/enums/password-history.enum';

export const PasswordHistoryTableName = 'password_histories';

@Entity(PasswordHistoryTableName)
export class PasswordHistoryEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    user: string;

    @Column({ type: 'varchar', nullable: false })
    password: string;

    @Column({ type: 'varchar', nullable: false })
    type: ENUM_PASSWORD_HISTORY_TYPE;

    @Column({ type: 'timestamptz', nullable: false })
    expiredAt: Date;

    @Column({ type: 'uuid', nullable: false })
    by: string;
}

export type PasswordHistoryDoc = PasswordHistoryEntity;
