import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from '@modules/notification/services/notification.service';
import { UserService } from '@modules/user/services/user.service';
import { RoleService } from '@modules/role/services/role.service';
import { LocationService } from '@modules/location/services/location.service';
import { LeaveTypeService } from './leave-type.service';
import { LeaveRequestEntity } from '../repository/entities/leave-request.entity';

@Injectable()
export class LeaveNotificationService {
    private readonly logger = new Logger(LeaveNotificationService.name);

    constructor(
        private readonly notificationService: NotificationService,
        private readonly userService: UserService,
        private readonly roleService: RoleService,
        private readonly locationService: LocationService,
        private readonly leaveTypeService: LeaveTypeService,
    ) {}

    /**
     * Notify admin(s) when an employee submits a leave request.
     * Recipients: location notification_email, optionally CC company admin.
     */
    async notifyLeaveRequested(request: LeaveRequestEntity): Promise<void> {
        try {
            const [employee, leaveType, location] = await Promise.all([
                this.resolveUser(request.user_id),
                this.resolveLeaveType(request.leave_type_id),
                request.location_id ? this.resolveLocation(request.location_id) : null,
            ]);

            const recipients = await this.resolveAdminRecipients(
                request.company_id,
                request.location_id,
                location,
            );

            if (recipients.length === 0) {
                this.logger.warn(`No admin recipients found for LEAVE_REQUESTED (company: ${request.company_id})`);
                return;
            }

            await this.notificationService.sendEventNotification({
                eventKey: 'LEAVE_REQUESTED',
                companyId: request.company_id,
                locationId: request.location_id,
                recipients,
                variables: {
                    employee_name: employee?.name || employee?.first_name || 'Employee',
                    leave_type: leaveType?.name || 'Leave',
                    start_date: request.start_date,
                    end_date: request.end_date,
                    total_days: request.total_days,
                    reason: request.reason || '',
                    location_name: location?.location_name || '',
                },
            });
        } catch (error) {
            this.logger.error(`Failed to send LEAVE_REQUESTED notification: ${error.message}`);
        }
    }

    /**
     * Notify employee when their leave request is approved.
     */
    async notifyLeaveApproved(request: LeaveRequestEntity, approvedByUserId: string): Promise<void> {
        try {
            const [employee, leaveType, approvedByUser] = await Promise.all([
                this.resolveUser(request.user_id),
                this.resolveLeaveType(request.leave_type_id),
                this.resolveUser(approvedByUserId),
            ]);

            if (!employee?.email) {
                this.logger.warn(`Employee email not found for LEAVE_APPROVED (user: ${request.user_id})`);
                return;
            }

            await this.notificationService.sendEventNotification({
                eventKey: 'LEAVE_APPROVED',
                companyId: request.company_id,
                locationId: request.location_id,
                recipients: [{
                    email: employee.email,
                    phone: employee.mobile ? this.formatPhone(employee) : undefined,
                    name: employee.name || employee.first_name || 'Employee',
                }],
                variables: {
                    employee_name: employee.name || employee.first_name || 'Employee',
                    leave_type: leaveType?.name || 'Leave',
                    start_date: request.start_date,
                    end_date: request.end_date,
                    total_days: request.total_days,
                    approved_by: approvedByUser?.name || approvedByUser?.first_name || 'Manager',
                },
            });
        } catch (error) {
            this.logger.error(`Failed to send LEAVE_APPROVED notification: ${error.message}`);
        }
    }

    /**
     * Notify employee when their leave request is rejected.
     */
    async notifyLeaveRejected(request: LeaveRequestEntity, rejectedByUserId: string): Promise<void> {
        try {
            const [employee, leaveType, rejectedByUser] = await Promise.all([
                this.resolveUser(request.user_id),
                this.resolveLeaveType(request.leave_type_id),
                this.resolveUser(rejectedByUserId),
            ]);

            if (!employee?.email) {
                this.logger.warn(`Employee email not found for LEAVE_REJECTED (user: ${request.user_id})`);
                return;
            }

            await this.notificationService.sendEventNotification({
                eventKey: 'LEAVE_REJECTED',
                companyId: request.company_id,
                locationId: request.location_id,
                recipients: [{
                    email: employee.email,
                    phone: employee.mobile ? this.formatPhone(employee) : undefined,
                    name: employee.name || employee.first_name || 'Employee',
                }],
                variables: {
                    employee_name: employee.name || employee.first_name || 'Employee',
                    leave_type: leaveType?.name || 'Leave',
                    start_date: request.start_date,
                    end_date: request.end_date,
                    total_days: request.total_days,
                    rejected_by: rejectedByUser?.name || rejectedByUser?.first_name || 'Manager',
                    rejection_reason: request.rejection_reason || '',
                },
            });
        } catch (error) {
            this.logger.error(`Failed to send LEAVE_REJECTED notification: ${error.message}`);
        }
    }

    /**
     * Notify admin when employee cancels their leave request.
     */
    async notifyLeaveCancelledByEmployee(request: LeaveRequestEntity, previousStatus: string): Promise<void> {
        try {
            const [employee, leaveType, location] = await Promise.all([
                this.resolveUser(request.user_id),
                this.resolveLeaveType(request.leave_type_id),
                request.location_id ? this.resolveLocation(request.location_id) : null,
            ]);

            const recipients = await this.resolveAdminRecipients(
                request.company_id,
                request.location_id,
                location,
            );

            if (recipients.length === 0) return;

            await this.notificationService.sendEventNotification({
                eventKey: 'LEAVE_CANCELLED_BY_EMPLOYEE',
                companyId: request.company_id,
                locationId: request.location_id,
                recipients,
                variables: {
                    employee_name: employee?.name || employee?.first_name || 'Employee',
                    leave_type: leaveType?.name || 'Leave',
                    start_date: request.start_date,
                    end_date: request.end_date,
                    total_days: request.total_days,
                    previous_status: previousStatus,
                },
            });
        } catch (error) {
            this.logger.error(`Failed to send LEAVE_CANCELLED_BY_EMPLOYEE notification: ${error.message}`);
        }
    }

    /**
     * Notify employee when admin cancels their approved leave.
     */
    async notifyLeaveCancelledByAdmin(request: LeaveRequestEntity, cancelledByUserId: string): Promise<void> {
        try {
            const [employee, leaveType, cancelledByUser] = await Promise.all([
                this.resolveUser(request.user_id),
                this.resolveLeaveType(request.leave_type_id),
                this.resolveUser(cancelledByUserId),
            ]);

            if (!employee?.email) return;

            await this.notificationService.sendEventNotification({
                eventKey: 'LEAVE_CANCELLED_BY_ADMIN',
                companyId: request.company_id,
                locationId: request.location_id,
                recipients: [{
                    email: employee.email,
                    phone: employee.mobile ? this.formatPhone(employee) : undefined,
                    name: employee.name || employee.first_name || 'Employee',
                }],
                variables: {
                    employee_name: employee.name || employee.first_name || 'Employee',
                    leave_type: leaveType?.name || 'Leave',
                    start_date: request.start_date,
                    end_date: request.end_date,
                    total_days: request.total_days,
                    cancelled_by: cancelledByUser?.name || cancelledByUser?.first_name || 'Admin',
                },
            });
        } catch (error) {
            this.logger.error(`Failed to send LEAVE_CANCELLED_BY_ADMIN notification: ${error.message}`);
        }
    }

    // ─── HELPER METHODS ───

    /**
     * Resolve admin notification recipients for a location.
     * Uses location.notification_email (falls back to location.email),
     * and optionally CCs company admin.
     */
    private async resolveAdminRecipients(
        companyId: string,
        locationId: string,
        location: any,
    ): Promise<Array<{ email?: string; phone?: string; name: string }>> {
        const recipients: Array<{ email?: string; phone?: string; name: string }> = [];

        if (location) {
            // Primary: location notification email, fallback to location contact email
            const adminEmail = location.notification_email || location.email;
            if (adminEmail) {
                recipients.push({
                    email: adminEmail,
                    name: location.contact_name || 'Location Admin',
                });
            }

            // CC: additional notification email
            if (location.notification_email_cc) {
                recipients.push({
                    email: location.notification_email_cc,
                    name: 'HR Team',
                });
            }

            // CC: company admin if enabled
            if (location.cc_company_admin) {
                const companyAdmin = await this.resolveCompanyAdmin(companyId);
                if (companyAdmin?.email) {
                    // Avoid duplicate if company admin email matches location email
                    const alreadyIncluded = recipients.some(r => r.email === companyAdmin.email);
                    if (!alreadyIncluded) {
                        recipients.push({
                            email: companyAdmin.email,
                            name: companyAdmin.name || companyAdmin.first_name || 'Company Admin',
                        });
                    }
                }
            }
        } else {
            // No location — send to company admin directly
            const companyAdmin = await this.resolveCompanyAdmin(companyId);
            if (companyAdmin?.email) {
                recipients.push({
                    email: companyAdmin.email,
                    name: companyAdmin.name || companyAdmin.first_name || 'Company Admin',
                });
            }
        }

        return recipients;
    }

    /**
     * Find the company admin user (role = 'Company Admin' for this company).
     */
    private async resolveCompanyAdmin(companyId: string): Promise<any> {
        try {
            // First find the 'Company Admin' role
            const role = await this.roleService.findOneByName('Company Admin');
            if (!role) return null;

            // Then find a user with that role in this company
            const users = await this.userService.findAll(
                { companyId, role: role._id, deleted: false },
                { paging: { limit: 1, offset: 0 } },
            );
            return users?.[0] || null;
        } catch (error) {
            this.logger.warn(`Failed to resolve company admin for ${companyId}: ${error.message}`);
            return null;
        }
    }

    private async resolveUser(userId: string): Promise<any> {
        try {
            return await this.userService.findOneById(userId, { join: true });
        } catch {
            return null;
        }
    }

    private async resolveLeaveType(leaveTypeId: string): Promise<any> {
        try {
            return await this.leaveTypeService.findOneById(leaveTypeId);
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

    private formatPhone(user: any): string {
        const countryCode = user.country_code?.dialCode || '';
        const mobile = user.mobile || '';
        if (countryCode && !mobile.startsWith('+')) {
            return `${countryCode}${mobile}`;
        }
        return mobile;
    }
}
