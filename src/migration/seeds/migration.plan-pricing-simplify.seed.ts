import { Injectable } from '@nestjs/common';
import { Command } from 'nestjs-command';
import { PlanRepository } from '@modules/plan/repository/repositories/plan.repository';

@Injectable()
export class MigrationPlanPricingSimplifySeed {
    constructor(private readonly planRepository: PlanRepository) {}

    @Command({
        command: 'migrate:plan-pricing-simplify',
        describe: 'Simplify location pricing from monthly/yearly to price/special_price',
    })
    async migrate(): Promise<void> {
        try {
            console.log('=== Plan Pricing Simplification Migration ===');
            console.log('');
            console.log('This migration updates location pricing structure:');
            console.log('  FROM: monthly_price, yearly_price');
            console.log('  TO: price, special_price');
            console.log('');

            const plans = await this.planRepository.findAll({});
            console.log(`Found ${plans.length} plans to check...`);
            console.log('');

            let migratedCount = 0;
            let skippedCount = 0;

            for (const plan of plans) {
                let needsUpdate = false;
                const updates: any = {};

                // Check if location_pricing has old structure
                if (plan.location_pricing && plan.location_pricing.length > 0) {
                    const oldStructure = plan.location_pricing.some(
                        (tier: any) => tier.monthly_price !== undefined || tier.yearly_price !== undefined
                    );

                    if (oldStructure) {
                        // Convert monthly_price/yearly_price to price/special_price
                        updates.location_pricing = plan.location_pricing.map((tier: any) => {
                            const newTier: any = {
                                locations: tier.locations,
                                price: tier.monthly_price || tier.price || 0,
                                platform_fee: tier.platform_fee || 0,
                            };

                            // If yearly_price was set and different from monthly * 12, treat it as special pricing
                            // Otherwise, don't set special_price
                            if (tier.yearly_price && tier.monthly_price) {
                                const expectedYearly = tier.monthly_price * 12;
                                if (Math.abs(tier.yearly_price - expectedYearly) > 0.01) {
                                    // There was a special yearly price, but we don't use it anymore
                                    // Just keep the base price
                                }
                            }

                            // Remove old fields
                            delete (newTier as any).monthly_price;
                            delete (newTier as any).yearly_price;

                            return newTier;
                        });
                        needsUpdate = true;
                        console.log(`  ✓ Plan "${plan.name}": Converting location pricing structure`);
                    }
                }

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
            console.log(`✓ Plans skipped (already using new structure): ${skippedCount}`);
            console.log('');
            console.log('Migration completed successfully!');
            console.log('');
            console.log('Note: The duration (monthly/yearly) is now handled at the plan level via duration_type.');
        } catch (error) {
            console.error('Error during plan pricing simplification:', error);
            throw error;
        }
    }

    @Command({
        command: 'rollback:plan-pricing-simplify',
        describe: 'Rollback pricing simplification (restore monthly/yearly structure)',
    })
    async rollback(): Promise<void> {
        try {
            console.log('=== Plan Pricing Simplification Rollback ===');
            console.log('');
            console.log('This rollback restores location pricing structure:');
            console.log('  FROM: price, special_price');
            console.log('  TO: monthly_price, yearly_price');
            console.log('');

            const plans = await this.planRepository.findAll({});
            console.log(`Found ${plans.length} plans to rollback...`);
            console.log('');

            let rolledBackCount = 0;
            let skippedCount = 0;

            for (const plan of plans) {
                let needsUpdate = false;
                const updates: any = {};

                if (plan.location_pricing && plan.location_pricing.length > 0) {
                    const newStructure = plan.location_pricing.some(
                        (tier: any) => tier.price !== undefined
                    );

                    if (newStructure) {
                        updates.location_pricing = plan.location_pricing.map((tier: any) => {
                            const oldTier: any = {
                                locations: tier.locations,
                                monthly_price: tier.special_price || tier.price || 0,
                                yearly_price: (tier.special_price || tier.price || 0) * 12,
                                platform_fee: tier.platform_fee || 0,
                            };

                            return oldTier;
                        });
                        needsUpdate = true;
                        console.log(`  ✓ Plan "${plan.name}": Restoring old pricing structure`);
                    }
                }

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
            console.log('Rollback completed successfully!');
        } catch (error) {
            console.error('Error during rollback:', error);
            throw error;
        }
    }
}
