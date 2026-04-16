import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { AssessmentEntity } from '@modules/assessment/repository/entities/assessment.entity';
import { AssessmentReportEntity } from '@modules/assessment/repository/entities/assessment-report.entity';
import { SectionEntity } from '@modules/assessment/repository/entities/section.entity';
import { QuestionEntity } from '@modules/assessment/repository/entities/question.entity';
import { QuestionAnswerEntity } from '@modules/assessment/repository/entities/question-answer.entity';
import { AssessmentRepository } from '@modules/assessment/repository/repositories/assessment.repository';
import { AssessmentReportRepository } from '@modules/assessment/repository/repositories/assessment-report.repository';
import { SectionRepository } from '@modules/assessment/repository/repositories/section.repository';
import { QuestionRepository } from '@modules/assessment/repository/repositories/question.repository';
import { QuestionAnswerRepository } from '@modules/assessment/repository/repositories/question-answer.repository';

@Module({
    providers: [
        AssessmentRepository,
        AssessmentReportRepository,
        SectionRepository,
        QuestionRepository,
        QuestionAnswerRepository,
    ],
    exports: [
        AssessmentRepository,
        AssessmentReportRepository,
        SectionRepository,
        QuestionRepository,
        QuestionAnswerRepository,
    ],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [
                AssessmentEntity,
                AssessmentReportEntity,
                SectionEntity,
                QuestionEntity,
                QuestionAnswerEntity,
            ],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class AssessmentRepositoryModule {}
