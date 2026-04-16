import { Module, forwardRef } from '@nestjs/common';
import { AssessmentRepositoryModule } from '@modules/assessment/repository/assessment.repository.module';
import { AssessmentService } from '@modules/assessment/services/assessment.service';
import { AssessmentReportService } from '@modules/assessment/services/assessment-report.service';
import { SectionService } from '@modules/assessment/services/section.service';
import { QuestionService } from '@modules/assessment/services/question.service';
import { QuestionAnswerService } from '@modules/assessment/services/question-answer.service';
import { PdfGeneratorService } from '@modules/assessment/services/pdf-generator.service';

@Module({
    imports: [
        forwardRef(() => AssessmentRepositoryModule),
    ],
    exports: [
        AssessmentService,
        AssessmentReportService,
        SectionService,
        QuestionService,
        QuestionAnswerService,
        PdfGeneratorService,
    ],
    providers: [
        AssessmentService,
        AssessmentReportService,
        SectionService,
        QuestionService,
        QuestionAnswerService,
        PdfGeneratorService,
    ],
    controllers: [],
})
export class AssessmentModule { }