import { Injectable, Logger } from '@nestjs/common';
import { WidgetRepository } from '../repository/repositories/widget.repository';
import { WidgetDoc, WidgetEntity } from '../repository/entities/widget.entity';
import { IWidgetDefaultConfig } from '../interfaces/widget.interface';
import { ENUM_WIDGET_TOOL_SLUG } from '../enums/widget.enum';
import { ToolsService } from '@modules/tools/services/tools.service';
import { CompanyService } from '@modules/company/services/company.service';
// import { SubscriptionService } from '@modules/subscription/services/subscription.service';

@Injectable()
export class WidgetProvisioningService {
    private readonly logger = new Logger(WidgetProvisioningService.name);

    constructor(
        private readonly widgetRepository: WidgetRepository,
        private readonly toolsService: ToolsService,
        private readonly companyService: CompanyService,
        // private readonly subscriptionService: SubscriptionService, // DISABLED: Service temporarily disabled
    ) { }

    private async getRepository(tenantId?: string): Promise<WidgetRepository> {
        // Tenant connection removed - using central database only
        return this.widgetRepository;
    }

    async provisionWidgetsForUser(tenantId: string, userId: string, toolSlugs?: string[]): Promise<WidgetDoc[]> {
        this.logger.log(`Provisioning widgets for tenant ${tenantId}, user ${userId}`);

        const repository = await this.getRepository(tenantId);

        // If no tool slugs provided, get all active tools from subscription
        let availableToolSlugs = toolSlugs;
        if (!availableToolSlugs) {
            // Get company from tenant
            // TODO: Restore subscription service integration after tenant cleanup
            // const company = await this.companyService.findOne({ tenantId, soft_delete: false });
            // Subscription service disabled - returning empty tools list
            availableToolSlugs = [];
        }

        this.logger.log(`Available tools for tenant ${tenantId}: ${availableToolSlugs.join(', ')}`);

        const allWidgetsToCreate: Partial<WidgetEntity>[] = [];

        for (const toolSlug of availableToolSlugs) {
            const widgetsForTool = await this.getWidgetsToCreateForTool(tenantId, userId, toolSlug);
            allWidgetsToCreate.push(...widgetsForTool);
        }

        if (allWidgetsToCreate.length === 0) {
            this.logger.log(`No new widgets to create for tenant ${tenantId}, user ${userId}`);
            return [];
        }

        const createdWidgets = await repository.createDefaultWidgets(allWidgetsToCreate);
        this.logger.log(`Created ${createdWidgets.length} widgets for tenant ${tenantId}, user ${userId}`);

        return createdWidgets;
    }

    async syncWidgetsWithTools(tenantId: string, userId: string, availableToolSlugs?: string[]): Promise<void> {
        this.logger.log(`Syncing widgets for tenant ${tenantId}, user ${userId}`);

        const repository = await this.getRepository(tenantId);

        // If no tool slugs provided, get all active tools from subscription
        let currentToolSlugs = availableToolSlugs;
        if (!currentToolSlugs) {
            // TODO: Restore subscription service integration after tenant cleanup
            // Subscription service disabled - returning empty tools list
            currentToolSlugs = [];
        }

        this.logger.log(`Current tools for tenant ${tenantId}: ${currentToolSlugs.join(', ')}`);

        // Get all existing widgets for the user
        const existingWidgets = await repository.findByUserId(userId);
        const existingToolSlugs = [...new Set(existingWidgets.map(w => w.tool_slug))];

        // Find tools that were removed
        const removedToolSlugs = existingToolSlugs.filter(toolSlug => !currentToolSlugs.includes(toolSlug));

        // Find tools that were added
        const addedToolSlugs = currentToolSlugs.filter(toolSlug => !existingToolSlugs.includes(toolSlug));

        // Soft delete widgets for removed tools
        for (const removedToolSlug of removedToolSlugs) {
            await repository.softDeleteByUserIdAndToolSlug(userId, removedToolSlug);
            this.logger.log(`Soft deleted widgets for removed tool: ${removedToolSlug}`);
        }

        // Create widgets for new tools
        if (addedToolSlugs.length > 0) {
            await this.provisionWidgetsForUser(tenantId, userId, addedToolSlugs);
        }
    }

    async createDefaultWidgetsForTool(tenantId: string, userId: string, toolSlug: string): Promise<WidgetDoc[]> {
        this.logger.log(`Creating default widgets for tenant ${tenantId}, user ${userId} and tool ${toolSlug}`);

        const repository = await this.getRepository(tenantId);

        if (!this.isValidToolSlug(toolSlug)) {
            this.logger.warn(`Invalid tool slug: ${toolSlug}`);
            return [];
        }

        const widgetsToCreate = await this.getWidgetsToCreateForTool(tenantId, userId, toolSlug);

        if (widgetsToCreate.length === 0) {
            return [];
        }

        return repository.createDefaultWidgets(widgetsToCreate);
    }

    private async getWidgetsToCreateForTool(tenantId: string, userId: string, toolSlug: string): Promise<Partial<WidgetEntity>[]> {
        const repository = await this.getRepository(tenantId);

        // Get widgets from tools entity
        let toolConfig: { widgets: IWidgetDefaultConfig[] } | undefined;

        try {
            // Try to find tool by slug in database
            const toolDoc = await this.toolsService.findOne({ slug: toolSlug });
            if (toolDoc && toolDoc.widgets && Array.isArray(toolDoc.widgets)) {
                toolConfig = { widgets: toolDoc.widgets };
            }
        } catch (error) {
            this.logger.warn(`Failed to get tool widgets from database for ${toolSlug}: ${error.message}`);
        }

        // If no tool config found, return empty array
        if (!toolConfig) {
            this.logger.warn(`No configuration found for tool: ${toolSlug}`);
            return [];
        }

        // Get expected widget slugs for this tool
        const expectedWidgetSlugs = toolConfig.widgets.map(w => w.slug);

        // Check which widgets already exist
        const existingWidgets = await repository.findExistingWidgetsByUserIdAndSlugs(userId, expectedWidgetSlugs);
        const existingSlugs = existingWidgets.map(w => w.slug);

        // Filter out widgets that already exist
        const widgetsToCreate = toolConfig.widgets
            .filter(widgetConfig => !existingSlugs.includes(widgetConfig.slug))
            .map(widgetConfig => this.createWidgetEntityFromConfig(userId, toolSlug, widgetConfig));

        return widgetsToCreate;
    }

    private createWidgetEntityFromConfig(
        userId: string,
        toolSlug: string,
        config: IWidgetDefaultConfig
    ): Partial<WidgetEntity> {
        return {
            user_id: userId,
            slug: config.slug,
            order: config.order,
            is_visible: config.is_visible,
            tool_slug: toolSlug,
            status: true,
            soft_delete: false,
        };
    }

    private isValidToolSlug(toolSlug: string): boolean {
        return Object.values(ENUM_WIDGET_TOOL_SLUG).includes(toolSlug as ENUM_WIDGET_TOOL_SLUG);
    }

    async getDefaultConfigurationForTool(toolSlug: string): Promise<IWidgetDefaultConfig[]> {
        // Get widgets from tools entity
        try {
            const toolDoc = await this.toolsService.findOne({ slug: toolSlug });
            if (toolDoc && toolDoc.widgets && Array.isArray(toolDoc.widgets)) {
                return toolDoc.widgets;
            }
        } catch (error) {
            this.logger.warn(`Failed to get tool widgets from database for ${toolSlug}: ${error.message}`);
        }

        // Return empty array if no widgets found
        return [];
    }

    async getAllSupportedToolSlugs(tenantId?: string): Promise<string[]> {
        if (tenantId) {
            // TODO: Restore subscription service integration after tenant cleanup
            // Subscription service disabled - returning empty list
            return [];
        }

        // Get all tool slugs from database
        try {
            const tools = await this.toolsService.findAll();
            return tools.map(tool => tool.slug);
        } catch (error) {
            this.logger.warn(`Failed to get tool slugs from database: ${error.message}`);
            return [];
        }
    }
}