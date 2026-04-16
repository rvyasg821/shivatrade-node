/**
 * Tool Access Guard
 * Validates that the user has access to the requested tool based on their subscription
 */

import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ToolAccessHelper } from '@modules/tools/helpers/tool-access.helper';

export const TOOL_ACCESS_KEY = 'toolAccess';

/**
 * Decorator to mark endpoints that require tool access validation
 * @param paramName - Name of the route parameter containing the toolId (default: 'toolId')
 */
export const RequireToolAccess = (paramName: string = 'toolId') =>
    Reflect.metadata(TOOL_ACCESS_KEY, paramName);

@Injectable()
export class ToolAccessGuard implements CanActivate {
    private readonly logger = new Logger(ToolAccessGuard.name);

    constructor(
        private readonly reflector: Reflector,
        private readonly toolAccessHelper: ToolAccessHelper
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Get the parameter name from decorator metadata
        const paramName = this.reflector.get<string>(
            TOOL_ACCESS_KEY,
            context.getHandler()
        );

        // If no metadata, this guard is not applied to this route
        if (!paramName) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;
        const toolId = request.params[paramName];

        if (!user || !user._id) {
            this.logger.error('User not found in request');
            throw new ForbiddenException('Authentication required');
        }

        if (!toolId) {
            this.logger.error(`Tool ID not found in params.${paramName}`);
            throw new ForbiddenException('Tool ID required');
        }

        // Check if user has access to this tool
        const hasAccess = await this.toolAccessHelper.hasToolAccess(
            user._id.toString(),
            toolId
        );

        if (!hasAccess) {
            this.logger.warn(
                `User ${user._id} attempted to access tool ${toolId} without permission`
            );
            throw new ForbiddenException(
                'You do not have access to this tool. Please check your subscription.'
            );
        }

        this.logger.debug(
            `Tool access granted: user=${user._id}, tool=${toolId}`
        );

        return true;
    }
}
