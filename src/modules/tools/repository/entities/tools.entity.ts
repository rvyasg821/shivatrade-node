import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_TOOLS_STATUS } from '../../enums/tools.enum';
import { TOOLS_COLLECTION_NAME } from '../../constants/tools.entity.constant';

// Define interfaces for embedded documents
interface IToolSetting {
    setting_id: string;
    name: string;
    description: string;
    type: string;
    value: string;
    toolType: string;
    slug: string;
    ipAddressOrUrl: string;
    port: string;
    username: string;
    password: string;
    soft_delete: boolean;
    deleted: boolean;
    cron_schedules: ICronSchedule[];
}

interface ICronSchedule {
    cron_id: string;
    name: string;
    expression: string;
    timezone: string;
    type: string;
    active: boolean;
    soft_delete: boolean;
    deleted: boolean;
}

interface IToolWidget {
    slug: string;
    name: string;
    order: number;
    is_visible: boolean;
}

@Entity(TOOLS_COLLECTION_NAME)
export class ToolsEntity extends DatabaseObjectIdEntityBase {
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 100, nullable: false })
    name: string;

    @Column({ type: 'varchar', length: 500, nullable: false })
    description: string;

    @Index()
    @Column({ type: 'int', nullable: false, default: ENUM_TOOLS_STATUS.ACTIVE })
    status: ENUM_TOOLS_STATUS;

    @Index()
    @Column({ type: 'varchar', length: 100, nullable: false })
    slug: string;

    @Index()
    @Column({ type: 'int', default: 0 })
    displayOrder: number;

    @Column({ type: 'jsonb', default: [] })
    settings: IToolSetting[];

    @Column({ type: 'jsonb', default: [] })
    widgets: IToolWidget[];

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type ToolsDoc = ToolsEntity;
