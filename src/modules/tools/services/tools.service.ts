import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { plainToInstance } from 'class-transformer';
import { DatabaseHelperQueryContain } from '@common/database/decorators/database.decorator';
import {
    IDatabaseCreateOptions,
    IDatabaseDeleteManyOptions,
    IDatabaseExistsOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseSaveOptions,
    IDatabaseSoftDeleteOptions,
} from '@common/database/interfaces/database.interface';
import { IToolsService } from '@modules/tools/interfaces/tools.service.interface';
import { IToolsEntity } from '@modules/tools/interfaces/tools.interface';
import { ToolsRepository } from '@modules/tools/repository/repositories/tools.repository';
import {
    ToolsDoc,
    ToolsEntity,
} from '@modules/tools/repository/entities/tools.entity';
import { ToolsCreateRequestDto } from '@modules/tools/dtos/request/tools.create.request.dto';
import { ToolsUpdateRequestDto } from '@modules/tools/dtos/request/tools.update.request.dto';
import { ToolsListResponseDto } from '@modules/tools/dtos/response/tools.list.response.dto';
import { ToolsGetResponseDto } from '@modules/tools/dtos/response/tools.get.response.dto';
import { ToolsShortResponseDto } from '@modules/tools/dtos/response/tools.short.response.dto';
import { ENUM_TOOLS_STATUS } from '@modules/tools/enums/tools.enum';
import { ToolDeletionService } from './tool-deletion.service';

@Injectable()
export class ToolsService implements IToolsService {
    private readonly CACHE_TTL = 300; // 5 minutes
    private readonly CACHE_KEYS = {
        ACTIVE_TOOLS: 'tools:active',
        TOOL_BY_ID: (id: string) => `tools:id:${id}`,
        TOOL_BY_NAME: (name: string) => `tools:name:${name}`,
    };

    constructor(
        private readonly toolsRepository: ToolsRepository,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
        private readonly toolDeletionService: ToolDeletionService
    ) {}

    convertToObjectId(id: string): string {
        return id;
    }

    async findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<ToolsDoc[]> {
        return this.toolsRepository.findAll<ToolsDoc>(find, options);
    }

    async findAllActive(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<ToolsDoc[]> {
        return this.toolsRepository.findAllActive(find, options);
    }

    /**
     * Tools to expose to the frontend as `company.tools`. In single-tenant mode
     * tool/subscription gating is disabled — every company (new or existing)
     * gets ALL active tools, so the UI shows every module regardless of plan.
     * In SaaS mode the subscription's own tools are returned unchanged.
     */
    async resolveExposedTools(subscriptionTools: any[] = []): Promise<any[]> {
        if ((process.env.APP_MODE || 'single') === 'single') {
            return this.findAllActive({});
        }
        return subscriptionTools || [];
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return this.toolsRepository.getTotal(find, options);
    }

    async findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<ToolsDoc> {
        const cacheKey = this.CACHE_KEYS.TOOL_BY_ID(_id);

        if (!options) {
            const cached = await this.cacheManager.get<ToolsDoc>(cacheKey);
            if (cached) {
                return cached;
            }
        }

        const tool = await this.toolsRepository.findOneById<ToolsDoc>(
            _id,
            options
        );

        if (!options && tool) {
            await this.cacheManager.set(cacheKey, tool, this.CACHE_TTL);
        }

        return tool;
    }

    async findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<ToolsDoc> {
        return this.toolsRepository.findOne<ToolsDoc>(find, options);
    }

    async findOneByName(
        name: string,
        options?: IDatabaseFindOneOptions
    ): Promise<ToolsDoc> {
        return this.toolsRepository.findOne<ToolsDoc>(
            DatabaseHelperQueryContain('name', name, { fullWord: true }),
            options
        );
    }

    async existByName(
        name: string,
        options?: IDatabaseExistsOptions
    ): Promise<boolean> {
        return this.toolsRepository.exists(
            DatabaseHelperQueryContain('name', name, { fullWord: true }),
            options
        );
    }

    async create(
        data: ToolsCreateRequestDto,
        options?: IDatabaseCreateOptions
    ): Promise<ToolsDoc> {
        const create: ToolsEntity = new ToolsEntity();
        create.name = data.name;
        create.slug = data?.slug;
        create.description = data.description;
        create.status = data.status || ENUM_TOOLS_STATUS.ACTIVE;
        create.displayOrder = data.displayOrder ?? 0;

        const result = await this.toolsRepository.create<ToolsEntity>(
            create,
            options
        );
        await this.invalidateCache();
        return result;
    }

    async update(
        repository: ToolsDoc,
        data: ToolsUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<ToolsDoc> {
        if (data.name !== undefined) repository.name = data.name;
        if (data.description !== undefined)
            repository.description = data.description;
        if (data.status !== undefined) repository.status = data.status;
        if (data.displayOrder !== undefined) repository.displayOrder = data.displayOrder;

        const result = await this.toolsRepository.save(repository, options);
        await this.invalidateCache(repository._id.toString());
        if (data.status !== undefined && result.status !== undefined && data.status === result.status) {
            result.status = data.status;
            if (result.status === ENUM_TOOLS_STATUS.INACTIVE) {
                await this.toolDeletionService.enqueueDeletionJob(
                    result._id.toString(),
                    'inactivate',
                    'Admin'
                );
            }else if (result.status === ENUM_TOOLS_STATUS.ACTIVE) {
                await this.toolDeletionService.cancelPendingJobsForTool(result._id.toString());
            }
        }
        return result;
    }

    async updateWidgetsAndSettings(
        repository: ToolsDoc,
        widgets: any[],
        settings: any[],
        options?: IDatabaseSaveOptions
    ): Promise<ToolsDoc> {
        if (widgets !== undefined) repository.widgets = widgets;
        if (settings !== undefined) repository.settings = settings;

        const result = await this.toolsRepository.save(repository, options);
        await this.invalidateCache(repository._id.toString());
        return result;
    }

    async updateStatus(
        repository: ToolsDoc,
        status: ENUM_TOOLS_STATUS,
        options?: IDatabaseSaveOptions
    ): Promise<ToolsDoc> {
        repository.status = status;
        const result = await this.toolsRepository.save(repository, options);
        await this.invalidateCache(repository._id.toString());
        return result;
    }

    async softDelete(
        repository: ToolsDoc,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<ToolsDoc> {
        const result = await this.toolsRepository.softDelete(
            repository,
            options
        );
        await this.invalidateCache(repository._id.toString());
        return result;
    }

    async deleteMany(
        find: Record<string, any>,
        options?: IDatabaseDeleteManyOptions
    ): Promise<boolean> {
        await this.toolsRepository.deleteMany(find, options);
        return true;
    }

    async countByStatus(status: ENUM_TOOLS_STATUS): Promise<number> {
        return this.toolsRepository.countByStatus(status);
    }

    mapList(tools: ToolsDoc[] | IToolsEntity[]): ToolsListResponseDto[] {
        return plainToInstance(
            ToolsListResponseDto,
            tools.map((tool: ToolsDoc | IToolsEntity) =>
                (tool as any).toObject ? (tool as any).toObject() : tool
            )
        );
    }

    mapGet(tool: ToolsDoc | IToolsEntity): ToolsGetResponseDto {
        return plainToInstance(
            ToolsGetResponseDto,
            (tool as any).toObject ? (tool as any).toObject() : tool
        );
    }

    mapShort(tools: ToolsDoc[] | IToolsEntity[]): ToolsShortResponseDto[] {
        return plainToInstance(
            ToolsShortResponseDto,
            tools.map((tool: ToolsDoc | IToolsEntity) =>
                (tool as any).toObject ? (tool as any).toObject() : tool
            )
        );
    }

    private async invalidateCache(toolId?: string): Promise<void> {
        const keysToInvalidate = [this.CACHE_KEYS.ACTIVE_TOOLS];

        if (toolId) {
            keysToInvalidate.push(this.CACHE_KEYS.TOOL_BY_ID(toolId));
        }

        await Promise.all(
            keysToInvalidate.map(key => this.cacheManager.del(key))
        );
    }
}
