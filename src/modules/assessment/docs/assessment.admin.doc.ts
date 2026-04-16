import { HttpStatus, applyDecorators } from '@nestjs/common';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';
import {
    Doc,
    DocAuth,
    DocRequest,
    DocGuard,
    DocResponse,
    DocResponsePaging,
} from '@common/doc/decorators/doc.decorator';
import { ENUM_DOC_REQUEST_BODY_TYPE } from '@common/doc/enums/doc.enum';
import {
    AssessmentDocParamsId,
    AssessmentReportDocParamsId,
    SectionDocParamsId,
    QuestionDocParamsId,
    QuestionAnswerDocParamsId,
    AssessmentDocQueryStatus,
} from '@modules/assessment/constants/assessment.doc.constant';
import { AssessmentCreateDto } from '@modules/assessment/dtos/assessment.create.dto';
import { AssessmentUpdateDto } from '@modules/assessment/dtos/assessment.update.dto';
import { AssessmentResponseDto } from '@modules/assessment/dtos/assessment.response.dto';
import { AssessmentListResponseDto } from '@modules/assessment/dtos/assessment.list.response.dto';
import { AssessmentReportCreateDto } from '@modules/assessment/dtos/assessment-report.create.dto';
import { AssessmentReportUpdateDto } from '@modules/assessment/dtos/assessment-report.update.dto';
import { SectionCreateDto } from '@modules/assessment/dtos/section.create.dto';
import { SectionUpdateDto } from '@modules/assessment/dtos/section.update.dto';
import { QuestionCreateDto } from '@modules/assessment/dtos/question.create.dto';
import { QuestionUpdateDto } from '@modules/assessment/dtos/question.update.dto';
import { QuestionAnswerCreateDto } from '@modules/assessment/dtos/question-answer.create.dto';
import { QuestionAnswerUpdateDto } from '@modules/assessment/dtos/question-answer.update.dto';
import { SectionOrderUpdateDto } from '@modules/assessment/dtos/section-order-update.dto';
import { QuestionOrderUpdateDto } from '@modules/assessment/dtos/question-order-update.dto';
import { SectionOrderResponseDto } from '@modules/assessment/dtos/section-order-response.dto';
import { QuestionOrderResponseDto } from '@modules/assessment/dtos/question-order-response.dto';
import { SectionOrderListResponseDto } from '../dtos/section-order-list-response.dto';
import { QuestionOrderListResponseDto } from '../dtos/question-order-list-response.dto';
import { SectionDropdownListDto } from '@modules/assessment/dtos/section-dropdown-list.dto';
import { SectionDocParamsIdString } from '@modules/assessment/constants/assessment.doc.constant';

export function AssessmentAdminListDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'get all assessments',
        }),
        DocRequest({
            queries: [
                ...AssessmentDocQueryStatus
            ],
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponsePaging<AssessmentListResponseDto>('assessment.list', {
            dto: AssessmentListResponseDto,
        })
    );
}

export function AssessmentAdminGetDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'get detail an assessment',
        }),
        DocRequest({
            params: AssessmentDocParamsId,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse<AssessmentResponseDto>('assessment.get', {
            dto: AssessmentResponseDto,
        })
    );
}

export function AssessmentAdminCreateDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'create an assessment',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocRequest({
            bodyType: ENUM_DOC_REQUEST_BODY_TYPE.JSON,
            dto: AssessmentCreateDto,
        }),
        DocGuard({ role: true }),
        DocResponse<DatabaseIdResponseDto>('assessment.create', {
            httpStatus: HttpStatus.CREATED,
            dto: DatabaseIdResponseDto,
        })
    );
}

export function AssessmentAdminUpdateDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'update an assessment',
        }),
        DocRequest({
            params: AssessmentDocParamsId,
            bodyType: ENUM_DOC_REQUEST_BODY_TYPE.JSON,
            dto: AssessmentUpdateDto,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse<AssessmentResponseDto>('assessment.update', {
            dto: AssessmentResponseDto,
        })
    );
}

export function AssessmentAdminDeleteDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'delete an assessment',
        }),
        DocRequest({
            params: AssessmentDocParamsId,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('assessment.delete')
    );
}

export function AssessmentReportAdminListDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'get all assessment reports',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        // DocResponsePaging('assessment.report.list', {})
    );
}

export function AssessmentReportAdminGetDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'get detail an assessment report',
        }),
        DocRequest({
            params: AssessmentReportDocParamsId,
        }),
        DocAuth({
            jwtAccessToken: false,
        }),
        DocGuard({ role: false }),
        DocResponse('assessment.report.get')
    );
}

export function AssessmentReportAdminGetAuthDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'get detail an assessment report',
        }),
        DocRequest({
            params: AssessmentReportDocParamsId,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: false }),
        DocResponse('assessment.report.get')
    );
}

export function AssessmentReportAdminCreateDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'create an assessment report',
        }),
        DocAuth({
            jwtAccessToken: false,
        }),
        DocRequest({
            bodyType: ENUM_DOC_REQUEST_BODY_TYPE.JSON,
            dto: AssessmentReportCreateDto,
        }),
        DocGuard({ role: false }),
        DocResponse<DatabaseIdResponseDto>('assessment.report.create', {
            httpStatus: HttpStatus.CREATED,
            dto: DatabaseIdResponseDto,
        })
    );
}

export function AssessmentReportAdminUpdateDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'update an assessment report',
        }),
        DocRequest({
            params: AssessmentReportDocParamsId,
            bodyType: ENUM_DOC_REQUEST_BODY_TYPE.JSON,
            dto: AssessmentReportUpdateDto,
        }),
        DocAuth({
            jwtAccessToken: false,
        }),
        DocGuard({ role: false }),
        DocResponse('assessment.report.update')
    );
}

export function AssessmentReportAdminDeleteDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'delete an assessment report',
        }),
        DocRequest({
            params: AssessmentReportDocParamsId,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('assessment.report.delete')
    );
}

export function AssessmentAdminUpdateSectionsOrderDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'update sections order for an assessment',
        }),
        DocRequest({
            params: AssessmentDocParamsId,
            bodyType: ENUM_DOC_REQUEST_BODY_TYPE.JSON,
            dto: SectionOrderUpdateDto,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('assessment.updateSectionsOrder')
    );
}

export function AssessmentAdminGetSectionsOrderDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'get sections order for an assessment',
        }),
        DocRequest({
            params: AssessmentDocParamsId,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('assessment.getSectionsOrder')
    );
}

export function SectionAdminListDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'get all sections',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        // DocResponsePaging('assessment.section.list', {})
    );
}

export function SectionAdminGetDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'get detail a section',
        }),
        DocRequest({
            params: SectionDocParamsId,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('assessment.section.get')
    );
}

export function SectionAdminCreateDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'create a section',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocRequest({
            bodyType: ENUM_DOC_REQUEST_BODY_TYPE.JSON,
            dto: SectionCreateDto,
        }),
        DocGuard({ role: true }),
        DocResponse<DatabaseIdResponseDto>('assessment.section.create', {
            httpStatus: HttpStatus.CREATED,
            dto: DatabaseIdResponseDto,
        })
    );
}

export function SectionAdminUpdateDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'update a section',
        }),
        DocRequest({
            params: SectionDocParamsId,
            bodyType: ENUM_DOC_REQUEST_BODY_TYPE.JSON,
            dto: SectionUpdateDto,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('assessment.section.update')
    );
}

export function SectionAdminDeleteDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'delete a section',
        }),
        DocRequest({
            params: SectionDocParamsId,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('assessment.section.delete')
    );
}

export function SectionAdminUpdateQuestionsOrderDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'update questions order for a section',
        }),
        DocRequest({
            params: SectionDocParamsIdString,
            bodyType: ENUM_DOC_REQUEST_BODY_TYPE.JSON,
            dto: QuestionOrderUpdateDto,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('section.updateQuestionsOrder')
    );
}

export function SectionAdminGetQuestionsOrderDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'get questions order for a section',
        }),
        DocRequest({
            params: SectionDocParamsIdString,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('section.getQuestionsOrder')
    );
}

export function SectionAdminDropdownDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'get section dropdown list',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('section.dropdown')
    );
}

export function QuestionAdminListDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'get all questions',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        // DocResponsePaging('assessment.question.list', {})
    );
}

export function QuestionAdminGetDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'get detail a question',
        }),
        DocRequest({
            params: QuestionDocParamsId,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('assessment.question.get')
    );
}

export function QuestionAdminCreateDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'create a question',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocRequest({
            bodyType: ENUM_DOC_REQUEST_BODY_TYPE.JSON,
            dto: QuestionCreateDto,
        }),
        DocGuard({ role: true }),
        DocResponse<DatabaseIdResponseDto>('assessment.question.create', {
            httpStatus: HttpStatus.CREATED,
            dto: DatabaseIdResponseDto,
        })
    );
}

export function QuestionAdminUpdateDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'update a question',
        }),
        DocRequest({
            params: QuestionDocParamsId,
            bodyType: ENUM_DOC_REQUEST_BODY_TYPE.JSON,
            dto: QuestionUpdateDto,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('assessment.question.update')
    );
}

export function QuestionAdminDeleteDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'delete a question',
        }),
        DocRequest({
            params: QuestionDocParamsId,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('assessment.question.delete')
    );
}

export function QuestionAnswerAdminListDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'get all question answers',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        // DocResponsePaging('assessment.question.answer.list', {})
    );
}

export function QuestionAnswerAdminGetDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'get detail a question answer',
        }),
        DocRequest({
            params: QuestionAnswerDocParamsId,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('assessment.question.answer.get')
    );
}

export function QuestionAnswerAdminCreateDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'create a question answer',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocRequest({
            bodyType: ENUM_DOC_REQUEST_BODY_TYPE.JSON,
            dto: QuestionAnswerCreateDto,
        }),
        DocGuard({ role: true }),
        DocResponse<DatabaseIdResponseDto>('assessment.question.answer.create', {
            httpStatus: HttpStatus.CREATED,
            dto: DatabaseIdResponseDto,
        })
    );
}

export function QuestionAnswerAdminUpdateDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'update a question answer',
        }),
        DocRequest({
            params: QuestionAnswerDocParamsId,
            bodyType: ENUM_DOC_REQUEST_BODY_TYPE.JSON,
            dto: QuestionAnswerUpdateDto,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('assessment.question.answer.update')
    );
}

export function QuestionAnswerAdminDeleteDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'delete a question answer',
        }),
        DocRequest({
            params: QuestionAnswerDocParamsId,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('assessment.question.answer.delete')
    );
}

export function AssessmentReportAdminGeneratePdfDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'generate PDF for an assessment report',
        }),
        DocRequest({
            bodyType: ENUM_DOC_REQUEST_BODY_TYPE.JSON,
        }),
        DocAuth({
            jwtAccessToken: false,
        }),
        DocGuard({ role: false }),
        DocResponse('assessment.report.generatePdf')
    );
}