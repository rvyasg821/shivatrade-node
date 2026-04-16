import { Injectable } from '@nestjs/common';
import { Command } from 'nestjs-command';
import { LeaveTypeRepository } from '@modules/leave/repository/repositories/leave-type.repository';

// System-level default leave types (is_system: true, company_id: null)
// These are visible to ALL companies alongside their own custom leave types.
const DEFAULT_LEAVE_TYPES = [
    {
        name: 'Annual Leave',
        slug: 'annual_leave',
        color: '#0ea5e9',
        is_paid: true,
        requires_approval: true,
        max_days_per_year: 28,
        is_system: true,
        carry_over_allowed: true,
        max_carry_over_days: 5,
        accrual_method: 'annual',
        notice_days: 7,
        documentation_required: false,
        documentation_after_days: null,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'Sick Leave',
        slug: 'sick_leave',
        color: '#ef4444',
        is_paid: true,
        requires_approval: false,
        max_days_per_year: null,
        is_system: true,
        carry_over_allowed: false,
        max_carry_over_days: null,
        accrual_method: 'none',
        notice_days: 0,
        documentation_required: true,
        documentation_after_days: 7,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'Maternity Leave',
        slug: 'maternity_leave',
        color: '#ec4899',
        is_paid: true,
        requires_approval: true,
        max_days_per_year: 365,
        is_system: true,
        carry_over_allowed: false,
        max_carry_over_days: null,
        accrual_method: 'none',
        notice_days: 28,
        documentation_required: true,
        documentation_after_days: 1,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'Paternity Leave',
        slug: 'paternity_leave',
        color: '#8b5cf6',
        is_paid: true,
        requires_approval: true,
        max_days_per_year: 14,
        is_system: true,
        carry_over_allowed: false,
        max_carry_over_days: null,
        accrual_method: 'none',
        notice_days: 28,
        documentation_required: true,
        documentation_after_days: 1,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'Compassionate Leave',
        slug: 'compassionate_leave',
        color: '#f59e0b',
        is_paid: true,
        requires_approval: true,
        max_days_per_year: 5,
        is_system: true,
        carry_over_allowed: false,
        max_carry_over_days: null,
        accrual_method: 'none',
        notice_days: 0,
        documentation_required: false,
        documentation_after_days: null,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'Unpaid Leave',
        slug: 'unpaid_leave',
        color: '#6b7280',
        is_paid: false,
        requires_approval: true,
        max_days_per_year: null,
        is_system: true,
        carry_over_allowed: false,
        max_carry_over_days: null,
        accrual_method: 'none',
        notice_days: 14,
        documentation_required: false,
        documentation_after_days: null,
        is_active: true,
        soft_delete: false,
    },
    {
        name: 'TOIL (Time Off in Lieu)',
        slug: 'toil',
        color: '#10b981',
        is_paid: true,
        requires_approval: true,
        max_days_per_year: null,
        is_system: true,
        carry_over_allowed: true,
        max_carry_over_days: 10,
        accrual_method: 'none',
        notice_days: 1,
        documentation_required: false,
        documentation_after_days: null,
        is_active: true,
        soft_delete: false,
    },
];

@Injectable()
export class MigrationLeaveTypesSeed {
    constructor(private readonly leaveTypeRepository: LeaveTypeRepository) {}

    @Command({
        command: 'seed:leave-types',
        describe: 'Seed system-level default leave types (Annual, Sick, Maternity, etc.)',
    })
    async seed(): Promise<void> {
        try {
            console.log('=== Leave Types Seed ===');
            console.log('');

            let created = 0;
            let skipped = 0;

            for (const ltData of DEFAULT_LEAVE_TYPES) {
                const exists = await this.leaveTypeRepository.exists({ slug: ltData.slug, is_system: true });
                if (exists) {
                    console.log(`  - Skipping "${ltData.name}" (already exists)`);
                    skipped++;
                    continue;
                }

                await this.leaveTypeRepository.create({ ...ltData, company_id: null } as any);
                console.log(`  + Created "${ltData.name}" (${ltData.slug})`);
                created++;
            }

            console.log('');
            console.log('=== Seed Summary ===');
            console.log(`  Created : ${created}`);
            console.log(`  Skipped : ${skipped}`);
            console.log('');
            console.log('Leave types seeding completed successfully!');
        } catch (error) {
            console.error('Error during leave types seeding:', error);
            throw error;
        }
    }

    @Command({
        command: 'remove:leave-types',
        describe: 'Remove system-level default leave types',
    })
    async remove(): Promise<void> {
        try {
            console.log('=== Removing System Leave Types ===');
            const items = await this.leaveTypeRepository.findAll({ is_system: true, soft_delete: false });
            for (const item of items) {
                await this.leaveTypeRepository.deleteMany({ _id: String(item._id) });
                console.log(`  - Removed "${item.name}"`);
            }
            console.log('Leave types removal completed.');
        } catch (error) {
            console.error('Error during leave types removal:', error);
            throw error;
        }
    }
}
