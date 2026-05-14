import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import {
    ENUM_REBATE_STATUS,
    ENUM_REBATE_TYPE,
} from '@modules/rebate/enums/rebate.enum';
import { REBATE_COLLECTION_NAME } from '../../constants/rebate.entity.constant';

@Entity(REBATE_COLLECTION_NAME)
export class RebateEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    @Index()
    @Column({ type: 'varchar', length: 150, nullable: false })
    name: string;

    @Index()
    @Column({ type: 'varchar', length: 30, nullable: false })
    code: string;

    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_REBATE_TYPE.PERCENT,
    })
    type: ENUM_REBATE_TYPE;

    @Column({ type: 'numeric', precision: 14, scale: 2, nullable: false })
    pct: string;

    @Index()
    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({
        type: 'varchar',
        nullable: false,
        default: ENUM_REBATE_STATUS.ACTIVE,
    })
    status: ENUM_REBATE_STATUS;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type RebateDoc = RebateEntity;
