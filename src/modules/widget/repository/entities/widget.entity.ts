import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';

export const WidgetDatabaseName = 'widgets';

@Entity(WidgetDatabaseName)
export class WidgetEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    user_id: string;

    @Index()
    @Column({ type: 'varchar', nullable: false })
    slug: string;

    @Column({ type: 'int', default: 1 })
    order: number;

    @Column({ type: 'boolean', default: true })
    is_visible: boolean;

    @Index()
    @Column({ type: 'varchar', nullable: false })
    tool_slug: string;

    @Column({ type: 'boolean', default: true })
    status: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type WidgetDoc = WidgetEntity;
