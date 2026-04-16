import { applyDecorators } from '@nestjs/common';
import {
    Doc,
    DocAuth,
    DocGuard,
    DocRequest,
    DocResponse,
} from '@common/doc/decorators/doc.decorator';
import { UserDocParamsId } from '@modules/user/constants/user.doc.constant';
import { ENUM_DOC_REQUEST_BODY_TYPE } from '@common/doc/enums/doc.enum';
import { AuthUpdateProfileRequestDto } from '../dtos/request/auth.update-profile.request.dto';

export function AuthAdminUpdatePasswordDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'admin update user password',
        }),
        DocRequest({
            params: UserDocParamsId,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('auth.updatePassword')
    );
}

export function AuthMeAdminDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'admin profile',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('auth.me')
    );
}

export function AuthAdminUpdateProfileDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'update profile',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocRequest({
            bodyType: ENUM_DOC_REQUEST_BODY_TYPE.JSON,
            dto: AuthUpdateProfileRequestDto,
        }),
        DocResponse('auth.updateProfile')
    );
}