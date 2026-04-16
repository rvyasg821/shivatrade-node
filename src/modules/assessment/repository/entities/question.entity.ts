import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';

export const QuestionTableName = 'questions';

@Entity(QuestionTableName)
export class QuestionEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    assessment_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    section_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    parent_question_id: string;

    @Column({ type: 'boolean', default: false })
    is_child: boolean;

    @Column({ type: 'varchar', nullable: false })
    question: string;

    @Column({ type: 'varchar', nullable: true })
    description: string;

    @Column({ type: 'varchar', length: 50, nullable: false })
    option_type: string;

    @Column({ type: 'jsonb', default: [] })
    options: Array<any>;

    @Column({ type: 'varchar', nullable: true })
    value: string;

    @Column({ type: 'boolean', default: false })
    is_mandatory: boolean;

    @Column({ type: 'int', default: 0 })
    point: number;

    @Column({ type: 'int', default: 0 })
    order: number;

    @Column({ type: 'int', default: 1 })
    status: number;
}

export type QuestionDoc = QuestionEntity;
