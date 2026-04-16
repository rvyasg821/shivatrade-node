import {
    CanActivate,
    ExecutionContext,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { IRequestApp } from '@common/request/interfaces/request.interface';
import { AssessmentService } from '@modules/assessment/services/assessment.service';
import { ENUM_ASSESSMENT_STATUS_CODE_ERROR } from '@modules/assessment/enums/assessment.status-code.enum';
import { IRequestAssessmentApp } from '@modules/assessment/interfaces/assessment.interface';

@Injectable()
export class AssessmentNotFoundGuard implements CanActivate {
    constructor(private readonly assessmentService: AssessmentService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<IRequestApp & IRequestAssessmentApp>();
        const { params } = request;
        const { assessment } = params;

        const check = await this.assessmentService.findOneById(assessment as string);
        if (!check) {
            throw new NotFoundException({
                statusCode:
                    ENUM_ASSESSMENT_STATUS_CODE_ERROR.ASSESSMENT_NOT_FOUND_ERROR,
                message: 'assessment.error.notFound',
            });
        }

        request.__assessment = check;

        return true;
    }
}