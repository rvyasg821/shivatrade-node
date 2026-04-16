import { Injectable } from '@nestjs/common';
import { Command } from 'nestjs-command';
import { DocumentCategoryRepository } from '@modules/document/repository/repositories/document-category.repository';

// System-level default document categories (is_system: true, company_id: null)
// Visible to ALL companies. Non-deletable.
const DEFAULT_DOCUMENT_CATEGORIES = [
    {
        name: 'Contract',
        slug: 'contract',
        is_system: true,
        requires_expiry: false,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'Passport / ID',
        slug: 'passport_id',
        is_system: true,
        requires_expiry: true,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'Visa',
        slug: 'visa',
        is_system: true,
        requires_expiry: true,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'BRP Card',
        slug: 'brp',
        is_system: true,
        requires_expiry: true,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'Right to Work',
        slug: 'right_to_work',
        is_system: true,
        requires_expiry: true,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'DBS Check',
        slug: 'dbs_check',
        is_system: true,
        requires_expiry: true,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'P45',
        slug: 'p45',
        is_system: true,
        requires_expiry: false,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'P60',
        slug: 'p60',
        is_system: true,
        requires_expiry: false,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'Certificate / Qualification',
        slug: 'certificate',
        is_system: true,
        requires_expiry: false,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'Medical / Health',
        slug: 'medical',
        is_system: true,
        requires_expiry: true,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'Training Record',
        slug: 'training',
        is_system: true,
        requires_expiry: false,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'Reference Letter',
        slug: 'reference',
        is_system: true,
        requires_expiry: false,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'Other',
        slug: 'other',
        is_system: true,
        requires_expiry: false,
        is_active: true,
        soft_delete: false,
    },
];

@Injectable()
export class MigrationDocumentCategoriesSeed {
    constructor(
        private readonly documentCategoryRepository: DocumentCategoryRepository,
    ) {}

    @Command({
        command: 'seed:document-categories',
        describe: 'Seed system-level default document categories',
    })
    async seed(): Promise<void> {
        try {
            console.log('=== Seeding Document Categories ===');
            let created = 0;
            let skipped = 0;

            for (const cat of DEFAULT_DOCUMENT_CATEGORIES) {
                const existing = await this.documentCategoryRepository.findOne({
                    slug: cat.slug,
                    is_system: true,
                    soft_delete: false,
                });
                if (existing) {
                    console.log(`  - Skipped (exists): "${cat.name}"`);
                    skipped++;
                } else {
                    await this.documentCategoryRepository.create(cat as any);
                    console.log(`  + Created: "${cat.name}"`);
                    created++;
                }
            }

            console.log('');
            console.log('=== Seed Summary ===');
            console.log(`  Created : ${created}`);
            console.log(`  Skipped : ${skipped}`);
            console.log('');
            console.log('Document categories seeding completed successfully!');
        } catch (error) {
            console.error('Error during document categories seeding:', error);
            throw error;
        }
    }

    @Command({
        command: 'remove:document-categories',
        describe: 'Remove system-level default document categories',
    })
    async remove(): Promise<void> {
        try {
            console.log('=== Removing System Document Categories ===');
            const items = await this.documentCategoryRepository.findAll({
                is_system: true,
                soft_delete: false,
            });
            for (const item of items) {
                await this.documentCategoryRepository.deleteMany({ _id: String(item._id) });
                console.log(`  - Removed "${item.name}"`);
            }
            console.log('Document categories removal completed.');
        } catch (error) {
            console.error('Error during document categories removal:', error);
            throw error;
        }
    }
}
