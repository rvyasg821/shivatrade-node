import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { appendFileSync } from 'fs';
import { join } from 'path';
// import { CascadeOperationsService } from '../services/cascade-operations.service';
import {
    IToolDeletionJobData,
    IToolDeletionResult,
    ICascadeStepResult,
} from '../interfaces/tool-deletion-job.interface';

@Processor(process.env.TOOL_DELETION_QUEUE_NAME || 'tool-deletion')
export class ToolDeletionProcessor extends WorkerHost {
    private readonly logger = new Logger(ToolDeletionProcessor.name);
    private readonly logFile = join(process.cwd(), 'logs', 'processor-debug.log');

    constructor(
        // private readonly cascadeOperationsService: CascadeOperationsService, // DISABLED: Service temporarily disabled
    ) {
        super();
        const msg = `ToolDeletionProcessor INSTANTIATED at ${new Date().toISOString()}`;
        this.writeLog(msg);
        // this.writeLog(`CascadeOperationsService is: ${cascadeOperationsService ? 'DEFINED' : 'UNDEFINED'}`);
    }

    private writeLog(message: string) {
        try {
            appendFileSync(this.logFile, `[${new Date().toISOString()}] ${message}\n`);
        } catch (error) {
            // Ignore
        }
    }

    async process(job: Job<IToolDeletionJobData>): Promise<IToolDeletionResult> {
        this.writeLog(`========== PROCESS METHOD CALLED ==========`);
        this.writeLog(`Job ID: ${job.id}`);
        this.writeLog(`Job Data: ${JSON.stringify(job.data)}`);

        const { toolId, toolSlug, operationType, initiatedBy, timestamp } = job.data;
        const correlationId = job.id;
        const startTime = Date.now();

        this.writeLog(`Tool deletion processor disabled - CascadeOperationsService unavailable`);

        const steps: ICascadeStepResult[] = [];
        const errors: string[] = [];

        // DISABLED: CascadeOperationsService temporarily unavailable during multi-tenant removal
        // All cascade operations have been disabled until service is re-enabled
        errors.push('Tool deletion processor is temporarily disabled during multi-tenant cleanup');

        await job.updateProgress(100);

        const totalExecutionTime = Date.now() - startTime;

        const result: IToolDeletionResult = {
            success: false,
            toolId,
            operationType,
            steps,
            totalExecutionTime,
            errors,
        };

        this.writeLog(`Job completed (disabled): ${JSON.stringify(result)}`);
        return result;
    }

    @OnWorkerEvent('failed')
    async onFailed(job: Job<IToolDeletionJobData>, error: Error): Promise<void> {
        this.writeLog(`Job FAILED: ${job.id} - ${error.message}`);
    }

    @OnWorkerEvent('completed')
    async onCompleted(job: Job<IToolDeletionJobData>, result: IToolDeletionResult): Promise<void> {
        this.writeLog(`Job COMPLETED: ${job.id}`);
    }

    @OnWorkerEvent('active')
    async onActive(job: Job<IToolDeletionJobData>): Promise<void> {
        this.writeLog(`Job ACTIVE: ${job.id}`);
    }
}
