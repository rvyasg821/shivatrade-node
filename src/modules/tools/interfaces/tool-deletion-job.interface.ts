export interface IToolDeletionJobData {
    toolId: string;
    toolSlug: string;
    operationType: 'delete' | 'inactivate';
    initiatedBy: string;
    timestamp: Date;
}

export interface ICascadeStepResult {
    stepName: string;
    success: boolean;
    affectedCount: number;
    executionTime: number;
    error?: string;
}

export interface IToolDeletionResult {
    success: boolean;
    toolId: string;
    operationType: 'delete' | 'inactivate';
    steps: ICascadeStepResult[];
    totalExecutionTime: number;
    errors: string[];
}

export interface IRecalculatedPricing {
    originalToolsPrice: number;
    newToolsPrice: number;
    platformPrice: number;
    totalPrice: number;
    taxValue: number;
    finalPrice: number;
}
