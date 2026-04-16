import { Injectable } from '@nestjs/common';
import { Command } from 'nestjs-command';
import { ToolsRepository } from '@modules/tools/repository/repositories/tools.repository';
import { ENUM_TOOLS_STATUS } from '@modules/tools/enums/tools.enum';

// HRM Module Tools — one tool per HRM feature module.
// Plans reference these by _id after lookup, so slug must be stable.
const HRM_TOOLS_SEED_DATA = [
    {
        name: 'Holiday Calendar',
        description: 'Manage company-wide and location-specific public holidays. Import UK bank holidays automatically and define custom holiday calendars per year.',
        status: ENUM_TOOLS_STATUS.ACTIVE,
        slug: 'hrm-holiday-calendar',
        displayOrder: 1,
        soft_delete: false,
        settings: [],
        widgets: [],
    },
    {
        name: 'Document Management',
        description: 'Securely store, version, and manage employee documents including contracts, IDs, visas, BRP cards, certificates, and DBS checks. Track expiry dates with automated alerts.',
        status: ENUM_TOOLS_STATUS.ACTIVE,
        slug: 'hrm-documents',
        displayOrder: 2,
        soft_delete: false,
        settings: [],
        widgets: [],
    },
    {
        name: 'Contracts',
        description: 'Build employment contract templates with customisable sections and fields. Issue contracts to employees with auto-populated data, collect digital signatures, and generate PDFs automatically.',
        status: ENUM_TOOLS_STATUS.ACTIVE,
        slug: 'hrm-contracts',
        displayOrder: 3,
        soft_delete: false,
        settings: [],
        widgets: [],
    },
    {
        name: 'Leave Management',
        description: 'Full leave lifecycle management including configurable leave types, annual entitlements, carry-over rules, half-day requests, approval workflows, and team calendar views.',
        status: ENUM_TOOLS_STATUS.ACTIVE,
        slug: 'hrm-leave',
        displayOrder: 4,
        soft_delete: false,
        settings: [],
        widgets: [],
    },
    {
        name: 'Attendance',
        description: 'Track employee clock-in/out with optional GPS verification and facial recognition. Monitor overtime, late arrivals, breaks, and auto-generate daily and monthly attendance reports.',
        status: ENUM_TOOLS_STATUS.ACTIVE,
        slug: 'hrm-attendance',
        displayOrder: 5,
        soft_delete: false,
        settings: [],
        widgets: [],
    },
    {
        name: 'Shift & Rota',
        description: 'Build and publish weekly and monthly rotas. Assign shift templates, copy rotas between weeks, manage shift swap requests, and detect scheduling conflicts automatically.',
        status: ENUM_TOOLS_STATUS.ACTIVE,
        slug: 'hrm-shift-rota',
        displayOrder: 6,
        soft_delete: false,
        settings: [],
        widgets: [],
    },
    {
        name: 'Home Office Compliance',
        description: 'Manage UK immigration records, Right to Work checks, and UKVI reportable events. Automated visa expiry alerts at 90/60/30/14/7 days, GDPR-compliant data retention, and full audit trail.',
        status: ENUM_TOOLS_STATUS.ACTIVE,
        slug: 'hrm-compliance',
        displayOrder: 7,
        soft_delete: false,
        settings: [],
        widgets: [],
    },
    {
        name: 'Payroll',
        description: 'Run payroll cycles using attendance hours, leave records, and employee salary data. Calculate gross pay automatically (base, overtime, bonuses, allowances), enter statutory deductions manually or import from your accountant, generate branded payslip PDFs, export bank payment files, and let employees view their payslips via self-service.',
        status: ENUM_TOOLS_STATUS.ACTIVE,
        slug: 'hrm-payroll',
        displayOrder: 8,
        soft_delete: false,
        settings: [],
        widgets: [],
    },
];

@Injectable()
export class MigrationToolsSeed {
    constructor(private readonly toolsRepository: ToolsRepository) {}

    @Command({
        command: 'seed:tools',
        describe: 'Seed the tools table with HRM module tools (replaces old security tools)',
    })
    async seed(): Promise<void> {
        try {
            console.log('=== HRM Tools Seed ===');
            console.log('');

            let created = 0;
            let skipped = 0;

            for (const toolData of HRM_TOOLS_SEED_DATA) {
                const exists = await this.toolsRepository.exists({ slug: toolData.slug });
                if (exists) {
                    console.log(`  - Skipping "${toolData.name}" (already exists)`);
                    skipped++;
                    continue;
                }

                await this.toolsRepository.create(toolData);
                console.log(`  + Created "${toolData.name}" (${toolData.slug})`);
                created++;
            }

            console.log('');
            console.log('=== Seed Summary ===');
            console.log(`  Created : ${created}`);
            console.log(`  Skipped : ${skipped}`);
            console.log('');
            console.log('HRM tools seeding completed successfully!');
            console.log('Run "seed:hrm-plans" next to create HRM subscription plans.');
        } catch (error) {
            console.error('Error during HRM tools seeding:', error);
            throw error;
        }
    }

    @Command({
        command: 'remove:tools',
        describe: 'Remove ALL tools from the database (clears old security tools and HRM tools)',
    })
    async remove(): Promise<void> {
        try {
            console.log('=== Removing All Tools ===');
            console.log('');

            // Get all tools and delete each by _id to avoid empty-criteria error
            const allTools = await this.toolsRepository.findAll({});
            if (allTools.length === 0) {
                console.log('  - No tools found in database');
            } else {
                for (const tool of allTools) {
                    await this.toolsRepository.deleteMany({ _id: String(tool._id) });
                    console.log(`  - Removed "${tool.name}" (${tool.slug})`);
                }
            }

            console.log('  ✅ All tools removed from database');
            console.log('');
            console.log('Tools removal completed.');
        } catch (error) {
            console.error('Error during tools removal:', error);
            throw error;
        }
    }
}
