import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from '@modules/notification/services/notification.service';
import { UserService } from '@modules/user/services/user.service';
import { RoleService } from '@modules/role/services/role.service';
import { LocationService } from '@modules/location/services/location.service';
import { ContractTemplateService } from './contract-template.service';
import { EmployeeContractEntity } from '../repository/entities/employee-contract.entity';

@Injectable()
export class ContractNotificationService {
    private readonly logger = new Logger(ContractNotificationService.name);

    constructor(
        private readonly notificationService: NotificationService,
        private readonly userService: UserService,
        private readonly roleService: RoleService,
        private readonly locationService: LocationService,
        private readonly contractTemplateService: ContractTemplateService,
    ) {}

    /**
     * Notify employee when admin issues a contract to them.
     */
    async notifyContractIssued(contract: EmployeeContractEntity): Promise<void> {
        try {
            const [employee, template, issuedByUser] = await Promise.all([
                this.resolveUser(contract.user_id),
                this.resolveTemplateName(contract.contract_template_id),
                contract.issued_by ? this.resolveUser(contract.issued_by) : null,
            ]);

            if (!employee?.email) {
                this.logger.warn(`Employee email not found for CONTRACT_ISSUED (user: ${contract.user_id})`);
                return;
            }

            await this.notificationService.sendEventNotification({
                eventKey: 'CONTRACT_ISSUED',
                companyId: contract.company_id,
                locationId: contract.location_id,
                recipients: [{
                    email: employee.email,
                    phone: employee.mobile ? this.formatPhone(employee) : undefined,
                    name: employee.name || employee.first_name || 'Employee',
                }],
                variables: {
                    employee_name: employee.name || employee.first_name || 'Employee',
                    contract_name: template || 'Contract',
                    effective_date: contract.effective_date || '',
                    end_date: contract.end_date || '',
                    issued_by: issuedByUser?.name || issuedByUser?.first_name || 'Admin',
                },
            });
        } catch (error) {
            this.logger.error(`Failed to send CONTRACT_ISSUED notification: ${error.message}`);
        }
    }

    /**
     * Notify admin(s) when an employee signs their contract.
     */
    async notifyContractSigned(contract: EmployeeContractEntity): Promise<void> {
        try {
            const [employee, template, location] = await Promise.all([
                this.resolveUser(contract.user_id),
                this.resolveTemplateName(contract.contract_template_id),
                contract.location_id ? this.resolveLocation(contract.location_id) : null,
            ]);

            const recipients = await this.resolveAdminRecipients(
                contract.company_id,
                contract.location_id,
                location,
            );

            if (recipients.length === 0) {
                this.logger.warn(`No admin recipients found for CONTRACT_SIGNED (company: ${contract.company_id})`);
                return;
            }

            await this.notificationService.sendEventNotification({
                eventKey: 'CONTRACT_SIGNED',
                companyId: contract.company_id,
                locationId: contract.location_id,
                recipients,
                variables: {
                    employee_name: employee?.name || employee?.first_name || 'Employee',
                    contract_name: template || 'Contract',
                    signed_date: contract.signed_at ? new Date(contract.signed_at).toISOString().split('T')[0] : '',
                    location_name: location?.location_name || '',
                },
            });
        } catch (error) {
            this.logger.error(`Failed to send CONTRACT_SIGNED notification: ${error.message}`);
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

    private async resolveTemplateName(templateId: string): Promise<string | null> {
        try {
            const template = await this.contractTemplateService.findOneById(templateId);
            return template?.name || null;
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
