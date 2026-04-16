export interface CleanupMetrics {
    totalCleanupAttempts: number;
    successfulCleanups: number;
    failedCleanups: number;
    totalToolsDeleted: number;
    totalSettingsDeleted: number;
    totalCronDeleted: number;
    averageCleanupTime: number;
    lastCleanupTimestamp: Date;
}

export interface CleanupAuditLog {
    subscriptionId: string;
    companyId: string;
    timestamp: Date;
    success: boolean;
    toolsDeleted: number;
    settingsDeleted: number;
    cronDeleted: number;
    executionTimeMs: number;
    error?: string;
    triggeredBy: 'subscription_status_change' | 'company_suspend' | 'subscription_update' | 'manual';
}