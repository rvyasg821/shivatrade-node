import { Injectable } from '@nestjs/common';
import { Command } from 'nestjs-command';
import { PlanRepository } from '@modules/plan/repository/repositories/plan.repository';

@Injectable()
export class MigrationPlanStructureCleanupSeed {
    constructor(private readonly planRepository: PlanRepository) {}

    @Command({
        command: 'migrate:plan-structure-cleanup',
        describe: 'Clean up deprecated Plan fields and update structure',
    })
    async migrate(): Promise<void> {
        try {
            console.log('=== Plan Structure Cleanup Migration ===');
            console.log('');
            console.log('This migration cleans up the plan schema:');
            console.log('');
            console.log('CHANGES:');
            console.log('  1. Remove deprecated root-level fields: price, platform_price, special_price, special_price_duration');
            console.log('  2. Add special_price_duration to location_pricing tiers (default: 0)');
            console.log('  3. Convert tools.base_price → tools.price (remove deprecated fields)');
            console.log('');

            // Find all plans
            const plans = await this.planRepository.findAll({});
            console.log(`Found ${plans.length} plans to migrate...`);
            console.log('');

            let migratedCount = 0;
            let skippedCount = 0;

            for (const plan of plans) {
                let needsUpdate = false;
                const updates: any = {};
                const unsets: any = {};

                // 1. Remove deprecated root-level fields
                if (plan['price'] !== undefined ||
                    plan['platform_price'] !== undefined ||
                    plan['special_price'] !== undefined ||
                    plan['special_price_duration'] !== undefined) {

                    if (plan['price'] !== undefined) unsets.price = '';
                    if (plan['platform_price'] !== undefined) unsets.platform_price = '';
                    if (plan['special_price'] !== undefined) unsets.special_price = '';
                    if (plan['special_price_duration'] !== undefined) unsets.special_price_duration = '';

                    needsUpdate = true;
                    console.log(`  ✓ Plan "${plan.name}": Removing deprecated root-level price fields`);
                }

                // 2. Add special_price_duration to location_pricing if missing
                if (plan.location_pricing && plan.location_pricing.length > 0) {
                    let locationPricingNeedsUpdate = false;

                    const updatedLocationPricing = plan.location_pricing.map((tier: any) => {
                        if (tier.special_price_duration === undefined) {
                            locationPricingNeedsUpdate = true;
                            return {
                                ...tier,
                                special_price_duration: 0
                            };
                        }
                        return tier;
                    });

                    if (locationPricingNeedsUpdate) {
                        updates.location_pricing = updatedLocationPricing;
                        needsUpdate = true;
                        console.log(`  ✓ Plan "${plan.name}": Adding special_price_duration to location_pricing tiers`);
                    }
                }

                // 3. Convert tools.base_price to tools.price
                if (plan.tools && plan.tools.length > 0) {
                    let toolsNeedsUpdate = false;

                    const updatedTools = plan.tools.map((tool: any) => {
                        const updatedTool = { ...tool };
                        let toolChanged = false;

                        // If base_price exists but price doesn't, use base_price as price
                        if (tool.base_price !== undefined && tool.price === undefined) {
                            updatedTool.price = tool.base_price;
                            toolChanged = true;
                        }

                        // Remove deprecated fields
                        if (updatedTool.base_price !== undefined) {
                            delete updatedTool.base_price;
                            toolChanged = true;
                        }

                        if (toolChanged) {
                            toolsNeedsUpdate = true;
                        }

                        return updatedTool;
                    });

                    if (toolsNeedsUpdate) {
                        updates.tools = updatedTools;
                        needsUpdate = true;
                        console.log(`  ✓ Plan "${plan.name}": Converting ${plan.tools.length} tool(s) from base_price to price`);
                    }
                }

                // Apply updates if needed
                if (needsUpdate) {
                    const operation: any = {};

                    if (Object.keys(updates).length > 0) {
                        operation.$set = updates;
                    }

                    if (Object.keys(unsets).length > 0) {
                        operation.$unset = unsets;
                    }

                    await this.planRepository.updateRaw(
                        { _id: plan._id },
                        operation
                    );
                    migratedCount++;
                } else {
                    skippedCount++;
                }
            }

            console.log('');
            console.log('=== Migration Summary ===');
            console.log(`✓ Total plans processed: ${plans.length}`);
            console.log(`✓ Plans migrated: ${migratedCount}`);
            console.log(`✓ Plans skipped (already clean): ${skippedCount}`);
            console.log('');
            console.log('Migration completed successfully!');
        } catch (error) {
            console.error('Error during plan structure cleanup migration:', error);
            throw error;
        }
    }

    @Command({
        command: 'rollback:plan-structure-cleanup',
        describe: 'Rollback plan structure cleanup (restore deprecated fields)',
    })
    async rollback(): Promise<void> {
        try {
            console.log('=== Plan Structure Cleanup Rollback ===');
            console.log('');
            console.log('⚠️  WARNING: This rollback is partial and may cause data loss!');
            console.log('');
            console.log('CHANGES:');
            console.log('  1. Restore platform_price from first location_pricing tier');
            console.log('  2. Remove special_price_duration from location_pricing');
            console.log('  3. Convert tools.price → tools.base_price');
            console.log('');

            const plans = await this.planRepository.findAll({});
            console.log(`Found ${plans.length} plans to rollback...`);
            console.log('');

            let rolledBackCount = 0;
            let skippedCount = 0;

            for (const plan of plans) {
                let needsUpdate = false;
                const updates: any = {};

                // 1. Restore platform_price from location_pricing
                if (plan.location_pricing && plan.location_pricing.length > 0) {
                    const firstTier: any = plan.location_pricing[0];
                    const priceToUse = firstTier.special_price || firstTier.price || 0;

                    updates.platform_price = priceToUse;
                    needsUpdate = true;
                    console.log(`  ✓ Plan "${plan.name}": Restoring platform_price ($${priceToUse})`);

                    // Remove special_price_duration
                    const cleanedLocationPricing = plan.location_pricing.map((tier: any) => {
                        const cleanedTier = { ...tier };
                        delete cleanedTier.special_price_duration;
                        return cleanedTier;
                    });

                    updates.location_pricing = cleanedLocationPricing;
                }

                // 3. Convert tools.price back to tools.base_price
                if (plan.tools && plan.tools.length > 0) {
                    const rolledBackTools = plan.tools.map((tool: any) => ({
                        ...tool,
                        base_price: tool.price || 0,
                        // Keep price for backward compatibility
                        price: tool.price || 0
                    }));

                    updates.tools = rolledBackTools;
                    needsUpdate = true;
                    console.log(`  ✓ Plan "${plan.name}": Converting ${plan.tools.length} tool(s) from price to base_price`);
                }

                // Apply updates if needed
                if (needsUpdate) {
                    await this.planRepository.updateRaw(
                        { _id: plan._id },
                        { $set: updates }
                    );
                    rolledBackCount++;
                } else {
                    skippedCount++;
                }
            }

            console.log('');
            console.log('=== Rollback Summary ===');
            console.log(`✓ Total plans processed: ${plans.length}`);
            console.log(`✓ Plans rolled back: ${rolledBackCount}`);
            console.log(`✓ Plans skipped: ${skippedCount}`);
            console.log('');
            console.log('⚠️  WARNING: Root-level special_price and special_price_duration could not be restored!');
            console.log('Rollback completed!');
        } catch (error) {
            console.error('Error during plan structure cleanup rollback:', error);
            throw error;
        }
    }
}
