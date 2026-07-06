import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { Response } from '@common/response/decorators/response.decorator';
import { IResponse } from '@common/response/interfaces/response.interface';
import { CreatorScopeService } from '../creator-scope.service';

@ApiTags('admin.creator')
@Controller({ version: '1', path: '/admin/creator' })
export class CreatorScopeController {
    constructor(private readonly creatorScope: CreatorScopeService) {}

    // Person-picker source. Scoped by role inside the service:
    // Company Admin → all active company users; Location Admin → users in
    // their locations; anyone else → [].
    @Response('creator.roster')
    @AuthJwtAccessProtected()
    @Get('/roster')
    async roster(
        @AuthJwtPayload('user') user: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @AuthJwtPayload('locationId') locationId: string
    ): Promise<IResponse<Array<{ _id: string; name: string }>>> {
        const data = await this.creatorScope.rosterFor({
            user,
            roleName,
            companyId,
            assignedLocations,
            locationId,
        });
        return { data };
    }
}
