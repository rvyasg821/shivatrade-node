import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';

export const OTPTableName = 'otps';

@Entity(OTPTableName)
export class OTPEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'varchar', length: 100, nullable: false })
    email: string;

    @Column({ type: 'varchar', nullable: false, select: false })
    otpHash: string;

    @Index()
    @Column({ type: 'timestamptz', nullable: false })
    expiresAt: Date;

    @Column({ type: 'int', default: 0 })
    attempts: number;
}

export type OTPDocument = OTPEntity;
export type OTPDoc = OTPDocument;
