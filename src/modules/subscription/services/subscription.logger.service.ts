import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionDoc } from '../repository/entities/subscription.entity';

@Injectable()
export class SubscriptionLoggerService {
    private readonly logger = new Logger(SubscriptionLoggerService.name);

    // Subscription lifecycle logging
    logSubscriptionCreated(subscription: SubscriptionDoc): void {
        this.logger.log(
            `Subscription created - ID: ${subscription._id}, User: ${subscription.user_id}, Plan: ${subscription.plan_id}, Total: ${subscription.final_price}`,
            'SUBSCRIPTION_CREATED'
        );
    }

    logSubscriptionUpdated(subscription: SubscriptionDoc, changes: Record<string, any>): void {
        this.logger.log(
            `Subscription updated - ID: ${subscription._id}, User: ${subscription.user_id}, Changes: ${JSON.stringify(changes)}`,
            'SUBSCRIPTION_UPDATED'
        );
    }

    logSubscriptionCancelled(subscription: SubscriptionDoc, reason?: string): void {
        this.logger.warn(
            `Subscription cancelled - ID: ${subscription._id}, User: ${subscription.user_id}, Reason: ${reason || 'User request'}`,
            'SUBSCRIPTION_CANCELLED'
        );
    }

    logSubscriptionExpired(subscription: SubscriptionDoc): void {
        this.logger.warn(
            `Subscription expired - ID: ${subscription._id}, User: ${subscription.user_id}, End Date: ${subscription.end_date}`,
            'SUBSCRIPTION_EXPIRED'
        );
    }

    logSubscriptionRenewed(subscription: SubscriptionDoc): void {
        this.logger.log(
            `Subscription renewed - ID: ${subscription._id}, User: ${subscription.user_id}, Next Date: ${subscription.next_date}`,
            'SUBSCRIPTION_RENEWED'
        );
    }

    // Access control logging
    logToolAccessGranted(userId: string, toolIds: string[]): void {
        this.logger.log(
            `Tool access granted - User: ${userId}, Tools: ${toolIds.join(', ')}`,
            'TOOL_ACCESS_GRANTED'
        );
    }

    logToolAccessDenied(userId: string, toolIds: string[], reason: string): void {
        this.logger.warn(
            `Tool access denied - User: ${userId}, Tools: ${toolIds.join(', ')}, Reason: ${reason}`,
            'TOOL_ACCESS_DENIED'
        );
    }

    logSubscriptionAccessDenied(userId: string, reason: string): void {
        this.logger.warn(
            `Subscription access denied - User: ${userId}, Reason: ${reason}`,
            'SUBSCRIPTION_ACCESS_DENIED'
        );
    }

    // Error logging
    logSubscriptionError(operation: string, error: Error, context?: Record<string, any>): void {
        this.logger.error(
            `Subscription error during ${operation} - Error: ${error.message}, Context: ${JSON.stringify(context || {})}`,
            error.stack,
            'SUBSCRIPTION_ERROR'
        );
    }

    logValidationError(operation: string, validationErrors: any[], context?: Record<string, any>): void {
        this.logger.error(
            `Validation error during ${operation} - Errors: ${JSON.stringify(validationErrors)}, Context: ${JSON.stringify(context || {})}`,
            'VALIDATION_ERROR'
        );
    }

    // Performance logging
    logSlowQuery(operation: string, duration: number, context?: Record<string, any>): void {
        if (duration > 1000) { // Log queries taking more than 1 second
            this.logger.warn(
                `Slow subscription query - Operation: ${operation}, Duration: ${duration}ms, Context: ${JSON.stringify(context || {})}`,
                'SLOW_QUERY'
            );
        }
    }

    logCacheHit(operation: string, key: string): void {
        this.logger.debug(
            `Cache hit - Operation: ${operation}, Key: ${key}`,
            'CACHE_HIT'
        );
    }

    logCacheMiss(operation: string, key: string): void {
        this.logger.debug(
            `Cache miss - Operation: ${operation}, Key: ${key}`,
            'CACHE_MISS'
        );
    }

    // Business logic logging
    logPaymentProcessed(subscriptionId: string, amount: number, status: string): void {
        this.logger.log(
            `Payment processed - Subscription: ${subscriptionId}, Amount: ${amount}, Status: ${status}`,
            'PAYMENT_PROCESSED'
        );
    }

    logPaymentFailed(subscriptionId: string, amount: number, error: string): void {
        this.logger.error(
            `Payment failed - Subscription: ${subscriptionId}, Amount: ${amount}, Error: ${error}`,
            'PAYMENT_FAILED'
        );
    }

    logTrialStarted(subscription: SubscriptionDoc): void {
        this.logger.log(
            `Trial started - ID: ${subscription._id}, User: ${subscription.user_id}, End Date: ${subscription.end_date}`,
            'TRIAL_STARTED'
        );
    }

    logTrialExpired(subscription: SubscriptionDoc): void {
        this.logger.warn(
            `Trial expired - ID: ${subscription._id}, User: ${subscription.user_id}`,
            'TRIAL_EXPIRED'
        );
    }

    // Analytics logging
    logAnalyticsGenerated(type: string, data: Record<string, any>): void {
        this.logger.log(
            `Analytics generated - Type: ${type}, Data: ${JSON.stringify(data)}`,
            'ANALYTICS_GENERATED'
        );
    }

    // Security logging
    logSuspiciousActivity(userId: string, activity: string, details: Record<string, any>): void {
        this.logger.warn(
            `Suspicious activity detected - User: ${userId}, Activity: ${activity}, Details: ${JSON.stringify(details)}`,
            'SUSPICIOUS_ACTIVITY'
        );
    }

    logUnauthorizedAccess(userId: string, resource: string, action: string): void {
        this.logger.warn(
            `Unauthorized access attempt - User: ${userId}, Resource: ${resource}, Action: ${action}`,
            'UNAUTHORIZED_ACCESS'
        );
    }
}