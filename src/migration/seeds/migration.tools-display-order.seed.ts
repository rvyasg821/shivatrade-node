import { Injectable } from '@nestjs/common';
import { Command } from 'nestjs-command';
import { ToolsRepository } from '@modules/tools/repository/repositories/tools.repository';

@Injectable()
export class MigrationToolsDisplayOrderSeed {
    constructor(private readonly toolsRepository: ToolsRepository) {}

    @Command({
        command: 'migrate:tools-display-order',
        describe: 'Add displayOrder field to existing tools',
    })
    async migrate(): Promise<void> {
        try {
            console.log('=== Tools Display Order Migration ===');
            console.log('');
            console.log('This migration adds displayOrder field to existing tools.');
            console.log('');

            // Find all tools without displayOrder or with undefined displayOrder
            const tools = await this.toolsRepository.findAll({});
            console.log(`Found ${tools.length} tools to check...`);
            console.log('');

            let migratedCount = 0;
            let skippedCount = 0;

            for (let i = 0; i < tools.length; i++) {
                const tool = tools[i];

                // Check if displayOrder needs to be set
                if (tool.displayOrder === undefined || tool.displayOrder === null) {
                    // Set displayOrder based on current index (alphabetical order)
                    await this.toolsRepository.updateRaw(
                        { _id: tool._id },
                        { $set: { displayOrder: i + 1 } }
                    );
                    migratedCount++;
                    console.log(`  ✓ Tool "${tool.name}": Set displayOrder to ${i + 1}`);
                } else {
                    skippedCount++;
                }
            }

            console.log('');
            console.log('=== Migration Summary ===');
            console.log(`✓ Total tools processed: ${tools.length}`);
            console.log(`✓ Tools migrated: ${migratedCount}`);
            console.log(`✓ Tools skipped (already have displayOrder): ${skippedCount}`);
            console.log('');
            console.log('Migration completed successfully!');
        } catch (error) {
            console.error('Error during tools display order migration:', error);
            throw error;
        }
    }

    @Command({
        command: 'rollback:tools-display-order',
        describe: 'Remove displayOrder field from tools',
    })
    async rollback(): Promise<void> {
        try {
            console.log('=== Tools Display Order Rollback ===');
            console.log('');
            console.log('This rollback removes displayOrder field from all tools.');
            console.log('');

            const tools = await this.toolsRepository.findAll({});
            console.log(`Found ${tools.length} tools to rollback...`);
            console.log('');

            let rolledBackCount = 0;

            for (const tool of tools) {
                await this.toolsRepository.updateRaw(
                    { _id: tool._id },
                    { $unset: { displayOrder: '' } }
                );
                rolledBackCount++;
                console.log(`  ✓ Tool "${tool.name}": Removed displayOrder`);
            }

            console.log('');
            console.log('=== Rollback Summary ===');
            console.log(`✓ Total tools processed: ${tools.length}`);
            console.log(`✓ Tools rolled back: ${rolledBackCount}`);
            console.log('');
            console.log('Rollback completed!');
        } catch (error) {
            console.error('Error during tools display order rollback:', error);
            throw error;
        }
    }
}
