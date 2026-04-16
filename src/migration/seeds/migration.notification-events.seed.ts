import { Injectable } from '@nestjs/common';
import { Command } from 'nestjs-command';
import { NotificationEventRepository } from '@modules/notification/repository/repositories/notification-event.repository';
import { NotificationTemplateRepository } from '@modules/notification/repository/repositories/notification-template.repository';

// ─── LEAVE EVENTS ───
const LEAVE_EVENTS = [
    {
        event_key: 'LEAVE_REQUESTED',
        module: 'leave',
        event_type: 'company',
        name: 'Leave Request Submitted',
        description: 'Sent to location/company admin when an employee submits a leave request',
        default_channels: ['email'],
        recipient_type: 'admin',
        variables: ['employee_name', 'leave_type', 'start_date', 'end_date', 'total_days', 'reason', 'location_name', 'admin_name'],
    },
    {
        event_key: 'LEAVE_APPROVED',
        module: 'leave',
        event_type: 'company',
        name: 'Leave Request Approved',
        description: 'Sent to the employee when their leave request is approved',
        default_channels: ['email'],
        recipient_type: 'employee',
        variables: ['employee_name', 'leave_type', 'start_date', 'end_date', 'total_days', 'approved_by'],
    },
    {
        event_key: 'LEAVE_REJECTED',
        module: 'leave',
        event_type: 'company',
        name: 'Leave Request Rejected',
        description: 'Sent to the employee when their leave request is rejected',
        default_channels: ['email'],
        recipient_type: 'employee',
        variables: ['employee_name', 'leave_type', 'start_date', 'end_date', 'total_days', 'rejected_by', 'rejection_reason'],
    },
    {
        event_key: 'LEAVE_CANCELLED_BY_EMPLOYEE',
        module: 'leave',
        event_type: 'company',
        name: 'Leave Cancelled by Employee',
        description: 'Sent to location/company admin when an employee cancels their leave request',
        default_channels: ['email'],
        recipient_type: 'admin',
        variables: ['employee_name', 'leave_type', 'start_date', 'end_date', 'total_days', 'previous_status', 'admin_name'],
    },
    {
        event_key: 'LEAVE_CANCELLED_BY_ADMIN',
        module: 'leave',
        event_type: 'company',
        name: 'Leave Cancelled by Admin',
        description: 'Sent to the employee when an admin cancels their approved leave',
        default_channels: ['email'],
        recipient_type: 'employee',
        variables: ['employee_name', 'leave_type', 'start_date', 'end_date', 'total_days', 'cancelled_by'],
    },
];

// ─── SYSTEM EMAIL TEMPLATES (file-based, reference .hbs template files) ───
const LEAVE_EMAIL_TEMPLATES = [
    {
        event_key: 'LEAVE_REQUESTED',
        channel: 'email',
        level: 'system',
        subject: 'New Leave Request from {{employee_name}}',
        body: 'notifications/leave-requested.template.hbs',
    },
    {
        event_key: 'LEAVE_APPROVED',
        channel: 'email',
        level: 'system',
        subject: 'Your Leave Request has been Approved',
        body: 'notifications/leave-approved.template.hbs',
    },
    {
        event_key: 'LEAVE_REJECTED',
        channel: 'email',
        level: 'system',
        subject: 'Your Leave Request has been Rejected',
        body: 'notifications/leave-rejected.template.hbs',
    },
    {
        event_key: 'LEAVE_CANCELLED_BY_EMPLOYEE',
        channel: 'email',
        level: 'system',
        subject: 'Leave Request Cancelled by {{employee_name}}',
        body: 'notifications/leave-cancelled-by-employee.template.hbs',
    },
    {
        event_key: 'LEAVE_CANCELLED_BY_ADMIN',
        channel: 'email',
        level: 'system',
        subject: 'Your Leave has been Cancelled',
        body: 'notifications/leave-cancelled-by-admin.template.hbs',
    },
];

// ─── SMS TEMPLATES ───
const LEAVE_SMS_TEMPLATES = [
    {
        event_key: 'LEAVE_REQUESTED',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: '{{employee_name}} has requested {{leave_type}} leave from {{start_date}} to {{end_date}} ({{total_days}} days). Please login to approve/reject.',
    },
    {
        event_key: 'LEAVE_APPROVED',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: 'Your {{leave_type}} leave from {{start_date}} to {{end_date}} has been approved by {{approved_by}}.',
    },
    {
        event_key: 'LEAVE_REJECTED',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: 'Your {{leave_type}} leave from {{start_date}} to {{end_date}} has been rejected.{{#if rejection_reason}} Reason: {{rejection_reason}}{{/if}}',
    },
    {
        event_key: 'LEAVE_CANCELLED_BY_EMPLOYEE',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: '{{employee_name}} has cancelled their {{leave_type}} leave request ({{start_date}} - {{end_date}}).',
    },
    {
        event_key: 'LEAVE_CANCELLED_BY_ADMIN',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: 'Your approved {{leave_type}} leave ({{start_date}} - {{end_date}}) has been cancelled by {{cancelled_by}}.',
    },
];

// ─── WHATSAPP TEMPLATES (same as SMS) ───
const LEAVE_WHATSAPP_TEMPLATES = LEAVE_SMS_TEMPLATES.map(t => ({ ...t, channel: 'whatsapp' }));

// ─── SHIFT/ROTA EVENTS ───
const SHIFT_EVENTS = [
    {
        event_key: 'SHIFT_PUBLISHED',
        module: 'rota',
        event_type: 'company',
        name: 'Shift Rota Published',
        description: 'Sent to employees when their shift schedule is published for the week',
        default_channels: ['email'],
        recipient_type: 'employee',
        variables: ['employee_name', 'week_start', 'location_name'],
    },
    {
        event_key: 'SHIFT_UPDATED',
        module: 'rota',
        event_type: 'company',
        name: 'Shift Assignment Updated',
        description: 'Sent to the employee when their shift is changed after being published',
        default_channels: ['email'],
        recipient_type: 'employee',
        variables: ['employee_name', 'shift_date', 'shift_name', 'start_time', 'end_time', 'location_name'],
    },
    {
        event_key: 'SHIFT_SWAP_REQUESTED',
        module: 'rota',
        event_type: 'company',
        name: 'Shift Swap Requested',
        description: 'Sent to the target employee when another employee requests to swap shifts',
        default_channels: ['email'],
        recipient_type: 'employee',
        variables: ['requester_name', 'target_name', 'swap_date', 'shift_name', 'reason'],
    },
    {
        event_key: 'SHIFT_SWAP_APPROVED',
        module: 'rota',
        event_type: 'company',
        name: 'Shift Swap Approved',
        description: 'Sent to both employees when admin approves a shift swap',
        default_channels: ['email'],
        recipient_type: 'employee',
        variables: ['requester_name', 'target_name', 'swap_date', 'approved_by'],
    },
    {
        event_key: 'SHIFT_SWAP_REJECTED',
        module: 'rota',
        event_type: 'company',
        name: 'Shift Swap Rejected',
        description: 'Sent to both employees and location admin when admin rejects a shift swap',
        default_channels: ['email'],
        recipient_type: 'employee',
        variables: ['requester_name', 'target_name', 'swap_date', 'rejected_by', 'admin_notes'],
    },
    {
        event_key: 'SHIFT_SWAP_ACCEPTED',
        module: 'rota',
        event_type: 'company',
        name: 'Shift Swap Accepted by Employee',
        description: 'Sent to the requester and location admin when the target employee accepts a swap request',
        default_channels: ['email'],
        recipient_type: 'employee',
        variables: ['requester_name', 'target_name', 'swap_date', 'status'],
    },
    {
        event_key: 'SHIFT_SWAP_DECLINED',
        module: 'rota',
        event_type: 'company',
        name: 'Shift Swap Declined by Employee',
        description: 'Sent to the requester and location admin when the target employee declines a swap request',
        default_channels: ['email'],
        recipient_type: 'employee',
        variables: ['requester_name', 'target_name', 'swap_date', 'status'],
    },
];

const SHIFT_EMAIL_TEMPLATES = [
    {
        event_key: 'SHIFT_PUBLISHED',
        channel: 'email',
        level: 'system',
        subject: 'Your Shift Schedule has been Published',
        body: 'notifications/shift-published.template.hbs',
    },
    {
        event_key: 'SHIFT_UPDATED',
        channel: 'email',
        level: 'system',
        subject: 'Your Shift on {{shift_date}} has been Updated',
        body: 'notifications/shift-updated.template.hbs',
    },
    {
        event_key: 'SHIFT_SWAP_REQUESTED',
        channel: 'email',
        level: 'system',
        subject: '{{requester_name}} wants to Swap Shifts with You',
        body: 'notifications/shift-swap-requested.template.hbs',
    },
    {
        event_key: 'SHIFT_SWAP_APPROVED',
        channel: 'email',
        level: 'system',
        subject: 'Shift Swap Approved',
        body: 'notifications/shift-swap-approved.template.hbs',
    },
    {
        event_key: 'SHIFT_SWAP_REJECTED',
        channel: 'email',
        level: 'system',
        subject: 'Shift Swap Request Rejected',
        body: 'notifications/shift-swap-rejected.template.hbs',
    },
    {
        event_key: 'SHIFT_SWAP_ACCEPTED',
        channel: 'email',
        level: 'system',
        subject: 'Shift Swap Accepted by {{target_name}}',
        body: 'notifications/shift-swap-accepted.template.hbs',
    },
    {
        event_key: 'SHIFT_SWAP_DECLINED',
        channel: 'email',
        level: 'system',
        subject: 'Shift Swap Declined by {{target_name}}',
        body: 'notifications/shift-swap-declined.template.hbs',
    },
];

const SHIFT_SMS_TEMPLATES = [
    {
        event_key: 'SHIFT_PUBLISHED',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: 'Hi {{employee_name}}, your shift schedule for the week of {{week_start}} has been published. Please log in to view your shifts.',
    },
    {
        event_key: 'SHIFT_UPDATED',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: 'Hi {{employee_name}}, your shift on {{shift_date}} has been updated to {{shift_name}} ({{start_time}} - {{end_time}}). Please check for details.',
    },
    {
        event_key: 'SHIFT_SWAP_REQUESTED',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: '{{requester_name}} has requested to swap shifts with you on {{swap_date}}. Please log in to accept or decline.',
    },
    {
        event_key: 'SHIFT_SWAP_APPROVED',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: 'Your shift swap for {{swap_date}} has been approved by {{approved_by}}.',
    },
    {
        event_key: 'SHIFT_SWAP_REJECTED',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: 'Your shift swap request for {{swap_date}} has been rejected by {{rejected_by}}.',
    },
    {
        event_key: 'SHIFT_SWAP_ACCEPTED',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: '{{target_name}} has accepted your shift swap request for {{swap_date}}. Awaiting admin approval.',
    },
    {
        event_key: 'SHIFT_SWAP_DECLINED',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: '{{target_name}} has declined your shift swap request for {{swap_date}}.',
    },
];
const SHIFT_WHATSAPP_TEMPLATES = SHIFT_SMS_TEMPLATES.map(t => ({ ...t, channel: 'whatsapp' }));

// ─── CONTRACT EVENTS ───
const CONTRACT_EVENTS = [
    {
        event_key: 'CONTRACT_ISSUED',
        module: 'contract',
        event_type: 'company',
        name: 'Contract Issued',
        description: 'Sent to the employee when a contract is issued to them',
        default_channels: ['email'],
        recipient_type: 'employee',
        variables: ['employee_name', 'contract_name', 'effective_date', 'end_date', 'issued_by'],
    },
    {
        event_key: 'CONTRACT_SIGNED',
        module: 'contract',
        event_type: 'company',
        name: 'Contract Signed',
        description: 'Sent to admin when an employee signs their contract',
        default_channels: ['email'],
        recipient_type: 'admin',
        variables: ['employee_name', 'contract_name', 'signed_date', 'location_name', 'admin_name'],
    },
];

const CONTRACT_EMAIL_TEMPLATES = [
    {
        event_key: 'CONTRACT_ISSUED',
        channel: 'email',
        level: 'system',
        subject: 'New Contract Issued: {{contract_name}}',
        body: 'notifications/contract-issued.template.hbs',
    },
    {
        event_key: 'CONTRACT_SIGNED',
        channel: 'email',
        level: 'system',
        subject: '{{employee_name}} has Signed their Contract',
        body: 'notifications/contract-signed.template.hbs',
    },
];

const CONTRACT_SMS_TEMPLATES = [
    {
        event_key: 'CONTRACT_ISSUED',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: 'Hi {{employee_name}}, a new contract "{{contract_name}}" has been issued to you. Please log in to review and sign it.',
    },
    {
        event_key: 'CONTRACT_SIGNED',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: '{{employee_name}} has signed their contract "{{contract_name}}".',
    },
];
const CONTRACT_WHATSAPP_TEMPLATES = CONTRACT_SMS_TEMPLATES.map(t => ({ ...t, channel: 'whatsapp' }));

// ─── COMPLIANCE EVENTS ───
const COMPLIANCE_EVENTS = [
    {
        event_key: 'VISA_EXPIRY_WARNING',
        module: 'compliance',
        event_type: 'company',
        name: 'Visa/BRP Expiry Warning',
        description: 'Sent to location/company admin when an employee visa or BRP is approaching expiry',
        default_channels: ['email'],
        recipient_type: 'admin',
        variables: ['employee_name', 'visa_type', 'visa_expiry_date', 'days_remaining', 'brp_number', 'location_name', 'admin_name'],
    },
    {
        event_key: 'RTW_FOLLOWUP_DUE',
        module: 'compliance',
        event_type: 'company',
        name: 'RTW Follow-up Due',
        description: 'Sent to location/company admin when a Right to Work follow-up check is due',
        default_channels: ['email'],
        recipient_type: 'admin',
        variables: ['employee_name', 'check_type', 'original_check_date', 'follow_up_date', 'location_name', 'admin_name'],
    },
    {
        event_key: 'UKVI_DEADLINE_WARNING',
        module: 'compliance',
        event_type: 'company',
        name: 'UKVI Reporting Deadline Warning',
        description: 'Sent to location/company admin when a UKVI reportable event deadline is approaching',
        default_channels: ['email'],
        recipient_type: 'admin',
        variables: ['employee_name', 'event_type', 'event_date', 'reporting_deadline', 'days_remaining', 'description', 'location_name', 'admin_name'],
    },
    {
        event_key: 'COMPLIANCE_EVENT_CREATED',
        module: 'compliance',
        event_type: 'company',
        name: 'Compliance Event Raised',
        description: 'Sent to location/company admin when a new compliance event is created for an employee',
        default_channels: ['email'],
        recipient_type: 'admin',
        variables: ['employee_name', 'event_type', 'event_date', 'description', 'reporting_deadline', 'location_name', 'admin_name'],
    },
];

const COMPLIANCE_EMAIL_TEMPLATES = [
    {
        event_key: 'VISA_EXPIRY_WARNING',
        channel: 'email',
        level: 'system',
        subject: 'Visa Expiry Alert: {{employee_name}} - {{days_remaining}} days remaining',
        body: 'notifications/visa-expiry-warning.template.hbs',
    },
    {
        event_key: 'RTW_FOLLOWUP_DUE',
        channel: 'email',
        level: 'system',
        subject: 'RTW Follow-up Due: {{employee_name}}',
        body: 'notifications/rtw-followup-due.template.hbs',
    },
    {
        event_key: 'UKVI_DEADLINE_WARNING',
        channel: 'email',
        level: 'system',
        subject: 'UKVI Reporting Deadline: {{employee_name}} - {{days_remaining}} days left',
        body: 'notifications/ukvi-deadline-warning.template.hbs',
    },
    {
        event_key: 'COMPLIANCE_EVENT_CREATED',
        channel: 'email',
        level: 'system',
        subject: 'New Compliance Event: {{employee_name}} - {{event_type}}',
        body: 'notifications/compliance-event-created.template.hbs',
    },
];

const COMPLIANCE_SMS_TEMPLATES = [
    {
        event_key: 'VISA_EXPIRY_WARNING',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: 'URGENT: {{employee_name}} visa expires in {{days_remaining}} days ({{visa_expiry_date}}). Please log in to take action.',
    },
    {
        event_key: 'RTW_FOLLOWUP_DUE',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: 'RTW follow-up check due for {{employee_name}} on {{follow_up_date}}. Please log in to complete the check.',
    },
    {
        event_key: 'UKVI_DEADLINE_WARNING',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: 'UKVI deadline: {{event_type}} for {{employee_name}} must be reported by {{reporting_deadline}} ({{days_remaining}} days). Action required.',
    },
    {
        event_key: 'COMPLIANCE_EVENT_CREATED',
        channel: 'sms',
        level: 'system',
        subject: null,
        body: 'New compliance event for {{employee_name}}: {{event_type}} on {{event_date}}. Please log in to review.',
    },
];
const COMPLIANCE_WHATSAPP_TEMPLATES = COMPLIANCE_SMS_TEMPLATES.map(t => ({ ...t, channel: 'whatsapp' }));

@Injectable()
export class MigrationNotificationEventsSeed {
    constructor(
        private readonly eventRepository: NotificationEventRepository,
        private readonly templateRepository: NotificationTemplateRepository,
    ) {}

    @Command({
        command: 'seed:notification-events',
        describe: 'Seed notification events and default templates for all modules',
    })
    async seed(): Promise<void> {
        try {
            console.log('=== Notification Events Seed ===');
            console.log('');

            // All events from all modules
            const ALL_EVENTS = [...LEAVE_EVENTS, ...SHIFT_EVENTS, ...CONTRACT_EVENTS, ...COMPLIANCE_EVENTS];

            // Seed events
            let eventsCreated = 0;
            let eventsSkipped = 0;

            for (const eventData of ALL_EVENTS) {
                const exists = await this.eventRepository.exists({
                    event_key: eventData.event_key,
                    deleted: false,
                });
                if (exists) {
                    console.log(`  - Skipping event "${eventData.name}" (already exists)`);
                    eventsSkipped++;
                    continue;
                }

                await this.eventRepository.create({
                    ...eventData,
                    is_active: true,
                } as any);
                console.log(`  + Created event "${eventData.name}" (${eventData.event_key})`);
                eventsCreated++;
            }

            console.log('');
            console.log(`  Events: ${eventsCreated} created, ${eventsSkipped} skipped`);
            console.log('');

            // All templates from all modules
            const allTemplates = [
                ...LEAVE_EMAIL_TEMPLATES, ...LEAVE_SMS_TEMPLATES, ...LEAVE_WHATSAPP_TEMPLATES,
                ...SHIFT_EMAIL_TEMPLATES, ...SHIFT_SMS_TEMPLATES, ...SHIFT_WHATSAPP_TEMPLATES,
                ...CONTRACT_EMAIL_TEMPLATES, ...CONTRACT_SMS_TEMPLATES, ...CONTRACT_WHATSAPP_TEMPLATES,
                ...COMPLIANCE_EMAIL_TEMPLATES, ...COMPLIANCE_SMS_TEMPLATES, ...COMPLIANCE_WHATSAPP_TEMPLATES,
            ];
            let templatesCreated = 0;
            let templatesSkipped = 0;

            for (const tmplData of allTemplates) {
                const exists = await this.templateRepository.exists({
                    event_key: tmplData.event_key,
                    channel: tmplData.channel,
                    level: tmplData.level,
                    company_id: null,
                    location_id: null,
                    deleted: false,
                });
                if (exists) {
                    console.log(`  - Skipping template "${tmplData.event_key}" ${tmplData.channel} (already exists)`);
                    templatesSkipped++;
                    continue;
                }

                await this.templateRepository.create({
                    ...tmplData,
                    company_id: null,
                    location_id: null,
                    is_active: true,
                    language: 'en',
                } as any);
                console.log(`  + Created template "${tmplData.event_key}" ${tmplData.channel}`);
                templatesCreated++;
            }

            console.log('');
            console.log(`  Templates: ${templatesCreated} created, ${templatesSkipped} skipped`);
            console.log('');
            console.log('Notification events seeding completed successfully!');
        } catch (error) {
            console.error('Error during notification events seeding:', error);
            throw error;
        }
    }

    @Command({
        command: 'remove:notification-events',
        describe: 'Remove all seeded notification events and system templates',
    })
    async remove(): Promise<void> {
        try {
            console.log('=== Removing Notification Events & Templates ===');

            // Remove system templates
            const templates = await this.templateRepository.findAll({
                level: 'system',
                deleted: false,
            });
            for (const tmpl of templates) {
                await this.templateRepository.deleteMany({ _id: String(tmpl._id) });
                console.log(`  - Removed template "${tmpl.event_key}" ${tmpl.channel}`);
            }

            // Remove events
            const events = await this.eventRepository.findAll({ deleted: false });
            for (const evt of events) {
                await this.eventRepository.deleteMany({ _id: String(evt._id) });
                console.log(`  - Removed event "${evt.event_key}"`);
            }

            console.log('Notification events removal completed.');
        } catch (error) {
            console.error('Error during notification events removal:', error);
            throw error;
        }
    }
}
