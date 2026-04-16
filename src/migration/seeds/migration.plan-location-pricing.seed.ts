import { Injectable } from '@nestjs/common';
import { Command } from 'nestjs-command';
import { PlanRepository } from '@modules/plan/repository/repositories/plan.repository';
import { ENUM_TOOL_PRICING_MODE } from '@modules/plan/enums/plan.enum';

@Injectable()
export class MigrationPlanLocationPricingSeed {
    constructor(private readonly planRepository: PlanRepository) {}

    @Command({
        command: 'migrate:plan-location-pricing',
        describe: 'Migrate plan schema to support location-based pricing',
    })
    async migrate(): Promise<void> {
        try {
            console.log('=== Plan Location-Based Pricing Migration ===');
            console.log('');
            console.log('This migration updates the plan schema to support location-based pricing:');
            console.log('');
            console.log('CHANGES:');
            console.log('  1. Convert platform_price → location_pricing array (1 location tier)');
            console.log('  2. Convert tool.price → tool.base_price');
            console.log('  3. Add tool.pricing_mode (default: FIXED)');
            console.log('  4. Add tool.location_multiplier (default: 1.0)');
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

                // 1. Convert platform_price to location_pricing (for old data)
                const planData: any = plan;
                if (planData.platform_price !== undefined && planData.platform_price !== null) {
                    if (!plan.location_pricing || plan.location_pricing.length === 0) {
                        updates.location_pricing = [
                            {
                                locations: 1,
                                monthly_price: planData.platform_price,
                                yearly_price: planData.platform_price * 12,
                                platform_fee: 0,
                            },
                        ];
                        needsUpdate = true;
                        console.log(`  ✓ Plan "${plan.name}": Converting platform_price ($${planData.platform_price}) to location_pricing`);
                    }
                }

                // 2. Migrate tools array
                if (plan.tools && plan.tools.length > 0) {
                    const migratedTools = plan.tools.map((tool: any) => {
                        let toolNeedsUpdate = false;
                        const migratedTool = { ...tool };

                        // Convert price to base_price if not already migrated
                        if (tool.price !== undefined && tool.base_price === undefined) {
                            migratedTool.base_price = tool.price;
                            toolNeedsUpdate = true;
                        }

                        // Add pricing_mode if not present
                        if (!tool.pricing_mode) {
                            migratedTool.pricing_mode = ENUM_TOOL_PRICING_MODE.FIXED;
                            toolNeedsUpdate = true;
                        }

                        // Add location_multiplier if not present
                        if (tool.location_multiplier === undefined) {
                            migratedTool.location_multiplier = 1.0;
                            toolNeedsUpdate = true;
                        }

                        if (toolNeedsUpdate) {
                            needsUpdate = true;
                        }

                        return migratedTool;
                    });

                    if (needsUpdate) {
                        updates.tools = migratedTools;
                        console.log(`  ✓ Plan "${plan.name}": Migrating ${plan.tools.length} tool(s) to new pricing structure`);
                    }
                }

                // Apply updates if needed
                if (needsUpdate) {
                    await this.planRepository.updateRaw(
                        { _id: plan._id },
                        { $set: updates }
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
            console.log(`✓ Plans skipped (already migrated): ${skippedCount}`);
            console.log('');
            console.log('Migration completed successfully!');
        } catch (error) {
            console.error('Error during plan location pricing migration:', error);
            throw error;
        }
    }

    @Command({
        command: 'rollback:plan-location-pricing',
        describe: 'Rollback plan location-based pricing migration',
    })
    async rollback(): Promise<void> {
        try {
            console.log('=== Plan Location-Based Pricing Rollback ===');
            console.log('');
            console.log('This rollback restores plans to the old pricing structure:');
            console.log('');
            console.log('CHANGES:');
            console.log('  1. Convert location_pricing[0].monthly_price → platform_price');
            console.log('  2. Convert tool.base_price → tool.price');
            console.log('  3. Remove tool.pricing_mode');
            console.log('  4. Remove tool.location_multiplier');
            console.log('');

            // Find all plans
            const plans = await this.planRepository.findAll({});
            console.log(`Found ${plans.length} plans to rollback...`);
            console.log('');

            let rolledBackCount = 0;
            let skippedCount = 0;

            for (const plan of plans) {
                let needsUpdate = false;
                const updates: any = {};
                const unsets: any = {};

                // 1. Convert location_pricing back to platform_price
                if (plan.location_pricing && plan.location_pricing.length > 0) {
                    const firstTier: any = plan.location_pricing[0];
                    const priceToUse = firstTier.special_price || firstTier.price || firstTier.monthly_price || 0;
                    if (firstTier) {
                        updates.platform_price = priceToUse;
                        unsets.location_pricing = '';
                        needsUpdate = true;
                        console.log(`  ✓ Plan "${plan.name}": Converting location_pricing back to platform_price ($${priceToUse})`);
                    }
                }

                // 2. Rollback tools array
                if (plan.tools && plan.tools.length > 0) {
                    const rolledBackTools = plan.tools.map((tool: any) => {
                        const rolledBackTool = { ...tool };

                        // Convert base_price back to price
                        if (tool.base_price !== undefined) {
                            rolledBackTool.price = tool.base_price;
                        }

                        // Remove new fields
                        delete rolledBackTool.pricing_mode;
                        delete rolledBackTool.location_multiplier;

                        return rolledBackTool;
                    });

                    updates.tools = rolledBackTools;
                    needsUpdate = true;
                    console.log(`  ✓ Plan "${plan.name}": Rolling back ${plan.tools.length} tool(s) to old pricing structure`);
                }

                // Apply updates if needed
                if (needsUpdate) {
                    const operation: any = { $set: updates };
                    if (Object.keys(unsets).length > 0) {
                        operation.$unset = unsets;
                    }

                    await this.planRepository.updateRaw(
                        { _id: plan._id },
                        operation
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
            console.log(`✓ Plans skipped (no rollback needed): ${skippedCount}`);
            console.log('');
            console.log('⚠️  WARNING: Location pricing data has been removed!');
            console.log('Rollback completed successfully!');
        } catch (error) {
            console.error('Error during plan location pricing rollback:', error);
            throw error;
        }
    }
}
