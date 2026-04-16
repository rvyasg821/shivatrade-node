import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';

export const ActivityTableName = 'activities';

@Entity(ActivityTableName)
export class ActivityEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    user: string;

    @Column({ type: 'varchar', nullable: false })
    description: string;

    @Column({ type: 'uuid', nullable: false })
    by: string;
}

export type ActivityDoc = ActivityEntity;
