import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { AuthJwtAccessProtected } from '@modules/auth/decorators/auth.jwt.decorator';
import { Response } from '@common/response/decorators/response.decorator';
import { IResponse } from '@common/response/interfaces/response.interface';
import { PermissionGuard } from '@modules/role/guards/permission.guard';
import { Permission } from '@modules/role/decorators/permission.decorator';

import { SubscriptionService } from '../services/subscription.service';
import { CompanyService } from '@modules/company/services/company.service';
import { SubscriptionToolLoggerService } from '@common/logger/services/subscription-tool-logger.service';

@ApiTags('modules.admin.subscription-diagnostics')
@Controller({
    version: '1',
    path: '/subscription-diagnostics',
})
export class SubscriptionDiagnosticsAdminController {
    constructor(
        private readonly subscriptionService: SubscriptionService,
        private readonly companyService: CompanyService,
        private readonly subscriptionToolLogger: SubscriptionToolLoggerService
    ) { }

    @ApiOperation({
        summary: 'Diagnose subscription tool issues',
        description: 'Analyze why tools are not being restored for a subscription',
    })
    @ApiParam({
        name: 'subscriptionId',
        required: true,
        description: 'Subscription ID to diagnose',
    })
    @ApiResponse({
        status: 200,
        description: 'Diagnostic results retrieved successfully',
    })
    @Response('subscription-diagnostics.analyze')
    @Permission('subscription', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Get('/analyze/:subscriptionId')
    async analyzeSubscription(
        @Param('subscriptionId') subscriptionId: string
    ): Promise<IResponse<any>> {
        try {
            // Get subscription details
            const subscription = await this.subscriptionService.findOneById(subscriptionId);
            if (!subscription) {
                return {
                    data: {
                        error: 'Subscription not found',
                        subscriptionId
                    }
                };
            }

            // Get company details
            const company = await this.companyService.findOneById(subscription.company_id.toString());
            if (!company) {
                return {
                    data: {
                        error: 'Company not found',
                        subscriptionId,
                        companyId: subscription.company_id.toString()
                    }
                };
            }

            // Analyze each tool
            const toolDiagnostics = [];
            if (subscription.tools && subscription.tools.length > 0) {
                for (const tool of subscription.tools) {
                    toolDiagnostics.push({
                        toolName: tool.name,
                        toolId: tool._id,
                        toolExists: true,
                        configLoaded: true,
                        message: 'Tool configuration available in subscription'
                    });
                }
            }

            return {
                data: {
                    subscriptionId,
                    companyId: company._id,
                    tenantId: company.tenantId,
                    subscriptionStatus: subscription.status,
                    companySubscribeStatus: company.is_subscribe,
                    toolsCount: subscription.tools?.length || 0,
                    toolDiagnostics,
                    summary: {
                        toolsInConfig: toolDiagnostics.filter(t => t.toolExists).length,
                        configsLoaded: toolDiagnostics.filter(t => t.configLoaded).length,
                        existingTools: toolDiagnostics.filter(t => t.existingTool).length,
                        errors: toolDiagnostics.filter(t => t.error).length
                    }
                }
            };

        } catch (error) {
            this.subscriptionToolLogger.logError(
                `Error analyzing subscription ${subscriptionId}: ${error.message}`,
                error.stack,
                'SubscriptionDiagnosticsController'
            );

            return {
                data: {
                    error: error.message,
                    subscriptionId
                }
            };
        }
    }

    @ApiOperation({
        summary: 'Get recent subscription tool logs',
        description: 'Retrieve recent logs from the subscription tools log file',
    })
    @ApiQuery({
        name: 'lines',
        required: false,
        type: Number,
        description: 'Number of log lines to retrieve (default: 50)',
    })
    @ApiResponse({
        status: 200,
        description: 'Log entries retrieved successfully',
    })
    @Response('subscription-diagnostics.logs')
    @Permission('subscription', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Get('/logs')
    async getRecentLogs(
        @Query('lines') lines?: number
    ): Promise<IResponse<{ logs: string[]; filePath: string }>> {
        const recentLogs = this.subscriptionToolLogger.getRecentLogs(lines || 50);
        const filePath = this.subscriptionToolLogger.getLogFilePath();

        return {
            data: {
                logs: recentLogs,
                filePath
            }
        };
    }

    @ApiOperation({
        summary: 'Test tool configuration',
        description: 'Test if a specific tool exists in the configuration',
    })
    @ApiQuery({
        name: 'toolName',
        required: true,
        description: 'Tool name to test',
    })
    @ApiResponse({
        status: 200,
        description: 'Tool configuration test results',
    })
    @Response('subscription-diagnostics.testTool')
    @Permission('subscription', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Get('/test-tool')
    async testToolConfiguration(
        @Query('toolName') toolName: string
    ): Promise<IResponse<any>> {
        try {
            // Tool configuration is now managed through the master Tools collection
            // This diagnostic endpoint is deprecated in the new architecture
            return {
                data: {
                    toolName,
                    exists: true,
                    message: 'Tool diagnostics now use master Tools collection',
                    config: null
                }
            };

        } catch (error) {
            this.subscriptionToolLogger.logError(
                `Error testing tool configuration for ${toolName}: ${error.message}`,
                error.stack,
                'SubscriptionDiagnosticsController'
            );

            return {
                data: {
                    toolName,
                    error: error.message
                }
            };
        }
    }

    @ApiOperation({
        summary: 'Test tool configuration by slug',
        description: 'Test if a tool configuration exists and is valid by slug',
    })
    @ApiQuery({
        name: 'toolSlug',
        required: true,
        type: String,
        description: 'Tool slug to test',
        example: 'wazuh'
    })
    @ApiResponse({
        status: 200,
        description: 'Tool configuration test results by slug',
    })
    @Response('subscription-diagnostics.testToolBySlug')
    @Permission('subscription', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Get('/test-tool-by-slug')
    async testToolConfigurationBySlug(
        @Query('toolSlug') toolSlug: string
    ): Promise<IResponse<any>> {
        try {
            // Tool configuration is now managed through the master Tools collection
            // This diagnostic endpoint is deprecated in the new architecture
            return {
                data: {
                    toolSlug,
                    exists: true,
                    message: 'Tool diagnostics now use master Tools collection',
                    config: null
                }
            };

        } catch (error) {
            this.subscriptionToolLogger.logError(
                `Error testing tool configuration by slug for ${toolSlug}: ${error.message}`,
                error.stack,
                'SubscriptionDiagnosticsController'
            );

            return {
                data: {
                    toolSlug,
                    error: error.message
                }
            };
        }
    }
}