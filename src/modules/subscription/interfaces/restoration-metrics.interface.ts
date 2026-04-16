export interface RestorationMetrics {
    totalRestorationAttempts: number;
    successfulRestorations: number;
    failedRestorations: number;
    totalToolsRestored: number;
    totalSettingsRestored: number;
    totalCronRestored: number;
    totalTransitions: number;
    successfulTransitions: number;
    failedTransitions: number;
    averageRestorationTime: number;
    averageTransitionTime: number;
    lastRestorationTimestamp: Date;
    lastTransitionTimestamp: Date;
}

export interface RestorationAuditLog {
    subscriptionId: string;
    companyId?: string;
    timestamp: Date;
    operation: 'restoration' | 'transition';
    success: boolean;
    toolsRestored?: number;
    settingsRestored?: number;
    cronRestored?: number;
    oldToolsDeactivated?: number;
    newToolsCreated?: number;
    settingsCreated?: number;
    cronCreated?: number;
    executionTimeMs: number;
    error?: string;
    triggeredBy: 'tool_provisioning' | 'subscription_activation' | 'subscription_creation' | 'manual';
    details?: {
        toolIds?: string[];
        oldSubscriptionId?: string;
        newSubscriptionId?: string;
    };
}