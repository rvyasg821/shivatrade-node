import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { SubscriptionDoc } from '../repository/entities/subscription.entity';

@Injectable()
export class SubscriptionCacheService {
    private readonly CACHE_TTL = {
        SUBSCRIPTION: 300, // 5 minutes
        USER_SUBSCRIPTION: 60, // 1 minute
        TOOL_ACCESS: 180, // 3 minutes
        ANALYTICS: 600, // 10 minutes
    };

    private readonly CACHE_KEYS = {
        SUBSCRIPTION_BY_ID: (id: string) => `subscription:id:${id}`,
        USER_SUBSCRIPTION: (userId: string) => `subscription:user:${userId}`,
        USER_TOOL_ACCESS: (userId: string) => `subscription:tools:${userId}`,
        SUBSCRIPTION_ANALYTICS: 'subscription:analytics',
        ACTIVE_SUBSCRIPTIONS_COUNT: 'subscription:count:active',
        PLAN_SUBSCRIPTIONS: (planId: string) => `subscription:plan:${planId}`,
    };

    constructor(
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
    ) { }

    // Subscription caching
    async getSubscriptionById(id: string): Promise<SubscriptionDoc | null> {
        const key = this.CACHE_KEYS.SUBSCRIPTION_BY_ID(id);
        return await this.cacheManager.get<SubscriptionDoc>(key);
    }

    async setSubscriptionById(id: string, subscription: SubscriptionDoc): Promise<void> {
        const key = this.CACHE_KEYS.SUBSCRIPTION_BY_ID(id);
        await this.cacheManager.set(key, subscription, this.CACHE_TTL.SUBSCRIPTION);
    }

    async deleteSubscriptionById(id: string): Promise<void> {
        const key = this.CACHE_KEYS.SUBSCRIPTION_BY_ID(id);
        await this.cacheManager.del(key);
    }

    // User subscription caching
    async getUserSubscription(userId: string): Promise<SubscriptionDoc | null> {
        const key = this.CACHE_KEYS.USER_SUBSCRIPTION(userId);
        return await this.cacheManager.get<SubscriptionDoc>(key);
    }

    async setUserSubscription(userId: string, subscription: SubscriptionDoc): Promise<void> {
        const key = this.CACHE_KEYS.USER_SUBSCRIPTION(userId);
        await this.cacheManager.set(key, subscription, this.CACHE_TTL.USER_SUBSCRIPTION);
    }

    async deleteUserSubscription(userId: string): Promise<void> {
        const key = this.CACHE_KEYS.USER_SUBSCRIPTION(userId);
        await this.cacheManager.del(key);
    }

    // Tool access caching
    async getUserToolAccess(userId: string): Promise<string[] | null> {
        const key = this.CACHE_KEYS.USER_TOOL_ACCESS(userId);
        return await this.cacheManager.get<string[]>(key);
    }

    async setUserToolAccess(userId: string, toolIds: string[]): Promise<void> {
        const key = this.CACHE_KEYS.USER_TOOL_ACCESS(userId);
        await this.cacheManager.set(key, toolIds, this.CACHE_TTL.TOOL_ACCESS);
    }

    async deleteUserToolAccess(userId: string): Promise<void> {
        const key = this.CACHE_KEYS.USER_TOOL_ACCESS(userId);
        await this.cacheManager.del(key);
    }

    // Analytics caching
    async getAnalytics(): Promise<any | null> {
        const key = this.CACHE_KEYS.SUBSCRIPTION_ANALYTICS;
        return await this.cacheManager.get(key);
    }

    async setAnalytics(data: any): Promise<void> {
        const key = this.CACHE_KEYS.SUBSCRIPTION_ANALYTICS;
        await this.cacheManager.set(key, data, this.CACHE_TTL.ANALYTICS);
    }

    async deleteAnalytics(): Promise<void> {
        const key = this.CACHE_KEYS.SUBSCRIPTION_ANALYTICS;
        await this.cacheManager.del(key);
    }

    // Count caching
    async getActiveSubscriptionsCount(): Promise<number | null> {
        const key = this.CACHE_KEYS.ACTIVE_SUBSCRIPTIONS_COUNT;
        return await this.cacheManager.get<number>(key);
    }

    async setActiveSubscriptionsCount(count: number): Promise<void> {
        const key = this.CACHE_KEYS.ACTIVE_SUBSCRIPTIONS_COUNT;
        await this.cacheManager.set(key, count, this.CACHE_TTL.ANALYTICS);
    }

    async deleteActiveSubscriptionsCount(): Promise<void> {
        const key = this.CACHE_KEYS.ACTIVE_SUBSCRIPTIONS_COUNT;
        await this.cacheManager.del(key);
    }

    // Plan subscriptions caching
    async getPlanSubscriptions(planId: string): Promise<SubscriptionDoc[] | null> {
        const key = this.CACHE_KEYS.PLAN_SUBSCRIPTIONS(planId);
        return await this.cacheManager.get<SubscriptionDoc[]>(key);
    }

    async setPlanSubscriptions(planId: string, subscriptions: SubscriptionDoc[]): Promise<void> {
        const key = this.CACHE_KEYS.PLAN_SUBSCRIPTIONS(planId);
        await this.cacheManager.set(key, subscriptions, this.CACHE_TTL.SUBSCRIPTION);
    }

    async deletePlanSubscriptions(planId: string): Promise<void> {
        const key = this.CACHE_KEYS.PLAN_SUBSCRIPTIONS(planId);
        await this.cacheManager.del(key);
    }

    // Bulk invalidation
    async invalidateUserCache(userId: string): Promise<void> {
        await Promise.all([
            this.deleteUserSubscription(userId),
            this.deleteUserToolAccess(userId),
        ]);
    }

    async invalidateSubscriptionCache(subscriptionId: string, userId?: string): Promise<void> {
        const promises = [
            this.deleteSubscriptionById(subscriptionId),
            this.deleteAnalytics(),
            this.deleteActiveSubscriptionsCount(),
        ];

        if (userId) {
            promises.push(this.invalidateUserCache(userId));
        }

        await Promise.all(promises);
    }

    async invalidateAllCache(): Promise<void> {
        // Clear all subscription-related cache keys
        const allKeys = [
            this.CACHE_KEYS.SUBSCRIPTION_ANALYTICS,
            this.CACHE_KEYS.ACTIVE_SUBSCRIPTIONS_COUNT,
        ];

        await Promise.all(allKeys.map(key => this.cacheManager.del(key)));
    }
}