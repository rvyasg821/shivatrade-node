import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionRepository } from '../repository/repositories/subscription.repository';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';

import { CleanupMetrics, CleanupAuditLog } from '../interfaces/cleanup-metrics.interface';

export interface CleanupResult {
    executed: boolean;
    toolsDeleted: number;
    settingsDeleted: number;
    cronDeleted: number;
    message: string;
    error?: string;
}

@Injectable()
export class SubscriptionCleanupService {
    private readonly logger = new Logger(SubscriptionCleanupService.name);
    private metrics: CleanupMetrics = {
        totalCleanupAttempts: 0,
        successfulCleanups: 0,
        failedCleanups: 0,
        totalToolsDeleted: 0,
        totalSettingsDeleted: 0,
        totalCronDeleted: 0,
        averageCleanupTime: 0,
        lastCleanupTimestamp: new Date(),
    };
    private auditLogs: CleanupAuditLog[] = [];

    constructor(
        private readonly subscriptionRepository: SubscriptionRepository,
        private readonly companyRepository: CompanyRepository,) { }

    async checkAndExecuteCleanup(subscriptionId: string, companyId: string): Promise<CleanupResult> {
        try {
            this.logger.log(`Checking cleanup conditions for subscription: ${subscriptionId}, company: ${companyId}`);

            // Validate input parameters
            const validationResult = this.validateInputParameters(subscriptionId, companyId);
            if (!validationResult.isValid) {
                return validationResult.result;
            }

            // Get subscription and company data
            const subscription = await this.subscriptionRepository.findOneById(subscriptionId);
            const company = await this.companyRepository.findOneById(companyId);

            if (!subscription) {
                const error = `Subscription not found: ${subscriptionId}`;
                this.logger.error(error);
                return {
                    executed: false,
                    toolsDeleted: 0,
                    settingsDeleted: 0,
                    cronDeleted: 0,
                    message: 'Cleanup not executed - subscription not found',
                    error
                };
            }

            if (!company) {
                const error = `Company not found: ${companyId}`;
                this.logger.error(error);
                return {
                    executed: false,
                    toolsDeleted: 0,
                    settingsDeleted: 0,
                    cronDeleted: 0,
                    message: 'Cleanup not executed - company not found',
                    error
                };
            }

            // Validate subscription belongs to company
            const relationshipValidation = this.validateSubscriptionCompanyRelationship(subscription, company);
            if (!relationshipValidation.isValid) {
                return relationshipValidation.result;
            }

            // Check if cleanup conditions are met
            const shouldCleanup = subscription.status === false && company.is_subscribe === false;

            if (!shouldCleanup) {
                this.logger.log(`Cleanup conditions not met - subscription status: ${subscription.status}, company is_subscribe: ${company.is_subscribe}`);
                return {
                    executed: false,
                    toolsDeleted: 0,
                    settingsDeleted: 0,
                    cronDeleted: 0,
                    message: 'Cleanup not executed - conditions not met (both subscription status and company is_subscribe must be false)'
                };
            }

            // Execute cleanup
            this.logger.log(`Cleanup conditions met, executing cleanup for subscription: ${subscriptionId}`);
            return await this.softDeleteTenantResources(subscriptionId);

        } catch (error) {
            this.logger.error(`Error during cleanup check for subscription ${subscriptionId}: ${error.message}`, error.stack);
            return {
                executed: false,
                toolsDeleted: 0,
                settingsDeleted: 0,
                cronDeleted: 0,
                message: 'Cleanup failed due to unexpected error',
                error: error.message
            };
        }
    }

    private validateInputParameters(subscriptionId: string, companyId: string): { isValid: boolean; result?: CleanupResult } {
        // Check for null, undefined, or empty strings
        if (!subscriptionId || !companyId ||
            typeof subscriptionId !== 'string' || typeof companyId !== 'string' ||
            subscriptionId.trim() === '' || companyId.trim() === '') {
            const error = 'Invalid parameters: subscriptionId and companyId must be non-empty strings';
            this.logger.error(error);
            return {
                isValid: false,
                result: {
                    executed: false,
                    toolsDeleted: 0,
                    settingsDeleted: 0,
                    cronDeleted: 0,
                    message: 'Cleanup not executed due to invalid parameters',
                    error
                }
            };
        }

        return { isValid: true };
    }

    private validateSubscriptionCompanyRelationship(subscription: any, company: any): { isValid: boolean; result?: CleanupResult } {
        // Check if subscription belongs to the company
        const subscriptionCompanyId = subscription.company_id?.toString() || subscription.companyId?.toString();
        const companyIdStr = company._id.toString();

        if (subscriptionCompanyId !== companyIdStr) {
            const error = `Subscription ${subscription._id} does not belong to company ${companyIdStr}`;
            this.logger.error(error);
            return {
                isValid: false,
                result: {
                    executed: false,
                    toolsDeleted: 0,
                    settingsDeleted: 0,
                    cronDeleted: 0,
                    message: 'Cleanup not executed - subscription does not belong to specified company',
                    error
                }
            };
        }

        return { isValid: true };
    }

    async softDeleteTenantResources(subscriptionId: string): Promise<CleanupResult> {
        try {
            this.logger.log(`Starting soft delete of tenant resources for subscription: ${subscriptionId}`);

            // Get subscription to find tenant information
            const subscription = await this.subscriptionRepository.findOneById(subscriptionId);
            if (!subscription) {
                throw new Error(`Subscription not found: ${subscriptionId}`);
            }
            const company = await this.companyRepository.findOneById(subscription.company_id.toString());
            if (!company || !company.tenantId) {
                return {
                    executed: false,
                    toolsDeleted: 0,
                    settingsDeleted: 0,
                    cronDeleted: 0,
                    message: 'Soft delete operation failed - company or tenantId not found',
                }
            }
            const tenantId = company.tenantId;
            //Assign Connection to tenantToolsRepository for the subscription's Users tenant
            // Tenant service removed: const connection = await this.tenantConnectionService.getConnection(tenantId);

            // Cleanup is now handled through TenantToolSettingsService
            // Since tools are no longer duplicated, we just need to soft-delete settings
            const cleanupResult = {
                toolsDeleted: 0,
                settingsDeleted: 0,
                cronDeleted: 0
            };
            
            this.logger.log(`Cleanup completed - tools are now managed through master Tools collection`);

            this.logger.log(`Cleanup completed for subscription ${subscriptionId}: Tools: ${cleanupResult.toolsDeleted}, Settings: ${cleanupResult.settingsDeleted}, Cron: ${cleanupResult.cronDeleted}`);

            return {
                executed: true,
                toolsDeleted: cleanupResult.toolsDeleted,
                settingsDeleted: cleanupResult.settingsDeleted,
                cronDeleted: cleanupResult.cronDeleted,
                message: `Successfully cleaned up ${cleanupResult.toolsDeleted} tools, ${cleanupResult.settingsDeleted} settings, and ${cleanupResult.cronDeleted} cron entries`
            };

        } catch (error) {
            this.logger.error(`Failed to soft delete tenant resources for subscription ${subscriptionId}: ${error.message}`, error.stack);
            return {
                executed: false,
                toolsDeleted: 0,
                settingsDeleted: 0,
                cronDeleted: 0,
                message: 'Soft delete operation failed',
                error: error.message
            };
        }
    }

    private recordCleanupAttempt(
        subscriptionId: string,
        companyId: string,
        result: CleanupResult,
        executionTimeMs: number,
        triggeredBy: CleanupAuditLog['triggeredBy'] = 'manual'
    ): void {
        // Update metrics
        this.metrics.totalCleanupAttempts++;
        this.metrics.lastCleanupTimestamp = new Date();

        if (result.executed) {
            this.metrics.successfulCleanups++;
            this.metrics.totalToolsDeleted += result.toolsDeleted;
            this.metrics.totalSettingsDeleted += result.settingsDeleted;
            this.metrics.totalCronDeleted += result.cronDeleted;
        } else {
            this.metrics.failedCleanups++;
        }

        // Calculate average cleanup time
        this.metrics.averageCleanupTime =
            (this.metrics.averageCleanupTime * (this.metrics.totalCleanupAttempts - 1) + executionTimeMs) /
            this.metrics.totalCleanupAttempts;

        // Create audit log entry
        const auditLog: CleanupAuditLog = {
            subscriptionId,
            companyId,
            timestamp: new Date(),
            success: result.executed,
            toolsDeleted: result.toolsDeleted,
            settingsDeleted: result.settingsDeleted,
            cronDeleted: result.cronDeleted,
            executionTimeMs,
            error: result.error,
            triggeredBy,
        };

        // Keep only last 1000 audit logs to prevent memory issues
        this.auditLogs.push(auditLog);
        if (this.auditLogs.length > 1000) {
            this.auditLogs.shift();
        }

        // Log metrics for monitoring
        this.logger.log(
            `Cleanup metrics - Attempts: ${this.metrics.totalCleanupAttempts}, ` +
            `Success: ${this.metrics.successfulCleanups}, ` +
            `Failed: ${this.metrics.failedCleanups}, ` +
            `Avg Time: ${this.metrics.averageCleanupTime.toFixed(2)}ms`
        );
    }

    getMetrics(): CleanupMetrics {
        return { ...this.metrics };
    }

    getAuditLogs(limit: number = 100): CleanupAuditLog[] {
        return this.auditLogs.slice(-limit);
    }

    getRecentFailures(hours: number = 24): CleanupAuditLog[] {
        const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
        return this.auditLogs.filter(log =>
            !log.success && log.timestamp >= cutoffTime
        );
    }

    async checkAndExecuteCleanupWithMetrics(
        subscriptionId: string,
        companyId: string,
        triggeredBy: CleanupAuditLog['triggeredBy'] = 'manual'
    ): Promise<CleanupResult> {
        const startTime = Date.now();

        try {
            const result = await this.checkAndExecuteCleanup(subscriptionId, companyId);
            const executionTime = Date.now() - startTime;

            this.recordCleanupAttempt(subscriptionId, companyId, result, executionTime, triggeredBy);

            return result;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            const errorResult: CleanupResult = {
                executed: false,
                toolsDeleted: 0,
                settingsDeleted: 0,
                cronDeleted: 0,
                message: 'Cleanup failed with exception',
                error: error.message
            };

            this.recordCleanupAttempt(subscriptionId, companyId, errorResult, executionTime, triggeredBy);

            return errorResult;
        }
    }
}