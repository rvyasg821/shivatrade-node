import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';

export const AssessmentTableName = 'assessments';

@Entity(AssessmentTableName)
export class AssessmentEntity extends DatabaseObjectIdEntityBase {
    @Column({ type: 'varchar', length: 100, nullable: false })
    name: string;

    @Column({ type: 'varchar', nullable: true })
    description: string;

    @Column({ type: 'int', default: 0 })
    order: number;

    @Column({ type: 'boolean', default: false })
    show_score_calculation: boolean;

    @Column({ type: 'varchar', nullable: true })
    additional_description: string;

    @Index()
    @Column({ type: 'uuid', nullable: true, default: null })
    location_id?: string;

    @Column({ type: 'int', default: 1 })
    status: number;
}

export type AssessmentDoc = AssessmentEntity;
