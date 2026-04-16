import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { SettingJson } from '@modules/setting/interfaces/setting.interface';

export const SettingFeatureTableName = 'setting_features';

@Entity(SettingFeatureTableName)
export class SettingFeatureEntity extends DatabaseObjectIdEntityBase {
    @Index({ unique: true })
    @Column({ type: 'varchar', nullable: false })
    key: string;

    @Column({ type: 'varchar', nullable: false })
    description: string;

    @Column({ type: 'jsonb', nullable: false })
    value: SettingJson;
}

export type SettingFeatureDoc = SettingFeatureEntity;
