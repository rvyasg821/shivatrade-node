import { HttpStatus, applyDecorators } from '@nestjs/common';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';
import {
    Doc,
    DocAuth,
    DocRequest,
    DocResponse,
    DocResponsePaging,
} from '@common/doc/decorators/doc.decorator';
import { ENUM_DOC_REQUEST_BODY_TYPE } from '@common/doc/enums/doc.enum';
import {
    AssessmentDocParamsId,
    AssessmentDocQueryStatus,
} from '@modules/assessment/constants/assessment.doc.constant';
import { AssessmentCreateDto } from '@modules/assessment/dtos/assessment.create.dto';
import { AssessmentUpdateDto } from '@modules/assessment/dtos/assessment.update.dto';
import { AssessmentResponseDto } from '@modules/assessment/dtos/assessment.response.dto';
import { AssessmentListResponseDto } from '@modules/assessment/dtos/assessment.list.response.dto';
import { AssessmentDropdownListDto } from '@modules/assessment/dtos/assessment-dropdown-list.dto';

export function AssessmentListDoc(): MethodDecorator {
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
        DocResponsePaging<AssessmentListResponseDto>('assessment.list', {
            dto: AssessmentListResponseDto,
        })
    );
}

export function AssessmentGetDoc(): MethodDecorator {
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
        DocResponse<AssessmentResponseDto>('assessment.get', {
            dto: AssessmentResponseDto,
        })
    );
}

export function AssessmentCreateDoc(): MethodDecorator {
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
        DocResponse<DatabaseIdResponseDto>('assessment.create', {
            httpStatus: HttpStatus.CREATED,
            dto: DatabaseIdResponseDto,
        })
    );
}

export function AssessmentUpdateDoc(): MethodDecorator {
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
        DocResponse<AssessmentResponseDto>('assessment.update', {
            dto: AssessmentResponseDto,
        })
    );
}

export function AssessmentDeleteDoc(): MethodDecorator {
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
        DocResponse('assessment.delete')
    );
}

export function AssessmentDropdownDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'get assessment dropdown list',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocResponse('assessment.dropdown')
    );
}
