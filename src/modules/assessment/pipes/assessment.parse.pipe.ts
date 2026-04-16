import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { ENUM_ASSESSMENT_STATUS_CODE_ERROR } from '@modules/assessment/enums/assessment.status-code.enum';
import { AssessmentDoc } from '@modules/assessment/repository/entities/assessment.entity';
import { AssessmentService } from '@modules/assessment/services/assessment.service';

@Injectable()
export class AssessmentParsePipe implements PipeTransform {
    constructor(private readonly assessmentService: AssessmentService) {}

    async transform(value: string): Promise<AssessmentDoc> {
        const assessment: AssessmentDoc = await this.assessmentService.findOneById(value);
        if (!assessment) {
            throw new NotFoundException({
                statusCode: ENUM_ASSESSMENT_STATUS_CODE_ERROR.ASSESSMENT_NOT_FOUND_ERROR,
                message: 'assessment.error.notFound',
            });
        }

        return assessment;
    }
}