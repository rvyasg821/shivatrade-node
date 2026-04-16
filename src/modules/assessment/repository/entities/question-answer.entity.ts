import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';

export const QuestionAnswerTableName = 'question_answers';

@Entity(QuestionAnswerTableName)
export class QuestionAnswerEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: true })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    asessment_report_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    user_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    section_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    question_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    parent_question_id: string;

    @Column({ type: 'jsonb', nullable: true, default: null })
    question_data: object;

    @Column({ type: 'varchar', nullable: true })
    value: string;

    @Column({ type: 'int', default: 1 })
    status: number;
}

export type QuestionAnswerDoc = QuestionAnswerEntity;
