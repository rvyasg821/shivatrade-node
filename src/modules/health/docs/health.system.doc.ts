import { applyDecorators } from '@nestjs/common';
import {
    Doc,
    DocAuth,
    DocResponse,
} from '@common/doc/decorators/doc.decorator';

import { HealthDatabaseResponseDto } from '@modules/health/dtos/response/health.database.response.dto';
import { HealthInstanceResponseDto } from '@modules/health/dtos/response/health.instance.response.dto';



export function HealthSystemCheckDatabaseDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'health check api for database',
        }),
        DocAuth(),
        DocResponse<HealthDatabaseResponseDto>('health.checkDatabase', {
            dto: HealthDatabaseResponseDto,
        })
    );
}

export function HealthSystemCheckInstanceDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'health check api for instance',
        }),
        DocAuth(),
        DocResponse<HealthInstanceResponseDto>('health.checkInstance', {
            dto: HealthInstanceResponseDto,
        })
    );
}
