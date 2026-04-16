import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
    PaginationQuery,
} from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';
import { PaginationService } from '@common/pagination/services/pagination.service';
import { RequestRequiredPipe } from '@common/request/pipes/request.required.pipe';
import {
    Response,
    ResponsePaging,
} from '@common/response/decorators/response.decorator';
import {
    IResponse,
    IResponsePaging,
} from '@common/response/interfaces/response.interface';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';

import { ToolsService } from '@modules/tools/services/tools.service';
import { ToolDeletionService } from '@modules/tools/services/tool-deletion.service';
import { ToolsCreateRequestDto } from '@modules/tools/dtos/request/tools.create.request.dto';
import { ToolsUpdateRequestDto } from '@modules/tools/dtos/request/tools.update.request.dto';
import { ToolsUpdateStatusRequestDto } from '@modules/tools/dtos/request/tools.update-status.request.dto';
import { ToolsListResponseDto } from '@modules/tools/dtos/response/tools.list.response.dto';
import { ToolsGetResponseDto } from '@modules/tools/dtos/response/tools.get.response.dto';
import { ToolsDoc } from '@modules/tools/repository/entities/tools.entity';
import { ENUM_TOOLS_STATUS } from '@modules/tools/enums/tools.enum';
import {
    TOOLS_DEFAULT_AVAILABLE_ORDER_BY,
    TOOLS_DEFAULT_AVAILABLE_SEARCH,
} from '@modules/tools/constants/tools.list.constant';
import {
    ToolsAdminListDoc,
    ToolsAdminGetDoc,
    ToolsAdminCreateDoc,
    ToolsAdminUpdateDoc,
    ToolsAdminUpdateStatusDoc,
    ToolsAdminDeleteDoc,
    ToolsAdminAnalyticsDoc,
} from '@modules/tools/docs/tools.admin.doc';
import {
    ToolsAlreadyExistsException,
} from '@modules/tools/exceptions/tools.exception';

import { ToolsParsePipe } from '../pipes';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { Permission } from '@modules/role/decorators/permission.decorator';
import { PermissionGuard } from '@modules/role/guards/permission.guard';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';
import { RoleService } from '@modules/role/services/role.service';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';

@ApiTags('modules.admin.tools')
@Controller({
    version: '1',
    path: '/tools',
})
export class ToolsAdminController {
    constructor(
        private readonly paginationService: PaginationService,
        private readonly toolsService: ToolsService,
        private readonly toolDeletionService: ToolDeletionService,
        private readonly subscriptionService: SubscriptionService,
        private readonly roleService: RoleService
    ) { }

    @ToolsAdminListDoc()
    @ResponsePaging('tools.list')
    @Permission('tools', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @PaginationQuery({
            availableSearch: TOOLS_DEFAULT_AVAILABLE_SEARCH,
            availableOrderBy: TOOLS_DEFAULT_AVAILABLE_ORDER_BY,
        })
        { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string,
        @AuthJwtPayload('user') userId?: string,
        @AuthJwtPayload('role') roleId?: string,
    ): Promise<IResponsePaging<ToolsListResponseDto>> {
        console.log('🔧 Tools List Request:');
        console.log(`   User ID: ${userId}`);
        console.log(`   Role ID: ${roleId}`);

        const find: Record<string, any> = {
            ..._search,
        };

        if (status && status === 'ACTIVE') {
            find.status = { $eq: ENUM_TOOLS_STATUS.ACTIVE };
        }

        if (status && status === 'INACTIVE') {
            find.status = { $eq: ENUM_TOOLS_STATUS.INACTIVE };
        }

        // Check if user is Super Admin
        let isSuperAdmin = false;
        if (roleId) {
            const role = await this.roleService.findOneById(roleId);
            isSuperAdmin = role && role.name === ENUM_SYSTEM_ROLE.SUPER_ADMIN;
            console.log(`   Is Super Admin: ${isSuperAdmin}`);
        }

        let tools: ToolsDoc[] = [];
        let total: number = 0;

        if (isSuperAdmin) {
            // Super Admin: Show all tools
            console.log('   ✅ Super Admin - showing all tools');
            tools = await this.toolsService.findAll(find, {
                paging: {
                    limit: _limit,
                    offset: _offset,
                },
                order: _order,
            });
            total = await this.toolsService.getTotal(find);
        } else {
            // Company Admin: Only show tools from active subscription
            console.log('   🔒 Company Admin - filtering by subscription tools');

            // Get user's active subscription
            const subscription = await this.subscriptionService.findActiveByUserId(userId);

            if (!subscription || !subscription.tools || subscription.tools.length === 0) {
                console.log('   ⚠️  No active subscription or no tools in subscription');
                // Return empty list if no subscription or no tools
                return {
                    _pagination: { total: 0, totalPage: 0 },
                    data: [],
                };
            }

            // Get tool IDs from subscription
            const subscriptionToolIds = subscription.tools.map(tool => tool._id.toString());
            console.log(`   📋 Subscription tool IDs: ${subscriptionToolIds.join(', ')}`);

            // Add tool ID filter to query
            find._id = { $in: subscriptionToolIds };

            tools = await this.toolsService.findAll(find, {
                paging: {
                    limit: _limit,
                    offset: _offset,
                },
                order: _order,
            });
            total = await this.toolsService.getTotal(find);
            console.log(`   ✅ Found ${total} tools in subscription`);
        }

        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        const mapped: ToolsListResponseDto[] = this.toolsService.mapList(tools);

        return {
            _pagination: { total, totalPage },
            data: mapped,
        };
    }

    @ToolsAdminGetDoc()
    @Response('tools.get')
    @Permission('tools', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Get('/:tool')
    async get(
        @Param('tool', RequestRequiredPipe, ToolsParsePipe) tool: ToolsDoc
    ): Promise<IResponse<ToolsGetResponseDto>> {
        const mapped: ToolsGetResponseDto = this.toolsService.mapGet(tool);
        return { data: mapped };
    }

    @ToolsAdminCreateDoc()
    @Response('tools.create')
    @Permission('tools', 'can_add')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @Body() body: ToolsCreateRequestDto
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const exist: boolean = await this.toolsService.existByName(body.name);
        if (exist) {
            throw new ToolsAlreadyExistsException(body.name);
        }

        const created: ToolsDoc = await this.toolsService.create(body);

        return {
            data: { _id: created._id.toString() },
        };
    }

    @ToolsAdminUpdateDoc()
    @Response('tools.update')
    @Permission('tools', 'can_update')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Put('/:tool/update')
    async update(
        @Param('tool', RequestRequiredPipe, ToolsParsePipe) tool: ToolsDoc,
        @Body() body: ToolsUpdateRequestDto
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        // if (body.name && body.name !== tool.name) {
        //     const exist: boolean = await this.toolsService.existByName(body.name);
        //     if (exist) {
        //         throw new ToolsAlreadyExistsException(body.name);
        //     }
        // }
        if (body.name && body.name !== tool.name) {
            const exist = await this.toolsService.findOne({ name: body.name, _id: { $ne: tool._id } });
            if (exist) {
                throw new ToolsAlreadyExistsException(body.name);
            }
        }

        const updated: ToolsDoc = await this.toolsService.update(tool, body);

        return {
            data: { _id: updated._id.toString() },
        };
    }

    @ToolsAdminUpdateStatusDoc()
    @Response('tools.updateStatus')
    @Permission('tools', 'can_update')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Patch('/:tool/status')
    async updateStatus(
        @Param('tool', RequestRequiredPipe, ToolsParsePipe) tool: ToolsDoc,
        @Body() body: ToolsUpdateStatusRequestDto
    ): Promise<IResponse<{ _id: string; jobId?: string; message: string }>> {
        // If setting to INACTIVE, use the job queue for cascade operations
        if (body.status === ENUM_TOOLS_STATUS.INACTIVE) {
            const jobId = await this.toolDeletionService.enqueueDeletionJob(
                tool._id.toString(),
                'inactivate',
                'Admin'
            );

            return {
                data: {
                    _id: tool._id.toString(),
                    jobId,
                    message: 'Tool inactivation has been scheduled. The tool will be removed from plans and subscriptions after the grace period.',
                },
            };
        }

        // For other status changes, update directly
        const updated: ToolsDoc = await this.toolsService.updateStatus(
            tool,
            body.status
        );

        return {
            data: {
                _id: updated._id.toString(),
                message: 'Tool status updated successfully.',
            },
        };
    }

    @ToolsAdminDeleteDoc()
    @Response('tools.delete')
    @Permission('tools', 'can_delete')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Delete('/:tool/delete')
    async delete(
        @Param('tool', RequestRequiredPipe, ToolsParsePipe) tool: ToolsDoc
    ): Promise<IResponse<{ _id: string; jobId: string; message: string }>> {
        // Enqueue deletion job with delay
        const jobId = await this.toolDeletionService.enqueueDeletionJob(
            tool._id.toString(),
            'delete',
            'Admin'
        );

        return {
            data: {
                _id: tool._id.toString(),
                jobId,
                message: 'Tool deletion has been scheduled. The tool and all related data will be removed after the grace period.',
            },
        };
    }

    @ToolsAdminAnalyticsDoc()
    @ResponsePaging('tools.analytics')
    @Permission('tools', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Get('/analytics/overview')
    async analyticsOverview(): Promise<IResponse<Record<string, any>>> {
        const totalTools = await this.toolsService.getTotal();
        const activeTools = await this.toolsService.countByStatus(
            ENUM_TOOLS_STATUS.ACTIVE
        );
        const inactiveTools = await this.toolsService.countByStatus(
            ENUM_TOOLS_STATUS.INACTIVE
        );

        return {
            data: {
                total: totalTools,
                active: activeTools,
                inactive: inactiveTools,
            },
        };
    }
}