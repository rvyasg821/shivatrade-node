import { Command } from 'nestjs-command';
import { Injectable, Logger } from '@nestjs/common';
import { ToolsService } from '@modules/tools/services/tools.service';
import { WIDGET_DEFAULT_CONFIGURATIONS } from '@modules/widget/constants/widget-defaults.constant';
import toolsData from '../../../tools_data.json';

@Injectable()
export class MigrateToolsWidgetsSettingsCommand {
    private readonly logger = new Logger(MigrateToolsWidgetsSettingsCommand.name);

    constructor(
        private readonly toolsService: ToolsService,
    ) {}

    @Command({
        command: 'migrate:tools-widgets-settings',
        describe: 'Migrate tools with widgets and settings data',
    })
    async migrate(): Promise<void> {
        this.logger.log('Starting tools widgets and settings migration...');

        try {
            // Process each tool in tools_data.json
            for (const toolData of toolsData) {
                await this.processTool(toolData);
            }

            this.logger.log('Tools widgets and settings migration completed successfully');
        } catch (error) {
            this.logger.error('Tools widgets and settings migration failed:', error);
            throw error;
        }
    }

    /**
     * Process a single tool and update its widgets and settings
     */
    private async processTool(toolData: any): Promise<void> {
        try {
            const tool = await this.toolsService.findOne({ slug: toolData.slug });
            
            if (!tool) {
                this.logger.warn(`Tool with slug "${toolData.slug}" not found, skipping...`);
                return;
            }

            let widgets = [];
            let settings = [];
            
            if (toolData.settings && Array.isArray(toolData.settings)) {
                settings = toolData.settings;
            }
            
            const widgetMapping: Record<string, string> = {
                'wazuh': 'wazuh',
                'helpdesk-support-ticket': 'helpdesk-support-ticket',
                'openvas': 'openvas',
                'netswitch-threat-intel': 'netswitch-threat-intel'
            };
            
            const widgetKey = widgetMapping[toolData.slug];
            if (widgetKey && WIDGET_DEFAULT_CONFIGURATIONS[widgetKey]) {
                widgets = WIDGET_DEFAULT_CONFIGURATIONS[widgetKey].widgets;
            }

            if (widgets.length > 0 || settings.length > 0) {
                await this.toolsService.updateWidgetsAndSettings(tool, widgets, settings);
            } else {
                this.logger.log(`No widgets or settings to update for tool "${tool.name}"`);
            }
        } catch (error) {
            this.logger.error(`Failed to process tool "${toolData.name}":`, error);
        }
    }
}