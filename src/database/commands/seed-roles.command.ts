import { Command, CommandRunner, Option } from 'nest-commander';
import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SYSTEM_ROLES } from '@modules/role/seeds/system-roles.seed';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';

interface SeedRolesOptions {
    system?: boolean;
    force?: boolean;
}

/**
 * CLI Command to seed default system roles
 *
 * Usage:
 *   # Seed system roles
 *   npm run cli seed:roles -- --system
 *
 *   # Force overwrite existing roles
 *   npm run cli seed:roles -- --system --force
 */
@Command({
    name: 'seed:roles',
    description: 'Seed default system roles',
})
export class SeedRolesCommand extends CommandRunner {
    private readonly logger = new Logger(SeedRolesCommand.name);

    constructor(
        @InjectDataSource(DATABASE_CONNECTION_NAME) private readonly dataSource: DataSource,
    ) {
        super();
    }

    async run(passedParams: string[], options: SeedRolesOptions): Promise<void> {
        this.logger.log('Starting role seeding...');

        try {
            if (options.system) {
                await this.seedSystemRoles(options.force);
            } else {
                this.logger.warn('No options specified. Use --system');
                this.logger.log('Run with --help for usage information');
            }

            this.logger.log('Seeding completed!');
        } catch (error) {
            this.logger.error('Seeding failed:', error);
            throw error;
        }
    }

    @Option({
        flags: '--system',
        description: 'Seed system-level roles (Super Admin, Company Admin, Agent)',
    })
    parseSystem(): boolean {
        return true;
    }

    @Option({
        flags: '--force',
        description: 'Force overwrite existing roles',
    })
    parseForce(): boolean {
        return true;
    }

    /**
     * Seed system-level roles in central database
     */
    private async seedSystemRoles(force: boolean = false): Promise<void> {
        this.logger.log('Seeding system roles...');

        const queryRunner = this.dataSource.createQueryRunner();

        for (const roleData of SYSTEM_ROLES) {
            const existing = await queryRunner.query(
                `SELECT * FROM roles WHERE name = $1 LIMIT 1`,
                [roleData.name]
            );

            if (existing.length > 0 && !force) {
                this.logger.log(`  Role "${roleData.name}" already exists, skipping`);
                continue;
            }

            if (existing.length > 0 && force) {
                this.logger.log(`  Updating existing role "${roleData.name}"`);
                await queryRunner.query(
                    `UPDATE roles SET permissions = $1, "updatedAt" = $2 WHERE _id = $3`,
                    [JSON.stringify(roleData.permissions || {}), new Date(), existing[0]._id]
                );
            } else {
                this.logger.log(`  Creating role "${roleData.name}"`);
                await queryRunner.query(
                    `INSERT INTO roles (name, type, "isDefault", permissions, level, manageable_roles, editable_roles, access_scope, category, deleted, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                    [
                        roleData.name,
                        (roleData as any).type || 'SYSTEM',
                        (roleData as any).isDefault ?? true,
                        JSON.stringify(roleData.permissions || {}),
                        (roleData as any).level || 1,
                        (roleData as any).manageable_roles || [],
                        (roleData as any).editable_roles || [],
                        (roleData as any).access_scope || 'self',
                        (roleData as any).category || 'custom',
                        false,
                        new Date(),
                        new Date(),
                    ]
                );
            }
        }

        await queryRunner.release();
        this.logger.log('System roles seeded successfully');
    }
}
