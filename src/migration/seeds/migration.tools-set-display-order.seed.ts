import { Injectable } from '@nestjs/common';
import { Command } from 'nestjs-command';
import { ToolsRepository } from '@modules/tools/repository/repositories/tools.repository';

@Injectable()
export class MigrationToolsSetDisplayOrderSeed {
    constructor(private readonly toolsRepository: ToolsRepository) {}

    @Command({
        command: 'migrate:tools-set-display-order',
        describe: 'Set displayOrder for existing tools alphabetically',
    })
    async migrate(): Promise<void> {
        try {
            console.log('=== Set Tools Display Order Migration ===');
            console.log('');
            console.log('This migration sets displayOrder for existing tools (alphabetically).');
            console.log('');

            // Find all tools sorted by name
            const tools = await this.toolsRepository.findAll({});

            // Sort tools alphabetically by name
            const sortedTools = tools.sort((a, b) => a.name.localeCompare(b.name));

            console.log(`Found ${sortedTools.length} tools to update...`);
            console.log('');

            for (let i = 0; i < sortedTools.length; i++) {
                const tool = sortedTools[i];
                const newDisplayOrder = (i + 1) * 10; // 10, 20, 30... to allow inserting between

                await this.toolsRepository.updateRaw(
                    { _id: tool._id },
                    { $set: { displayOrder: newDisplayOrder } }
                );

                console.log(`  ✓ Tool "${tool.name}": displayOrder = ${newDisplayOrder}`);
            }

            console.log('');
            console.log('=== Migration Summary ===');
            console.log(`✓ Total tools updated: ${sortedTools.length}`);
            console.log('');
            console.log('Tools are now ordered alphabetically with gaps (10, 20, 30...)');
            console.log('You can adjust individual displayOrder values as needed.');
            console.log('');
            console.log('Migration completed successfully!');
        } catch (error) {
            console.error('Error during tools set display order migration:', error);
            throw error;
        }
    }
}
