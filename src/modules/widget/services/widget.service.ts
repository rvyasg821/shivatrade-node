import { Injectable, Logger } from '@nestjs/common';
import {
    WidgetNotFoundException,
    WidgetAccessDeniedException,
    WidgetOwnershipException
} from '../exceptions/widget.exception';
import { WidgetRepository } from '../repository/repositories/widget.repository';
import { WidgetProvisioningService } from './widget-provisioning.service';
import { WidgetCacheService } from './widget-cache.service';
import { WidgetDoc } from '../repository/entities/widget.entity';
import { IWidgetBulkUpdate, IWidgetResponse, IWidgetMetadata } from '../interfaces/widget.interface';

@Injectable()
export class WidgetService {
    private readonly logger = new Logger(WidgetService.name);

    constructor(
        private readonly widgetRepository: WidgetRepository,
        private readonly widgetProvisioningService: WidgetProvisioningService,
        private readonly widgetCacheService: WidgetCacheService,) { }

    private async getRepository(tenantId?: string): Promise<WidgetRepository> {
        // Tenant connection removed - using central database only
        return this.widgetRepository;
    }

    async getUserWidgets(tenantId: string, userId: string, toolSlug?: string): Promise<IWidgetResponse> {
        this.logger.log(`Getting widgets for tenant ${tenantId}, user ${userId}${toolSlug ? ` and tool ${toolSlug}` : ''}`);

        const repository = await this.getRepository(tenantId);
        let widgets: WidgetDoc[];
        const cacheKey = `${tenantId}_${userId}`;

        // Try to get from cache first (only for full user widgets, not filtered by tool)
        if (!toolSlug) {
            const cachedWidgets = this.widgetCacheService.getUserWidgets(cacheKey);
            if (cachedWidgets) {
                widgets = cachedWidgets;
            } else {
                widgets = await repository.findByUserId(userId);
                // Cache the result
                this.widgetCacheService.setUserWidgets(cacheKey, widgets);
            }
        } else {
            widgets = await repository.findByUserIdAndToolSlug(userId, toolSlug);
        }

        // If no widgets found, provision default widgets for the user
        if (widgets.length === 0) {
            this.logger.log(`No widgets found for tenant ${tenantId}, user ${userId}, provisioning default widgets`);
            await this.provisionDefaultWidgetsForUser(tenantId, userId);

            // Invalidate cache and fetch widgets again after provisioning
            this.widgetCacheService.invalidateUserWidgets(cacheKey);

            if (toolSlug) {
                widgets = await repository.findByUserIdAndToolSlug(userId, toolSlug);
            } else {
                widgets = await repository.findByUserId(userId);
                // Cache the newly provisioned widgets
                this.widgetCacheService.setUserWidgets(cacheKey, widgets);
            }
        }

        return {
            widgets,
            metadata: await this.getWidgetMetadata(),
        };
    }

    async findAllInvisibleWidgetsByUserId(tenantId: string, userId: string): Promise<IWidgetMetadata[]> {
        const repository = await this.getRepository(tenantId);
        const widgets = await repository.findAllInvisibleWidgetsByUserId(userId);
        const getWidgetMetadata = await this.getWidgetMetadata();
        const InvisibleMetaData = widgets.filter((widget: WidgetDoc) => widget.is_visible === false);

        if (InvisibleMetaData.length > 0) {
            return getWidgetMetadata.filter((meta: IWidgetMetadata) => InvisibleMetaData.some((widget: WidgetDoc) => widget.slug === meta.slug));
        } else {
            return []
        }
    }

    async updateWidgets(tenantId: string, userId: string, widgetUpdates: IWidgetBulkUpdate[]): Promise<WidgetDoc[]> {
        this.logger.log(`Updating ${widgetUpdates.length} widgets for tenant ${tenantId}, user ${userId}`);

        const repository = await this.getRepository(tenantId);

        // Validate that all widgets belong to the user
        await this.validateWidgetOwnership(tenantId, userId, widgetUpdates.map(w => w._id));

        // Perform bulk update
        await repository.bulkUpdateWidgets(widgetUpdates);

        const cacheKey = `${tenantId}_${userId}`;

        // Invalidate cache for this user
        this.widgetCacheService.invalidateUserWidgets(cacheKey);

        // Return updated widgets
        const updatedWidgets = await repository.findByUserId(userId);

        // Cache the updated widgets
        this.widgetCacheService.setUserWidgets(cacheKey, updatedWidgets);

        return updatedWidgets;
    }

    async getWidgetById(widgetId: string, userId: string): Promise<WidgetDoc> {
        // NOTE: This method doesn't take tenantId. It uses the default repository.
        // It might need refactoring if it needs to support tenant context.
        const widget = await this.widgetRepository.findOneById(widgetId);

        if (!widget) {
            throw new WidgetNotFoundException(widgetId);
        }

        if (widget?.user_id?.toString() !== userId) {
            throw new WidgetAccessDeniedException(widgetId);
        }

        return widget;
    }

    async deleteWidget(widgetId: string, userId: string): Promise<void> {
        // NOTE: Uses default repository
        const widget = await this.getWidgetById(widgetId, userId);

        await this.widgetRepository.softDelete(widget);
        this.logger.log(`Soft deleted widget ${widgetId} for user ${userId}`);
    }

    async restoreWidget(widgetId: string, userId: string): Promise<WidgetDoc> {
        // NOTE: Uses default repository
        const widget = await this.widgetRepository.findOneByIdIncludeDeleted(widgetId);

        if (!widget) {
            throw new WidgetNotFoundException(widgetId);
        }

        if (widget?.user_id?.toString() !== userId) {
            throw new WidgetAccessDeniedException(widgetId);
        }

        const restored = await this.widgetRepository.restore(widget);
        this.logger.log(`Restored widget ${widgetId} for user ${userId}`);

        return restored;
    }

    private async validateWidgetOwnership(tenantId: string, userId: string, widgetIds: string[]): Promise<void> {
        const repository = await this.getRepository(tenantId);
        const widgets = await repository.findByUserId(userId);
        const userWidgetIds = widgets.map(w => w._id.toString());

        const invalidWidgetIds = widgetIds.filter(id => !userWidgetIds.includes(id));

        if (invalidWidgetIds.length > 0) {
            throw new WidgetOwnershipException(invalidWidgetIds);
        }
    }

    private async provisionDefaultWidgetsForUser(tenantId: string, userId: string): Promise<void> {
        // Get the user's available tools from tenant tools service
        await this.widgetProvisioningService.provisionWidgetsForUser(tenantId, userId);
    }

    private async getWidgetMetadata(): Promise<IWidgetMetadata[]> {
        return await this.widgetCacheService.getWidgetMetadata();
    }

    async syncUserWidgetsWithTools(tenantId: string, userId: string, availableToolSlugs?: string[]): Promise<void> {
        this.logger.log(`Syncing widgets for tenant ${tenantId}, user ${userId}`);
        await this.widgetProvisioningService.syncWidgetsWithTools(tenantId, userId, availableToolSlugs);
    }

    async getUserWidgetsByToolSlug(tenantId: string, userId: string, toolSlug: string): Promise<WidgetDoc[]> {
        const repository = await this.getRepository(tenantId);
        return repository.findByUserIdAndToolSlug(userId, toolSlug);
    }

    async getWidgetMetadataOnly(): Promise<IWidgetMetadata[]> {
        return await this.getWidgetMetadata();
    }

    // Enhanced CRUD operations with tenant context
    async createWidget(tenantId: string, userId: string, widgetData: any): Promise<WidgetDoc> {
        this.logger.log(`Creating widget for tenant ${tenantId}, user ${userId}`);

        const repository = await this.getRepository(tenantId);

        // Validate that the user doesn't already have a widget with the same slug
        const existingWidget = await repository.findByUserIdAndSlugs(
            userId,
            [widgetData.slug]
        );

        if (existingWidget.length > 0) {
            throw new Error(`Widget with slug '${widgetData.slug}' already exists for user`);
        }

        const widgetEntity = {
            user_id: userId,
            slug: widgetData.slug,
            order: widgetData.order,
            is_visible: widgetData.is_visible,
            tool_slug: widgetData.tool_slug,
            status: widgetData.status ?? true,
            soft_delete: false,
        };

        const createdWidgets = await repository.createDefaultWidgets([widgetEntity]);
        const createdWidget = createdWidgets[0];

        // Invalidate cache for this user
        const cacheKey = `${tenantId}_${userId}`;
        this.widgetCacheService.invalidateUserWidgets(cacheKey);

        this.logger.log(`Successfully created widget ${createdWidget._id} for tenant ${tenantId}, user ${userId}`);
        return createdWidget;
    }

    async updateSingleWidget(
        tenantId: string,
        userId: string,
        widgetId: string,
        updateData: any
    ): Promise<WidgetDoc> {
        this.logger.log(`Updating widget ${widgetId} for tenant ${tenantId}, user ${userId}`);

        const repository = await this.getRepository(tenantId);

        // Get the widget and validate ownership
        await this.getWidgetByIdWithTenant(tenantId, userId, widgetId);

        // Prepare update data
        const updateFields: any = {};
        if (updateData.order !== undefined) updateFields.order = updateData.order;
        if (updateData.is_visible !== undefined) updateFields.is_visible = updateData.is_visible;
        if (updateData.slug !== undefined) updateFields.slug = updateData.slug;
        if (updateData.tool_slug !== undefined) updateFields.tool_slug = updateData.tool_slug;
        if (updateData.status !== undefined) updateFields.status = updateData.status;

        // Update the widget
        await repository.updateSingleWidget(tenantId, widgetId, updateFields);

        // Invalidate cache
        const cacheKey = `${tenantId}_${userId}`;
        this.widgetCacheService.invalidateUserWidgets(cacheKey);

        // Return updated widget
        return this.getWidgetByIdWithTenant(tenantId, userId, widgetId);
    }

    async getWidgetByIdWithTenant(tenantId: string, userId: string, widgetId: string): Promise<WidgetDoc> {
        this.logger.log(`Getting widget ${widgetId} for tenant ${tenantId}, user ${userId}`);

        const repository = await this.getRepository(tenantId);

        const widget = await repository.findOneById(widgetId);

        if (!widget) {
            throw new WidgetNotFoundException(widgetId);
        }

        if (widget?.user_id?.toString() !== userId) {
            throw new WidgetAccessDeniedException(widgetId);
        }

        return widget;
    }

    async deleteWidgetWithTenant(tenantId: string, userId: string, widgetId: string): Promise<void> {
        this.logger.log(`Deleting widget ${widgetId} for tenant ${tenantId}, user ${userId}`);

        const repository = await this.getRepository(tenantId);

        // Validate ownership
        await this.getWidgetByIdWithTenant(tenantId, userId, widgetId);

        // Perform soft delete
        await repository.softDeleteById(tenantId, widgetId);

        // Invalidate cache
        const cacheKey = `${tenantId}_${userId}`;
        this.widgetCacheService.invalidateUserWidgets(cacheKey);

        this.logger.log(`Successfully deleted widget ${widgetId} for tenant ${tenantId}, user ${userId}`);
    }

    async restoreWidgetWithTenant(tenantId: string, userId: string, widgetId: string): Promise<WidgetDoc> {
        this.logger.log(`Restoring widget ${widgetId} for tenant ${tenantId}, user ${userId}`);

        const repository = await this.getRepository(tenantId);

        // Get the widget including deleted ones
        const widget = await repository.findOneByIdIncludeDeleted(widgetId);

        if (!widget) {
            throw new WidgetNotFoundException(widgetId);
        }

        if (widget?.user_id?.toString() !== userId) {
            throw new WidgetAccessDeniedException(widgetId);
        }

        // Restore the widget
        await repository.restoreById(tenantId, widgetId);

        // Invalidate cache
        const cacheKey = `${tenantId}_${userId}`;
        this.widgetCacheService.invalidateUserWidgets(cacheKey);

        // Return restored widget
        return this.getWidgetByIdWithTenant(tenantId, userId, widgetId);
    }

    // Additional tenant-specific utility methods
    async getWidgetsByTenantAndFilters(
        tenantId: string,
        filters: Record<string, any> = {}
    ): Promise<WidgetDoc[]> {
        this.logger.log(`Getting widgets for tenant ${tenantId} with filters:`, filters);
        const repository = await this.getRepository(tenantId);
        return repository.findByTenantAndFilters(tenantId, filters);
    }

    async getWidgetCountByTenant(
        tenantId: string,
        filters: Record<string, any> = {}
    ): Promise<number> {
        this.logger.log(`Getting widget count for tenant ${tenantId} with filters:`, filters);
        const repository = await this.getRepository(tenantId);
        return repository.getTotalByTenantAndFilters(tenantId, filters);
    }

    async validateTenantAccess(tenantId: string, userId: string): Promise<boolean> {
        // This is now centrally handled by TenantAccessGuard
        return true;
    }

    async bulkCreateWidgets(tenantId: string, userId: string, widgetsData: any[]): Promise<WidgetDoc[]> {
        this.logger.log(`Bulk creating ${widgetsData.length} widgets for tenant ${tenantId}, user ${userId}`);

        const repository = await this.getRepository(tenantId);

        const widgetEntities = widgetsData.map(widgetData => ({
            user_id: userId,
            slug: widgetData.slug,
            order: widgetData.order,
            is_visible: widgetData.is_visible,
            tool_slug: widgetData.tool_slug,
            status: widgetData.status ?? true,
            soft_delete: false,
        }));

        const createdWidgets = await repository.createDefaultWidgets(widgetEntities);

        // Invalidate cache for this user
        const cacheKey = `${tenantId}_${userId}`;
        this.widgetCacheService.invalidateUserWidgets(cacheKey);

        this.logger.log(`Successfully created ${createdWidgets.length} widgets for tenant ${tenantId}, user ${userId}`);
        return createdWidgets;
    }
}
