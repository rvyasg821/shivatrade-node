import {
    Controller,
    Get,
    Param,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from '@common/response/decorators/response.decorator';
import { IResponse } from '@common/response/interfaces/response.interface';
import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { UserProtected } from '@modules/user/decorators/user.decorator';
import { ToolsService } from '@modules/tools/services/tools.service';
import { ToolAccessHelper } from '@modules/tools/helpers/tool-access.helper';
import { ToolsGetResponseDto } from '@modules/tools/dtos/response/tools.get.response.dto';

@ApiTags('modules.public.tools')
@Controller({
    version: '1',
    path: '/tools',
})
export class ToolsPublicController {
    constructor(
        private readonly toolsService: ToolsService,
        private readonly toolAccessHelper: ToolAccessHelper
    ) {}

    /**
     * Get all tools the user has access to based on their subscription
     */
    @Response('tools.myTools')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/my-tools')
    async getMyTools(
        @AuthJwtPayload('user') userId: string
    ): Promise<IResponse<any[]>> {
        // Get tools from user's subscription
        const tools = await this.toolAccessHelper.getUserTools(userId);

        return {
            data: tools,
        };
    }

    /**
     * Get details of a specific tool (with access validation)
     */
    @Response('tools.get')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/get/:toolId')
    async getTool(
        @Param('toolId') toolId: string,
        @AuthJwtPayload('user') userId: string
    ): Promise<IResponse<ToolsGetResponseDto>> {
        // Validate user has access to this tool
        const hasAccess = await this.toolAccessHelper.hasToolAccess(userId, toolId);

        if (!hasAccess) {
            throw new ForbiddenException(
                'You do not have access to this tool. Please check your subscription.'
            );
        }

        // Fetch tool details
        const tool = await this.toolsService.findOneById(toolId);

        if (!tool) {
            throw new NotFoundException('Tool not found');
        }

        return {
            data: await this.toolsService.mapGet(tool),
        };
    }

    /**
     * Check if user has access to a specific tool
     */
    @Response('tools.checkAccess')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/check-access/:toolId')
    async checkToolAccess(
        @Param('toolId') toolId: string,
        @AuthJwtPayload('user') userId: string
    ): Promise<IResponse<{ hasAccess: boolean }>> {
        const hasAccess = await this.toolAccessHelper.hasToolAccess(userId, toolId);

        return {
            data: { hasAccess },
        };
    }
}
