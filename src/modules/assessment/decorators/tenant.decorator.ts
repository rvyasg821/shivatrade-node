import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IRequestApp } from '@common/request/interfaces/request.interface';
import { IUnifiedAuthJwtAccessTokenPayload } from '@modules/auth/interfaces/auth.unified.interface';

export const TenantId = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): string | undefined => {
        const request = ctx.switchToHttp().getRequest<IRequestApp>();
        const user = request.user as IUnifiedAuthJwtAccessTokenPayload;
        return user?.tenantId || undefined;
    }
);