import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_RESET_PASSWORD_TYPE } from '@modules/reset-password/enums/reset-password.enum';

export const ResetPasswordTableName = 'reset_passwords';

@Entity(ResetPasswordTableName)
export class ResetPasswordEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    user: string;

    @Column({ type: 'varchar', nullable: false })
    to: string;

    @Column({ type: 'varchar', length: 6, nullable: false })
    otp: string;

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 20, nullable: false })
    token: string;

    @Index()
    @Column({ type: 'varchar', nullable: false })
    type: ENUM_RESET_PASSWORD_TYPE;

    @Column({ type: 'timestamptz', nullable: false })
    expiredDate: Date;

    @Column({ type: 'timestamptz', nullable: true })
    resetDate?: Date;

    @Column({ type: 'timestamptz', nullable: true })
    verifyDate?: Date;

    @Index()
    @Column({ type: 'boolean', default: false })
    isReset: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    isActive: boolean;

    @Index()
    @Column({ type: 'varchar', nullable: false })
    reference: string;
}

export type ResetPasswordDoc = ResetPasswordEntity;
