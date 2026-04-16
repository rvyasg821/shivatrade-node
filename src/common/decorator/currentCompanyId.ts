import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IRequestApp } from '@common/request/interfaces/request.interface';

export const CurrentCompany = createParamDecorator(
    (_: unknown, ctx: ExecutionContext): string => {
        const { user } = ctx.switchToHttp().getRequest<IRequestApp & { user: any }>();
        return user?.companyId;
    }
);