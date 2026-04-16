import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
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
import { IPlanService } from '@modules/plan/interfaces/plan.service.interface';
import { IPlanEntity } from '@modules/plan/interfaces/plan.interface';
import { PlanRepository } from '@modules/plan/repository/repositories/plan.repository';
import { PlanDoc, PlanEntity } from '@modules/plan/repository/entities/plan.entity';
import { PlanCreateRequestDto } from '@modules/plan/dtos/request/plan.create.request.dto';
import { PlanUpdateRequestDto } from '@modules/plan/dtos/request/plan.update.request.dto';
import { PlanListResponseDto } from '@modules/plan/dtos/response/plan.list.response.dto';
import { PlanGetResponseDto } from '@modules/plan/dtos/response/plan.get.response.dto';
import { PlanShortResponseDto } from '@modules/plan/dtos/response/plan.short.response.dto';
import { ENUM_PLAN_STATUS } from '@modules/plan/enums/plan.enum';
import {
    PlanNotFoundException,
    PlanAlreadyExistsException,
} from '@modules/plan/exceptions/plan.exception';
import { ToolsService } from '@modules/tools/services/tools.service';
import { ToolsDoc } from '@modules/tools/repository/entities/tools.entity';

@Injectable()
export class PlanService implements IPlanService {
    private readonly CACHE_TTL = 300; // 5 minutes
    private readonly CACHE_KEYS = {
        ACTIVE_PLANS: 'plans:active',
        DEFAULT_PLAN: 'plans:default',
        PLAN_BY_ID: (id: string) => `plans:id:${id}`,
        PLAN_BY_NAME: (name: string) => `plans:name:${name}`,
        PLANS_BY_DISPLAY_ORDER: 'plans:display-order',
    };

    constructor(
        private readonly planRepository: PlanRepository,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
        private readonly configService: ConfigService,
        private readonly toolsService: ToolsService
    ) { }

    convertToObjectId(id: string): string {
        return id;
    }

    async findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<PlanDoc[]> {
        return this.planRepository.findAll<PlanDoc>(find, options);
    }

    async findAllActive(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<PlanDoc[]> {
        return this.planRepository.findAllActive(find, options);
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return this.planRepository.getTotal(find, options);
    }

    async findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<PlanDoc> {
        const cacheKey = this.CACHE_KEYS.PLAN_BY_ID(_id);

        if (!options) {
            const cached = await this.cacheManager.get<PlanDoc>(cacheKey);
            if (cached) {
                return cached;
            }
        }

        const plan = await this.planRepository.findOneById<PlanDoc>(_id, options);

        if (!options && plan) {
            await this.cacheManager.set(cacheKey, plan, this.CACHE_TTL);
        }

        return plan;
    }

    async findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<PlanDoc> {
        return this.planRepository.findOne<PlanDoc>(find, options);
    }

    async findOneByName(
        name: string,
        options?: IDatabaseFindOneOptions
    ): Promise<PlanDoc> {
        return this.planRepository.findOne<PlanDoc>(
            DatabaseHelperQueryContain('name', name, { fullWord: true }),
            options
        );
    }

    async findDefault(options?: IDatabaseFindOneOptions): Promise<PlanDoc> {
        const cacheKey = this.CACHE_KEYS.DEFAULT_PLAN;

        if (!options) {
            const cached = await this.cacheManager.get<PlanDoc>(cacheKey);
            if (cached) {
                return cached;
            }
        }

        const plan = await this.planRepository.findDefault(options);

        if (!options && plan) {
            await this.cacheManager.set(cacheKey, plan, this.CACHE_TTL);
        }

        return plan;
    }

    async existByName(
        name: string,
        options?: IDatabaseExistsOptions
    ): Promise<boolean> {
        return this.planRepository.exists(
            DatabaseHelperQueryContain('name', name, { fullWord: true }),
            options
        );
    }

    async create(
        data: PlanCreateRequestDto,
        options?: IDatabaseCreateOptions
    ): Promise<PlanDoc> {
        const create: PlanEntity = new PlanEntity();
        create.name = data.name;
        create.location_pricing = data.location_pricing || [];
        create.features = data.features || [];
        create.status = data.status || ENUM_PLAN_STATUS.ACTIVE;
        create.isDefault = data.isDefault || false;
        create.displayOrder = data.displayOrder || 0;
        create.duration_type = data.duration_type;
        create.recurring = data.recurring;
        create.trial = data.trial;
        create.is_lifetime = data.is_lifetime;
        create.tools = (data.tools || []).map(tool => ({
            ...tool,
            slug: tool.slug
        }));
        create.metadata = data.metadata || {};
        create.duration = data.duration || 0;

        // If this is set as default, unset other defaults first
        if (create.isDefault) {
            await this.planRepository.updateMany(
                { isDefault: true },
                { isDefault: false },
                options
            );
        }

        const result = await this.planRepository.create<PlanEntity>(create, options);
        await this.invalidateCache();
        return result;
    }

    async update(
        repository: PlanDoc,
        data: PlanUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<PlanDoc> {
        if (data.name !== undefined) repository.name = data.name;
        if (data.location_pricing !== undefined) repository.location_pricing = data.location_pricing;
        if (data.features !== undefined) repository.features = data.features;
        if (data.status !== undefined) repository.status = data.status;
        if (data.displayOrder !== undefined) repository.displayOrder = data.displayOrder;
        if (data.duration !== undefined) repository.duration = data.duration;
        if (data.duration_type !== undefined) repository.duration_type = data.duration_type;
        if (data.recurring !== undefined) repository.recurring = data.recurring;
        if (data.trial !== undefined) repository.trial = data.trial;
        if (data.is_lifetime !== undefined) repository.is_lifetime = data.is_lifetime;
        if (data.tools !== undefined) {
            repository.tools = (data.tools || []).map(tool => ({
                ...tool,
                slug: tool.slug
            }));
        };

        if (data.metadata !== undefined) repository.metadata = data.metadata;

        // Handle isDefault flag
        // if (data.isDefault !== undefined) {
        //     if (data.isDefault && !repository.isDefault) {
        //         // Setting as default, unset others first
        //         await this.planRepository.updateMany(
        //             { isDefault: true },
        //             { isDefault: false },
        //             options
        //         );
        //     }
        //     repository.isDefault = data.isDefault;
        // }

        const result = await this.planRepository.save(repository, options);
        return result;
    }

    async updateStatus(
        repository: PlanDoc,
        status: ENUM_PLAN_STATUS,
        options?: IDatabaseSaveOptions
    ): Promise<PlanDoc> {
        repository.status = status;
        const result = await this.planRepository.save(repository, options);
        await this.invalidateCache(repository._id.toString());
        return result;
    }

    async softDelete(
        repository: PlanDoc,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<PlanDoc> {
        // If deleting the default plan, find another active plan to set as default
        if (repository.isDefault) {
            const anotherActivePlan = await this.planRepository.findOne({
                _id: { $ne: repository._id },
                status: ENUM_PLAN_STATUS.ACTIVE,
            });

            if (anotherActivePlan) {
                anotherActivePlan.isDefault = true;
                await this.planRepository.save(anotherActivePlan, options);
            }
        }

        const result = await this.planRepository.softDelete(repository, options);
        await this.invalidateCache(repository._id.toString());
        return result;
    }

    async deleteMany(
        find: Record<string, any>,
        options?: IDatabaseDeleteManyOptions
    ): Promise<boolean> {
        await this.planRepository.deleteMany(find, options);
        return true;
    }

    async setAsDefault(
        planId: string,
        options?: IDatabaseSaveOptions
    ): Promise<PlanDoc> {
        await this.planRepository.setAsDefault(planId, options);
        await this.invalidateCache();
        return this.findOneById(planId);
    }

    async updateDisplayOrder(
        plans: Array<{ id: string; order: number }>,
        options?: IDatabaseSaveOptions
    ): Promise<void> {
        await this.planRepository.updateDisplayOrder(plans, options);
        await this.invalidateCache();
    }

    async findActiveByDisplayOrder(
        options?: IDatabaseFindAllOptions
    ): Promise<PlanDoc[]> {
        const cacheKey = this.CACHE_KEYS.PLANS_BY_DISPLAY_ORDER;

        if (!options) {
            const cached = await this.cacheManager.get<PlanDoc[]>(cacheKey);
            if (cached) {
                return cached;
            }
        }

        const plans = await this.planRepository.findActiveByDisplayOrder(options);

        if (!options) {
            await this.cacheManager.set(cacheKey, plans, this.CACHE_TTL);
        }

        return plans;
    }

    async countByStatus(status: ENUM_PLAN_STATUS): Promise<number> {
        return this.planRepository.countByStatus(status);
    }

    // Helper method to populate tool data in plans
    private async populateToolsInPlans(plans: PlanDoc[]): Promise<PlanDoc[]> {
        // Extract all tool IDs from all plans
        const toolIds = plans
            .flatMap(plan => plan.tools || [])
            .map(tool => tool._id.toString())
            .filter((id, index, self) => self.indexOf(id) === index); // Remove duplicates

        if (toolIds.length === 0) {
            return plans;
        }

        // Fetch all tools by IDs
        const tools: ToolsDoc[] = [];
        for (const toolId of toolIds) {
            try {
                const tool = await this.toolsService.findOneById(toolId);
                if (tool) {
                    tools.push(tool);
                }
            } catch (error) {
                // Ignore errors for individual tools
                console.warn(`Failed to fetch tool with ID: ${toolId}`, error);
            }
        }

        // Create a map for quick lookup
        const toolMap = new Map<string, ToolsDoc>();
        tools.forEach(tool => toolMap.set(tool._id.toString(), tool));

        // Populate tool data in plans
        const populatedPlans = plans.map(plan => {
            if (plan.tools && plan.tools.length > 0) {
                const populatedTools = plan.tools.map(tool => {
                    const toolDoc = toolMap.get(tool._id.toString());
                    if (toolDoc) {
                        return {
                            ...tool,
                            name: toolDoc.name, // Use the actual tool name from the tool document
                            slug: toolDoc.slug, // Use the actual tool slug from the tool document
                        };
                    }
                    return tool;
                });
                plan.tools = populatedTools;
            }
            return plan;
        });
        return populatedPlans;
    }

    async findAllWithPopulatedTools(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<PlanDoc[]> {
        const plans = await this.findAll(find, options);
        return this.populateToolsInPlans(plans);
    }

    async findAllActiveWithPopulatedTools(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<PlanDoc[]> {
        const plans = await this.findAllActive(find, options);
        return this.populateToolsInPlans(plans);
    }

    async findOneByIdWithPopulatedTools(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<PlanDoc> {
        const plan = await this.findOneById(_id, options);
        if (plan) {
            const populatedPlans = await this.populateToolsInPlans([plan]);
            return populatedPlans[0];
        }
        return plan;
    }

    async findOneWithPopulatedTools(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<PlanDoc> {
        const plan = await this.findOne(find, options);
        if (plan) {
            const populatedPlans = await this.populateToolsInPlans([plan]);
            return populatedPlans[0];
        }
        return plan;
    }

    async findActiveByDisplayOrderWithPopulatedTools(
        options?: IDatabaseFindAllOptions
    ): Promise<PlanDoc[]> {
        const plans = await this.findActiveByDisplayOrder(options);
        return this.populateToolsInPlans(plans);
    }

    mapList(plans: PlanDoc[] | IPlanEntity[]): PlanListResponseDto[] {
        return plainToInstance(
            PlanListResponseDto,
            plans.map((plan: PlanDoc | IPlanEntity) =>
                (plan as any).toObject ? (plan as any).toObject() : plan
            )
        );
    }

    mapGet(plan: PlanDoc | IPlanEntity): PlanGetResponseDto {
        return plainToInstance(
            PlanGetResponseDto,
            (plan as any).toObject ? (plan as any).toObject() : plan
        );
    }

    mapShort(plans: PlanDoc[] | IPlanEntity[]): PlanShortResponseDto[] {
        return plainToInstance(
            PlanShortResponseDto,
            plans.map((plan: PlanDoc | IPlanEntity) =>
                (plan as any).toObject ? (plan as any).toObject() : plan
            )
        );
    }

    private async invalidateCache(planId?: string): Promise<void> {
        const keysToInvalidate = [
            this.CACHE_KEYS.ACTIVE_PLANS,
            this.CACHE_KEYS.DEFAULT_PLAN,
            this.CACHE_KEYS.PLANS_BY_DISPLAY_ORDER,
        ];

        if (planId) {
            keysToInvalidate.push(this.CACHE_KEYS.PLAN_BY_ID(planId));
        }

        await Promise.all(
            keysToInvalidate.map(key => this.cacheManager.del(key))
        );
    }

    private async invalidatePlanByName(name: string): Promise<void> {
        await this.cacheManager.del(this.CACHE_KEYS.PLAN_BY_NAME(name));
    }
}