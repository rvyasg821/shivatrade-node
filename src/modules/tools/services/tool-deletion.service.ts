import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { ToolsRepository } from '../repository/repositories/tools.repository';
import { IToolDeletionJobData, IToolDeletionResult } from '../interfaces/tool-deletion-job.interface';

export interface JobStatus {
    id: string;
    state: string;
    progress: number;
    data: IToolDeletionJobData;
    result?: IToolDeletionResult;
    failedReason?: string;
    attemptsMade?: number;
    timestamp?: Date;
}

@Injectable()
export class ToolDeletionService {

    constructor(
        @InjectQueue(process.env.TOOL_DELETION_QUEUE_NAME || 'tool-deletion') private readonly toolDeletionQueue: Queue,
        private readonly toolsRepository: ToolsRepository,
    ) {}

    async enqueueDeletionJob(
        toolId: string,
        operationType: 'delete' | 'inactivate',
        initiatedBy: string = 'system'
    ): Promise<string> {
        const toolExists = await this.validateToolExists(toolId);
        if (!toolExists) {
            throw new NotFoundException(`Tool with ID ${toolId} not found`);
        }

        const tool = await this.toolsRepository.findOneById(toolId);
        if (!tool) {
            throw new NotFoundException(`Tool with ID ${toolId} not found`);
        }

        const correlationId = randomUUID();

        const jobData: IToolDeletionJobData = {
            toolId,
            toolSlug: tool.slug,
            operationType,
            initiatedBy,
            timestamp: new Date(),
        };
        const delayMinutesEnv = Number(process.env.TOOLS_INACTIVE_DELAY_MINUTES);
        console.log("🚀 ~ ToolDeletionService ~ enqueueDeletionJob ~ delayMinutesEnv:", delayMinutesEnv)
        const delayMinutes = !isNaN(delayMinutesEnv) ? delayMinutesEnv : 60;
        console.log("🚀 ~ ToolDeletionService ~ enqueueDeletionJob ~ delayMinutes:", delayMinutes)

        const delayMs = (delayMinutes ?? 60) * 60 * 1000;
        console.log("🚀 ~ ToolDeletionService ~ enqueueDeletionJob ~ delayMs:", delayMs)

        console.log(
            `Enqueuing ${operationType} job for tool: ${toolId} (${tool.slug}), ` +
            `initiated by: ${initiatedBy}, correlation ID: ${correlationId}, ` +
            `scheduled to execute in ${delayMs / 1000} Seconds`
        );

        const job = await this.toolDeletionQueue.add(
            `tool-${operationType}`,
            jobData,
            {
                jobId: correlationId,
                delay: delayMs,
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000,
                },
                removeOnComplete: 100,
                removeOnFail: 500,
            }
        );

        console.log(
            `Job enqueued successfully. Job ID: ${job.id}, Tool: ${toolId}, ` +
            `Operation: ${operationType}, Will execute at: ${new Date(Date.now() + delayMs).toISOString()}`
        );

        return job.id;
    }

    async getJobStatus(jobId: string): Promise<JobStatus> {
        console.debug(`Fetching status for job: ${jobId}`);

        const job = await this.toolDeletionQueue.getJob(jobId);

        if (!job) {
            throw new NotFoundException(`Job with ID ${jobId} not found`);
        }

        const state = await job.getState();
        const progress = job.progress as number || 0;
        const data = job.data;

        const status: JobStatus = {
            id: job.id,
            state,
            progress,
            data,
            attemptsMade: job.attemptsMade,
            timestamp: job.timestamp ? new Date(job.timestamp) : undefined,
        };

        if (state === 'completed') {
            status.result = job.returnvalue as IToolDeletionResult;
        }

        if (state === 'failed') {
            status.failedReason = job.failedReason;
        }

        console.debug(
            `Job ${jobId} status: ${state}, progress: ${progress}%, attempts: ${job.attemptsMade}`
        );

        return status;
    }

    async validateToolExists(toolId: string): Promise<boolean> {
        try {
            const tool = await this.toolsRepository.findOneById(toolId);
            return !!tool;
        } catch (error) {
            console.error(`Error validating tool existence: ${error.message}`);
            return false;
        }
    }

    async getJobs(states?: string[]): Promise<Job[]> {
        const validStates = states || ['active', 'waiting', 'completed', 'failed', 'delayed'];
        
        const jobs: Job[] = [];
        for (const state of validStates) {
            const stateJobs = await this.toolDeletionQueue.getJobs(state as any);
            jobs.push(...stateJobs);
        }

        return jobs;
    }

    async getQueueMetrics(): Promise<{
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
    }> {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
            this.toolDeletionQueue.getWaitingCount(),
            this.toolDeletionQueue.getActiveCount(),
            this.toolDeletionQueue.getCompletedCount(),
            this.toolDeletionQueue.getFailedCount(),
            this.toolDeletionQueue.getDelayedCount(),
        ]);

        return {
            waiting,
            active,
            completed,
            failed,
            delayed,
        };
    }

    async findPendingJobsForTool(toolId: string): Promise<string[]> {
        console.debug(`Finding pending jobs for tool: ${toolId}`);

        const pendingJobIds: string[] = [];

        const delayedJobs = await this.toolDeletionQueue.getJobs(['delayed']);
        for (const job of delayedJobs) {
            if (job.data.toolId === toolId) {
                pendingJobIds.push(job.id);
            }
        }

        const waitingJobs = await this.toolDeletionQueue.getJobs(['waiting']);
        for (const job of waitingJobs) {
            if (job.data.toolId === toolId) {
                pendingJobIds.push(job.id);
            }
        }

        console.debug(
            `Found ${pendingJobIds.length} pending jobs for tool ${toolId}: ${pendingJobIds.join(', ')}`
        );

        return pendingJobIds;
    }

    async cancelJob(jobId: string): Promise<boolean> {
        console.log(`Attempting to cancel job: ${jobId}`);

        const job = await this.toolDeletionQueue.getJob(jobId);

        if (!job) {
            console.warn(`Job ${jobId} not found, cannot cancel`);
            throw new NotFoundException(`Job with ID ${jobId} not found`);
        }

        const state = await job.getState();

        if (state !== 'delayed' && state !== 'waiting') {
            console.warn(
                `Job ${jobId} is in state '${state}', cannot cancel (only delayed/waiting jobs can be cancelled)`
            );
            throw new Error(
                `Cannot cancel job in state '${state}'. Only delayed or waiting jobs can be cancelled.`
            );
        }

        await job.remove();

        console.log(
            `Job ${jobId} cancelled successfully. Tool: ${job.data.toolId}, Operation: ${job.data.operationType}`
        );

        return true;
    }

    async cancelPendingJobsForTool(toolId: string): Promise<number> {
        console.log(`Cancelling all pending jobs for tool: ${toolId}`);

        const pendingJobIds = await this.findPendingJobsForTool(toolId);

        let cancelledCount = 0;
        for (const jobId of pendingJobIds) {
            try {
                await this.cancelJob(jobId);
                cancelledCount++;
            } catch (error) {
                console.error(
                    `Failed to cancel job ${jobId} for tool ${toolId}: ${error.message}`
                );
                // Continue with other jobs
            }
        }

        console.log(
            `Cancelled ${cancelledCount} out of ${pendingJobIds.length} pending jobs for tool ${toolId}`
        );

        return cancelledCount;
    }

    async cleanupOldJobs(grace: number = 24 * 60 * 60 * 1000): Promise<void> {
        console.log(`Cleaning up jobs older than ${grace}ms`);

        await this.toolDeletionQueue.clean(grace, 100, 'completed');
        await this.toolDeletionQueue.clean(grace, 500, 'failed');

        console.log('Job cleanup completed');
    }
}
