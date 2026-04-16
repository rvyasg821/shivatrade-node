export interface ICreateTenantTool {
    name: string;
    slug?: string;
    description: string;
    subscriptionId: string;
    originalToolId: string;
    configDescription?: string;
}

export interface ICreateToolSchedule {
    name: string;
    description: string;
    cronString: string;
    tenantToolId: string;
    subscriptionId: string;
}

export interface IToolProvisioningResult {
    subscriptionId: string;
    tenantId: string;
    provisionedTools: string[];
    createdSchedules: string[];
    status: 'success' | 'partial' | 'failed';
    errors?: string[];
}

export interface IProvisioningErrorLog {
    subscriptionId: string;
    tenantId: string;
    operation: string;
    error: string;
    timestamp: Date;
    retryAttempt?: number;
}