import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { ENUM_ASSESSMENT_STATUS_CODE_ERROR } from '@modules/assessment/enums/assessment.status-code.enum';
import { AssessmentReportDoc } from '@modules/assessment/repository/entities/assessment-report.entity';
import { AssessmentReportService } from '@modules/assessment/services/assessment-report.service';

@Injectable()
export class AssessmentReportParsePipe implements PipeTransform {
    constructor(private readonly assessmentReportService: AssessmentReportService) {}

    async transform(value: string): Promise<AssessmentReportDoc> {
        const assessmentReport: AssessmentReportDoc = await this.assessmentReportService.findOneById(value);
        if (!assessmentReport) {
            throw new NotFoundException({
                statusCode: ENUM_ASSESSMENT_STATUS_CODE_ERROR.ASSESSMENT_REPORT_NOT_FOUND_ERROR,
                message: 'assessment.report.error.notFound',
            });
        }

        return assessmentReport;
    }
}