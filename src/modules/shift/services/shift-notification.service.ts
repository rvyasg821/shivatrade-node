import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from '@modules/notification/services/notification.service';
import { UserService } from '@modules/user/services/user.service';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';
import { RoleService } from '@modules/role/services/role.service';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { LocationService } from '@modules/location/services/location.service';
import { ShiftTemplateService } from '../services/shift-template.service';
import { ShiftAssignmentService } from '../services/shift-assignment.service';
import { ShiftAssignmentEntity } from '../repository/entities/shift-assignment.entity';
import { ShiftSwapRequestEntity } from '../repository/entities/shift-swap-request.entity';

@Injectable()
export class ShiftNotificationService {
    private readonly logger = new Logger(ShiftNotificationService.name);

    constructor(
        private readonly notificationService: NotificationService,
        private readonly userService: UserService,
        private readonly userRepository: UserRepository,
        private readonly roleService: RoleService,
        private readonly locationService: LocationService,
        private readonly shiftTemplateService: ShiftTemplateService,
        private readonly shiftAssignmentService: ShiftAssignmentService,
    ) {}

    /**
     * Notify all affected employees when admin publishes rota for a week.
     */
    async notifyShiftPublished(
        companyId: string,
        locationId: string,
        userIds: string[],
        weekStart: string,
    ): Promise<void> {
        try {
            const location = locationId ? await this.resolveLocation(locationId) : null;

            for (const userId of userIds) {
                try {
                    const employee = await this.resolveUser(userId);
                    if (!employee?.email) {
                        this.logger.warn(`Employee email not found for SHIFT_PUBLISHED (user: ${userId})`);
                        continue;
                    }

                    await this.notificationService.sendEventNotification({
                        eventKey: 'SHIFT_PUBLISHED',
                        companyId,
                        locationId,
                        recipients: [{
                            email: employee.email,
                            phone: employee.mobile ? this.formatPhone(employee) : undefined,
                            name: employee.name || employee.first_name || 'Employee',
                        }],
                        variables: {
                            employee_name: employee.name || employee.first_name || 'Employee',
                            week_start: weekStart,
                            location_name: location?.location_name || '',
                        },
                    });
                } catch (error) {
                    this.logger.error(`Failed to send SHIFT_PUBLISHED notification to user ${userId}: ${error.message}`);
                }
            }
        } catch (error) {
            this.logger.error(`Failed to send SHIFT_PUBLISHED notifications: ${error.message}`);
        }
    }

    /**
     * Notify employee when their shift assignment is updated.
     */
    async notifyShiftUpdated(assignment: ShiftAssignmentEntity): Promise<void> {
        try {
            const [employee, template, location] = await Promise.all([
                this.resolveUser(assignment.user_id),
                assignment.shift_template_id
                    ? this.resolveShiftTemplate(assignment.shift_template_id)
                    : null,
                assignment.location_id ? this.resolveLocation(assignment.location_id) : null,
            ]);

            if (!employee?.email) {
                this.logger.warn(`Employee email not found for SHIFT_UPDATED (user: ${assignment.user_id})`);
                return;
            }

            await this.notificationService.sendEventNotification({
                eventKey: 'SHIFT_UPDATED',
                companyId: assignment.company_id,
                locationId: assignment.location_id,
                recipients: [{
                    email: employee.email,
                    phone: employee.mobile ? this.formatPhone(employee) : undefined,
                    name: employee.name || employee.first_name || 'Employee',
                }],
                variables: {
                    employee_name: employee.name || employee.first_name || 'Employee',
                    shift_date: assignment.date,
                    shift_name: template?.name || 'Shift',
                    start_time: assignment.start_time || template?.start_time || '',
                    end_time: assignment.end_time || template?.end_time || '',
                    location_name: location?.location_name || '',
                },
            });
        } catch (error) {
            this.logger.error(`Failed to send SHIFT_UPDATED notification: ${error.message}`);
        }
    }

    /**
     * Notify target employee + location admin when a swap is requested.
     */
    async notifySwapRequested(swap: ShiftSwapRequestEntity): Promise<void> {
        try {
            const [requester, target, requesterAssignment] = await Promise.all([
                this.resolveUser(swap.requester_id),
                swap.target_id ? this.resolveUser(swap.target_id) : null,
                this.resolveAssignment(swap.requester_assignment_id),
            ]);

            const template = requesterAssignment?.shift_template_id
                ? await this.resolveShiftTemplate(requesterAssignment.shift_template_id)
                : null;

            const requesterName = requester?.name || requester?.first_name || 'Employee';
            const targetName = target?.name || target?.first_name || 'Employee';
            const swapDate = requesterAssignment?.date || '';
            const shiftName = template?.name || 'Shift';

            const recipients = this.buildRecipient(target);

            // Also notify location admin(s)
            const locationId = requesterAssignment?.location_id;
            if (locationId) {
                const adminRecipients = await this.resolveLocationAdmins(swap.company_id, locationId);
                recipients.push(...adminRecipients);
            }

            if (!recipients.length) {
                this.logger.warn(`No recipients for SHIFT_SWAP_REQUESTED (swap: ${swap._id})`);
                return;
            }

            await this.notificationService.sendEventNotification({
                eventKey: 'SHIFT_SWAP_REQUESTED',
                companyId: swap.company_id,
                locationId: locationId || null,
                recipients,
                variables: {
                    requester_name: requesterName,
                    target_name: targetName,
                    swap_date: swapDate,
                    shift_name: shiftName,
                    reason: swap.reason || '',
                },
            });
        } catch (error) {
            this.logger.error(`Failed to send SHIFT_SWAP_REQUESTED notification: ${error.message}`);
        }
    }

    /**
     * Notify requester + location admin when target accepts or declines.
     */
    async notifySwapResponded(swap: ShiftSwapRequestEntity, accepted: boolean): Promise<void> {
        try {
            const [requester, target, requesterAssignment] = await Promise.all([
                this.resolveUser(swap.requester_id),
                swap.target_id ? this.resolveUser(swap.target_id) : null,
                this.resolveAssignment(swap.requester_assignment_id),
            ]);

            const requesterName = requester?.name || requester?.first_name || 'Employee';
            const targetName = target?.name || target?.first_name || 'Employee';
            const swapDate = requesterAssignment?.date || '';

            const eventKey = accepted ? 'SHIFT_SWAP_ACCEPTED' : 'SHIFT_SWAP_DECLINED';

            // Notify requester
            const recipients = this.buildRecipient(requester);

            // Also notify location admin(s)
            const locationId = requesterAssignment?.location_id;
            if (locationId) {
                const adminRecipients = await this.resolveLocationAdmins(swap.company_id, locationId);
                recipients.push(...adminRecipients);
            }

            if (!recipients.length) {
                this.logger.warn(`No recipients for ${eventKey} (swap: ${swap._id})`);
                return;
            }

            await this.notificationService.sendEventNotification({
                eventKey,
                companyId: swap.company_id,
                locationId: locationId || null,
                recipients,
                variables: {
                    requester_name: requesterName,
                    target_name: targetName,
                    swap_date: swapDate,
                    status: accepted ? 'accepted' : 'declined',
                },
            });
        } catch (error) {
            this.logger.error(`Failed to send swap responded notification: ${error.message}`);
        }
    }

    /**
     * Notify both employees + location admin when admin approves a swap.
     */
    async notifySwapApproved(swap: ShiftSwapRequestEntity, adminId: string): Promise<void> {
        try {
            const [requester, target, admin, requesterAssignment] = await Promise.all([
                this.resolveUser(swap.requester_id),
                swap.target_id ? this.resolveUser(swap.target_id) : null,
                this.resolveUser(adminId),
                this.resolveAssignment(swap.requester_assignment_id),
            ]);

            const approvedByName = admin?.name || admin?.first_name || 'Admin';
            const swapDate = requesterAssignment?.date || '';

            const recipients = [
                ...this.buildRecipient(requester),
                ...this.buildRecipient(target),
            ];

            // Also notify location admin(s)
            const locationId = requesterAssignment?.location_id;
            if (locationId) {
                const adminRecipients = await this.resolveLocationAdmins(swap.company_id, locationId);
                recipients.push(...adminRecipients);
            }

            if (!recipients.length) {
                this.logger.warn(`No recipients for SHIFT_SWAP_APPROVED (swap: ${swap._id})`);
                return;
            }

            await this.notificationService.sendEventNotification({
                eventKey: 'SHIFT_SWAP_APPROVED',
                companyId: swap.company_id,
                locationId: locationId || null,
                recipients,
                variables: {
                    requester_name: requester?.name || requester?.first_name || 'Employee',
                    target_name: target?.name || target?.first_name || 'Employee',
                    swap_date: swapDate,
                    approved_by: approvedByName,
                },
            });
        } catch (error) {
            this.logger.error(`Failed to send SHIFT_SWAP_APPROVED notification: ${error.message}`);
        }
    }

    /**
     * Notify both employees + location admin when admin rejects a swap.
     */
    async notifySwapRejected(swap: ShiftSwapRequestEntity, adminId: string): Promise<void> {
        try {
            const [requester, target, admin, requesterAssignment] = await Promise.all([
                this.resolveUser(swap.requester_id),
                swap.target_id ? this.resolveUser(swap.target_id) : null,
                this.resolveUser(adminId),
                this.resolveAssignment(swap.requester_assignment_id),
            ]);

            const rejectedByName = admin?.name || admin?.first_name || 'Admin';
            const swapDate = requesterAssignment?.date || '';

            const recipients = [
                ...this.buildRecipient(requester),
                ...this.buildRecipient(target),
            ];

            // Also notify location admin(s)
            const locationId = requesterAssignment?.location_id;
            if (locationId) {
                const adminRecipients = await this.resolveLocationAdmins(swap.company_id, locationId);
                recipients.push(...adminRecipients);
            }

            if (!recipients.length) {
                this.logger.warn(`No recipients for SHIFT_SWAP_REJECTED (swap: ${swap._id})`);
                return;
            }

            await this.notificationService.sendEventNotification({
                eventKey: 'SHIFT_SWAP_REJECTED',
                companyId: swap.company_id,
                locationId: locationId || null,
                recipients,
                variables: {
                    requester_name: requester?.name || requester?.first_name || 'Employee',
                    target_name: target?.name || target?.first_name || 'Employee',
                    swap_date: swapDate,
                    rejected_by: rejectedByName,
                    admin_notes: swap.admin_notes || '',
                },
            });
        } catch (error) {
            this.logger.error(`Failed to send SHIFT_SWAP_REJECTED notification: ${error.message}`);
        }
    }

    // ─── HELPER METHODS ───

    private buildRecipient(user: any): Array<{ email: string; phone?: string; name: string }> {
        if (!user?.email) return [];
        return [{
            email: user.email,
            phone: user.mobile ? this.formatPhone(user) : undefined,
            name: user.name || user.first_name || 'Employee',
        }];
    }

    private async resolveLocationAdmins(companyId: string, locationId: string): Promise<Array<{ email: string; phone?: string; name: string }>> {
        try {
            const locationAdminRole = await this.roleService.findOne({ name: ENUM_SYSTEM_ROLE.LOCATION_ADMIN });
            if (!locationAdminRole?._id) return [];

            const admins = await this.userRepository.findAll({
                companyId,
                location_id: locationId,
                role: locationAdminRole._id,
            });

            return (admins as any[])
                .filter(a => a.email)
                .map(a => ({
                    email: a.email,
                    phone: a.mobile ? this.formatPhone(a) : undefined,
                    name: a.name || a.first_name || 'Admin',
                }));
        } catch (error) {
            this.logger.error(`Failed to resolve location admins: ${error.message}`);
            return [];
        }
    }

    private async resolveUser(userId: string): Promise<any> {
        try {
            return await this.userService.findOneById(userId, { join: true });
        } catch {
            return null;
        }
    }

    private async resolveLocation(locationId: string): Promise<any> {
        try {
            return await this.locationService.findOneById(locationId);
        } catch {
            return null;
        }
    }

    private async resolveShiftTemplate(templateId: string): Promise<any> {
        try {
            return await this.shiftTemplateService.findOneById(templateId);
        } catch {
            return null;
        }
    }

    private async resolveAssignment(assignmentId: string): Promise<ShiftAssignmentEntity | null> {
        try {
            return await this.shiftAssignmentService.findOneById(assignmentId);
        } catch {
            return null;
        }
    }

    private formatPhone(user: any): string {
        const countryCode = user.country_code?.dialCode || '';
        const mobile = user.mobile || '';
        if (countryCode && !mobile.startsWith('+')) {
            return `${countryCode}${mobile}`;
        }
        return mobile;
    }
}
