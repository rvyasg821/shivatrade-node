import { Injectable, Logger } from '@nestjs/common';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';
import { RoleRepository } from '@modules/role/repository/repositories/role.repository';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { ENUM_USER_STATUS } from '@modules/user/enums/user.enum';
import { ENUM_MESSAGE_LOG_RECIPIENT_TYPE } from '@modules/message-log/enums/message-log.enum';

export interface IResolvedRecipient {
    user_id?: string;
    name: string;
    email?: string;
    phone?: string;
    recipient_type: ENUM_MESSAGE_LOG_RECIPIENT_TYPE;
}

/**
 * Builds the recipient list for an event based on the recipient-type matrix
 * stored in notification_preferences (Phase 2). The base employee/explicit
 * recipients passed by the caller are merged with location admins / company
 * admins fetched here when the corresponding flags are on.
 */
@Injectable()
export class NotificationRecipientResolverService {
    private readonly logger = new Logger(NotificationRecipientResolverService.name);

    // Cache role IDs by name to avoid repeated lookups
    private roleIdCache: Map<string, string> = new Map();

    constructor(
        private readonly userRepository: UserRepository,
        private readonly roleRepository: RoleRepository,
    ) {}

    private async getRoleIdByName(roleName: string): Promise<string | null> {
        if (this.roleIdCache.has(roleName)) {
            return this.roleIdCache.get(roleName) || null;
        }
        try {
            const role = await this.roleRepository.isExistByName(roleName);
            if (role) {
                this.roleIdCache.set(roleName, role._id);
                return role._id;
            }
        } catch (error) {
            this.logger.error(`Failed to resolve role "${roleName}": ${error.message}`);
        }
        return null;
    }

    /**
     * Build the unique recipient list for an event.
     *
     * @param baseRecipients explicit recipients passed by the caller (typically the
     *   subject employee — leave applicant, contract owner, etc.)
     * @param prefs the resolved preference matrix from notification_preferences
     * @param scope companyId + optional locationId
     */
    async resolveRecipients(
        baseRecipients: Array<{ email?: string; phone?: string; name: string; user_id?: string }>,
        prefs: { notify_employee: boolean; notify_location_admin: boolean; notify_company_admin: boolean },
        scope: { companyId: string; locationId?: string },
    ): Promise<IResolvedRecipient[]> {
        const out: IResolvedRecipient[] = [];
        const seen = new Set<string>();

        const push = (r: IResolvedRecipient) => {
            // Dedupe by user_id if present, else by email or phone
            const key = r.user_id || r.email || r.phone;
            if (!key || seen.has(key)) return;
            seen.add(key);
            out.push(r);
        };

        // 1) Employee/base recipients
        if (prefs.notify_employee) {
            for (const r of baseRecipients || []) {
                push({
                    user_id: r.user_id,
                    name: r.name,
                    email: r.email,
                    phone: r.phone,
                    recipient_type: ENUM_MESSAGE_LOG_RECIPIENT_TYPE.EMPLOYEE,
                });
            }
        }

        // 2) Location admins for the location in scope
        if (prefs.notify_location_admin && scope.locationId) {
            try {
                const locAdminRoleId = await this.getRoleIdByName(ENUM_SYSTEM_ROLE.LOCATION_ADMIN);
                if (locAdminRoleId) {
                    const admins = await this.userRepository.findAll<any>({
                        companyId: scope.companyId,
                        location_id: scope.locationId,
                        role: locAdminRoleId,
                        status: ENUM_USER_STATUS.ACTIVE,
                        deleted: false,
                    });
                    for (const a of admins) {
                        push({
                            user_id: a._id,
                            name: a.name || `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Location Admin',
                            email: a.email,
                            phone: a.mobile || undefined,
                            recipient_type: ENUM_MESSAGE_LOG_RECIPIENT_TYPE.LOCATION_ADMIN,
                        });
                    }
                }
            } catch (error) {
                this.logger.error(`Failed to fetch location admins: ${error.message}`);
            }
        }

        // 3) Company admins for the company in scope
        if (prefs.notify_company_admin) {
            try {
                const companyAdminRoleId = await this.getRoleIdByName(ENUM_SYSTEM_ROLE.COMPANY_ADMIN);
                if (companyAdminRoleId) {
                    const admins = await this.userRepository.findAll<any>({
                        companyId: scope.companyId,
                        role: companyAdminRoleId,
                        status: ENUM_USER_STATUS.ACTIVE,
                        deleted: false,
                    });
                    for (const a of admins) {
                        push({
                            user_id: a._id,
                            name: a.name || `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Company Admin',
                            email: a.email,
                            phone: a.mobile || undefined,
                            recipient_type: ENUM_MESSAGE_LOG_RECIPIENT_TYPE.COMPANY_ADMIN,
                        });
                    }
                }
            } catch (error) {
                this.logger.error(`Failed to fetch company admins: ${error.message}`);
            }
        }

        return out;
    }
}
