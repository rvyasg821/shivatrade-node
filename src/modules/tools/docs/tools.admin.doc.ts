import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiQuery,
    ApiBody,
} from '@nestjs/swagger';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';
import { ToolsListResponseDto } from '@modules/tools/dtos/response/tools.list.response.dto';
import { ToolsGetResponseDto } from '@modules/tools/dtos/response/tools.get.response.dto';
import { ToolsCreateRequestDto } from '@modules/tools/dtos/request/tools.create.request.dto';
import { ToolsUpdateRequestDto } from '@modules/tools/dtos/request/tools.update.request.dto';
import { ToolsUpdateStatusRequestDto } from '@modules/tools/dtos/request/tools.update-status.request.dto';
import { DocAuth } from '@common/doc/decorators/doc.decorator';

export function ToolsAdminListDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get list of tools',
            description: 'Retrieve paginated list of tools with filtering and search capabilities',
        }),
        ApiQuery({
            name: 'search',
            required: false,
            type: String,
            description: 'Search term for tool name or description',
        }),
        ApiQuery({
            name: 'status',
            required: false,
            enum: ['ACTIVE', 'INACTIVE'],
            description: 'Filter by tool status (ACTIVE or INACTIVE)',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Tools retrieved successfully',
            type: ToolsListResponseDto,
            isArray: true,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
    );
}

export function ToolsAdminGetDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get tool details',
            description: 'Retrieve detailed information about a specific tool',
        }),
        ApiParam({
            name: 'tool',
            type: String,
            description: 'Tool ID',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Tool details retrieved successfully',
            type: ToolsGetResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Tool not found',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
    );
}

export function ToolsAdminCreateDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Create new tool',
            description: 'Create a new tool with name and description',
        }),
        ApiBody({
            type: ToolsCreateRequestDto,
            description: 'Tool creation data',
        }),
        ApiResponse({
            status: HttpStatus.CREATED,
            description: 'Tool created successfully',
            type: DatabaseIdResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.CONFLICT,
            description: 'Tool name already exists',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
    );
}

export function ToolsAdminUpdateDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Update tool',
            description: 'Update an existing tool information',
        }),
        ApiParam({
            name: 'tool',
            type: String,
            description: 'Tool ID',
        }),
        ApiBody({
            type: ToolsUpdateRequestDto,
            description: 'Tool update data',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Tool updated successfully',
            type: DatabaseIdResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Tool not found',
        }),
        ApiResponse({
            status: HttpStatus.CONFLICT,
            description: 'Tool name already exists',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
    );
}

export function ToolsAdminUpdateStatusDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Update tool status',
            description: 'Change the status of a tool (ACTIVE or INACTIVE)',
        }),
        ApiParam({
            name: 'tool',
            type: String,
            description: 'Tool ID',
        }),
        ApiBody({
            type: ToolsUpdateStatusRequestDto,
            description: 'Tool status update data',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Tool status updated successfully',
            type: DatabaseIdResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Tool not found',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
    );
}

export function ToolsAdminDeleteDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Delete tool',
            description: 'Soft delete a tool (mark as deleted)',
        }),
        ApiParam({
            name: 'tool',
            type: String,
            description: 'Tool ID',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Tool deleted successfully',
            type: DatabaseIdResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Tool not found',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
    );
}

export function ToolsAdminAnalyticsDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get tool analytics',
            description: 'Retrieve analytics overview for all tools',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Analytics retrieved successfully',
            schema: {
                type: 'object',
                properties: {
                    total: { type: 'number' },
                    active: { type: 'number' },
                    inactive: { type: 'number' },
                },
            },
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
    );
}