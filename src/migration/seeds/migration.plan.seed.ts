import { Injectable } from '@nestjs/common';
import { Command } from 'nestjs-command';
import { PlanService } from '@modules/plan/services/plan.service';

@Injectable()
export class MigrationPlanSeed {
    constructor(private readonly planService: PlanService) { }

    @Command({
        command: 'migrate:plan',
        describe: 'Migrate plan schema from old price structure to new tools structure',
    })
    async migrate(): Promise<void> {
        try {
            console.log('=== Plan Schema Migration ===');
            console.log('');
            console.log('This migration updates the plan schema from:');
            console.log('OLD STRUCTURE:');
            console.log('  - description: string');
            console.log('  - price: number');
            console.log('  - special_price?: number');
            console.log('  - special_price_duration?: number');
            console.log('  - type?: string');
            console.log('  - duration: ENUM_PLAN_DURATION_TYPE');
            console.log('');
            console.log('NEW STRUCTURE:');
            console.log('  - tools: Array<{_id: string, name: string, price: number}>');
            console.log('  - platform_price: number');
            console.log('  - duration_type: ENUM_PLAN_DURATION_TYPE');
            console.log('  - duration: number');
            console.log('  - soft_delete: boolean');
            console.log('');
            console.log('MANUAL MIGRATION REQUIRED:');
            console.log('If you have existing plans in your database, please run the following MongoDB commands:');
            console.log('');
            console.log('// Convert existing plans to new structure');
            console.log('db.plans.updateMany(');
            console.log('  { price: { $exists: true } },');
            console.log('  [');
            console.log('    {');
            console.log('      $set: {');
            console.log('        platform_price: { $ifNull: ["$price", 0] },');
            console.log('        tools: [],');
            console.log('        duration_type: { $ifNull: ["$duration", "MONTHLY"] },');
            console.log('        duration: 1,');
            console.log('        soft_delete: false');
            console.log('      }');
            console.log('    },');
            console.log('    {');
            console.log('      $unset: ["description", "price", "special_price", "special_price_duration", "type"]');
            console.log('    }');
            console.log('  ]');
            console.log(');');
            console.log('');
            console.log('✓ Migration information displayed successfully!');
            console.log('New plans will automatically use the new structure.');
        } catch (error) {
            console.error('Error during plan migration:', error);
            throw error;
        }
    }

    @Command({
        command: 'rollback:plan',
        describe: 'Rollback plan schema migration (restore old price structure)',
    })
    async rollback(): Promise<void> {
        try {
            console.log('=== Plan Schema Rollback ===');
            console.log('');
            console.log('This rollback restores the plan schema from:');
            console.log('CURRENT STRUCTURE:');
            console.log('  - tools: Array<{_id: string, name: string, price: number}>');
            console.log('  - platform_price: number');
            console.log('');
            console.log('BACK TO OLD STRUCTURE:');
            console.log('  - description: string');
            console.log('  - price: number');
            console.log('  - special_price?: number');
            console.log('  - special_price_duration?: number');
            console.log('  - type?: string');
            console.log('  - duration: ENUM_PLAN_DURATION_TYPE');
            console.log('');
            console.log('MANUAL ROLLBACK REQUIRED:');
            console.log('If you need to rollback existing plans, run the following MongoDB commands:');
            console.log('');
            console.log('// Rollback plans to old structure');
            console.log('db.plans.updateMany(');
            console.log('  { platform_price: { $exists: true } },');
            console.log('  [');
            console.log('    {');
            console.log('      $set: {');
            console.log('        description: "",');
            console.log('        price: { $ifNull: ["$platform_price", 0] },');
            console.log('        special_price: null,');
            console.log('        special_price_duration: null,');
            console.log('        type: null,');
            console.log('        duration: { $ifNull: ["$duration_type", "MONTHLY"] }');
            console.log('      }');
            console.log('    },');
            console.log('    {');
            console.log('      $unset: ["platform_price", "tools", "duration_type", "soft_delete"]');
            console.log('    }');
            console.log('  ]');
            console.log(');');
            console.log('');
            console.log('⚠️  WARNING: This will remove all tools data from existing plans!');
            console.log('✓ Rollback information displayed successfully!');
        } catch (error) {
            console.error('Error during plan rollback:', error);
            throw error;
        }
    }
}