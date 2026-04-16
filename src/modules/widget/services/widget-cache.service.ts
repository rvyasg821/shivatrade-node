import { Injectable, Logger } from '@nestjs/common';
import { IWidgetMetadata, IWidgetDefaultConfig } from '../interfaces/widget.interface';
import { WidgetDoc } from '../repository/entities/widget.entity';
import { ToolsService } from '@modules/tools/services/tools.service';

@Injectable()
export class WidgetCacheService {
    private readonly logger = new Logger(WidgetCacheService.name);
    
    // In-memory cache for widget metadata (rarely changes)
    private metadataCache: IWidgetMetadata[] | null = null;
    
    // In-memory cache for default configurations (rarely changes)
    private defaultConfigCache: Map<string, IWidgetDefaultConfig[]> = new Map();
    
    // Simple in-memory cache for user widgets (with TTL simulation)
    private userWidgetCache: Map<string, { data: WidgetDoc[]; timestamp: number }> = new Map();
    
    // Cache TTL in milliseconds (5 minutes)
    private readonly CACHE_TTL = 5 * 60 * 1000;

    constructor(
        private readonly toolsService: ToolsService // Inject ToolsService
    ) {
        this.warmCache();
    }

    /**
     * Get widget metadata from cache
     */
    async getWidgetMetadata(): Promise<IWidgetMetadata[]> {
        if (!this.metadataCache) {
            this.logger.log('Loading widget metadata into cache');
            
            // Try to get metadata from tools entity first
            let metadata: IWidgetMetadata[] = [];
            try {
                // Get all tools and extract widget metadata
                const tools = await this.toolsService.findAll();
                const allWidgetMetadata: IWidgetMetadata[] = [];
                
                // Collect all unique widget metadata from all tools
                const uniqueSlugs = new Set<string>();
                
                for (const tool of tools) {
                    const toolDoc = tool;
                    if (toolDoc.widgets && Array.isArray(toolDoc.widgets)) {
                        for (const widget of toolDoc.widgets) {
                            if (!uniqueSlugs.has(widget.slug)) {
                                uniqueSlugs.add(widget.slug);
                                allWidgetMetadata.push({
                                    slug: widget.slug,
                                    name: widget.name
                                });
                            }
                        }
                    }
                }
                
                // If we found metadata in tools, use it
                if (allWidgetMetadata.length > 0) {
                    metadata = allWidgetMetadata;
                } else {
                    // Fallback to static metadata
                    this.logger.log('No widget metadata found in tools entity, using static metadata');
                    metadata = []; // [...WIDGET_METADATA];
                }
            } catch (error) {
                this.logger.warn(`Failed to get widget metadata from database, falling back to static metadata: ${error.message}`);
                // metadata = [...WIDGET_METADATA];
            }
            
            this.metadataCache = metadata;
        }
        return this.metadataCache;
    }

    /**
     * Get default configuration for a tool from cache
     */
    async getDefaultConfiguration(toolSlug: string): Promise<IWidgetDefaultConfig[]> {
        if (!this.defaultConfigCache.has(toolSlug)) {
            this.logger.log(`Loading default configuration for tool ${toolSlug} into cache`);
            
            // Try to get widgets from tools entity first
            let widgets: IWidgetDefaultConfig[] = [];
            try {
                const toolDoc = await this.toolsService.findOne({ slug: toolSlug });
                if (toolDoc && toolDoc.widgets && Array.isArray(toolDoc.widgets)) {
                    widgets = toolDoc.widgets;
                }
            } catch (error) {
                this.logger.warn(`Failed to get tool widgets from database for ${toolSlug}, falling back to defaults: ${error.message}`);
            }
            
            this.defaultConfigCache.set(toolSlug, widgets);
        }
        return this.defaultConfigCache.get(toolSlug) || [];
    }

    /**
     * Get user widgets from cache
     */
    getUserWidgets(userId: string): WidgetDoc[] | null {
        const cacheKey = `user_widgets_${userId}`;
        const cached = this.userWidgetCache.get(cacheKey);
        
        if (!cached) {
            return null;
        }

        // Check if cache is expired
        if (Date.now() - cached.timestamp > this.CACHE_TTL) {
            this.logger.log(`Cache expired for user ${userId}, removing from cache`);
            this.userWidgetCache.delete(cacheKey);
            return null;
        }

        this.logger.log(`Cache hit for user ${userId} widgets`);
        return cached.data;
    }

    /**
     * Set user widgets in cache
     */
    setUserWidgets(userId: string, widgets: WidgetDoc[]): void {
        const cacheKey = `user_widgets_${userId}`;
        this.userWidgetCache.set(cacheKey, {
            data: widgets,
            timestamp: Date.now(),
        });
        this.logger.log(`Cached widgets for user ${userId}`);
    }

    /**
     * Invalidate user widgets cache
     */
    invalidateUserWidgets(userId: string): void {
        const cacheKey = `user_widgets_${userId}`;
        this.userWidgetCache.delete(cacheKey);
        this.logger.log(`Invalidated cache for user ${userId}`);
    }

    /**
     * Invalidate all user widgets cache
     */
    invalidateAllUserWidgets(): void {
        this.userWidgetCache.clear();
        this.logger.log('Invalidated all user widgets cache');
    }

    /**
     * Warm up the cache with frequently accessed data
     */
    private async warmCache(): Promise<void> {
        this.logger.log('Warming up widget cache');
        
        // Pre-load metadata
        await this.getWidgetMetadata();
        
        // Note: We can't pre-load default configurations here because we don't know all tool slugs
        // This will be done on-demand when getDefaultConfiguration is called
        
        this.logger.log('Widget cache warm up initiated');
    }

    /**
     * Clear all caches (useful for testing or manual cache refresh)
     */
    clearAllCaches(): void {
        this.metadataCache = null;
        this.defaultConfigCache.clear();
        this.userWidgetCache.clear();
        this.logger.log('All widget caches cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): {
        metadataCached: boolean;
        defaultConfigCount: number;
        userWidgetCacheCount: number;
        userWidgetCacheKeys: string[];
    } {
        return {
            metadataCached: this.metadataCache !== null,
            defaultConfigCount: this.defaultConfigCache.size,
            userWidgetCacheCount: this.userWidgetCache.size,
            userWidgetCacheKeys: Array.from(this.userWidgetCache.keys()),
        };
    }

    /**
     * Clean expired cache entries
     */
    cleanExpiredCache(): void {
        const now = Date.now();
        const expiredKeys: string[] = [];

        for (const [key, value] of this.userWidgetCache.entries()) {
            if (now - value.timestamp > this.CACHE_TTL) {
                expiredKeys.push(key);
            }
        }

        expiredKeys.forEach(key => {
            this.userWidgetCache.delete(key);
        });

        if (expiredKeys.length > 0) {
            this.logger.log(`Cleaned ${expiredKeys.length} expired cache entries`);
        }
    }
}