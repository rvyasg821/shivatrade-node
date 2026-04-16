import {
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from 'typeorm';

export class DatabaseObjectIdEntityBase {
    @PrimaryGeneratedColumn('uuid')
    _id: string;

    @Column({ type: 'boolean', default: false })
    @Index()
    deleted: boolean;

    @CreateDateColumn({ type: 'timestamptz' })
    @Index()
    createdAt: Date;

    @Column({ type: 'uuid', nullable: true })
    @Index()
    createdBy?: string;

    @UpdateDateColumn({ type: 'timestamptz' })
    @Index()
    updatedAt: Date;

    @Column({ type: 'uuid', nullable: true })
    @Index()
    updatedBy?: string;

    @Column({ type: 'timestamptz', nullable: true, default: null })
    @Index()
    deletedAt?: Date;

    @Column({ type: 'uuid', nullable: true })
    @Index()
    deletedBy?: string;
}
