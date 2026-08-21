import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';
import { RoleRepository } from '@modules/role/repository/repositories/role.repository';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { ENUM_USER_STATUS } from '@modules/user/enums/user.enum';

// Roles that are NOT internal staff — customers, vendors, leads-as-users, sales
// agents and the platform owner. The person-picker only lists staff, so these
// are excluded from the roster.
const NON_STAFF_ROLE_NAMES: string[] = [
    ENUM_SYSTEM_ROLE.CUSTOMER,
    ENUM_SYSTEM_ROLE.VENDOR,
    ENUM_SYSTEM_ROLE.AGENT,
    ENUM_SYSTEM_ROLE.SUPER_ADMIN,
];

// 'all' = everyone in scope · 'me' = self · <uuid> = a specific user id
export type CreatorSelection = 'all' | 'me' | string;

export interface CreatorScopeJwt {
    user: string; // logged-in user id (== created_by on documents)
    roleName: string; // ENUM_SYSTEM_ROLE value
    companyId: string;
    assignedLocations?: string[];
    locationId?: string;
}

/**
 * The single source of truth for "whose records may this caller see".
 *
 * The UI dropdown is only convenience — this service is the real gate:
 *   • Company Admin  → any creator (or all)
 *   • Location Admin → only users in HIS locations (location_id ∪ accessible_locations)
 *   • everyone else  → forced to self, requested selection ignored
 */
@Injectable()
export class CreatorScopeService {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly roleRepository: RoleRepository
    ) {}

    /**
     * Resolve the effective creator scope to a normalized value:
     *   undefined  → no filter (see everything in scope)
     *   string     → exactly one creator
     *   string[]   → a set of creators (Location Admin "All")
     */
    async resolveCreatorValue(
        jwt: CreatorScopeJwt,
        requested?: CreatorSelection
    ): Promise<undefined | string | string[]> {
        // Client-wide kill switch: CREATOR_SCOPE_ENABLED=false lets every role
        // see all company records regardless of who created them, ignoring the
        // requested selection entirely. Does NOT affect module-level RBAC
        // (can_read/can_update/etc) — those guards run independently, upstream
        // of this service. Defaults to enabled if unset.
        if (process.env.CREATOR_SCOPE_ENABLED === 'false') return undefined;

        const role = jwt?.roleName;

        // Platform owner — unrestricted.
        if (role === ENUM_SYSTEM_ROLE.SUPER_ADMIN) return undefined;

        if (role === ENUM_SYSTEM_ROLE.COMPANY_ADMIN) {
            if (!requested || requested === 'all') return undefined;
            if (requested === 'me') return jwt.user;
            await this.assertUserInCompany(requested, jwt.companyId);
            return requested;
        }

        if (role === ENUM_SYSTEM_ROLE.LOCATION_ADMIN) {
            if (requested === 'me') return jwt.user;
            const allowed = await this.userIdsInLaLocations(jwt);
            if (!requested || requested === 'all') return [...allowed];
            if (!allowed.has(requested)) {
                throw new ForbiddenException('creator.outOfScope');
            }
            return requested;
        }

        // Employee / Agent / Vendor / Customer / anyone else — forced to self.
        return jwt.user;
    }

    /**
     * Turn a resolved creator value into a fragment to spread into a list
     * "find" object. Empty object = no filter.
     */
    static toFind(
        value: undefined | string | string[]
    ): Record<string, any> {
        if (value === undefined) return {};
        if (Array.isArray(value)) return { created_by: { $in: value } };
        return { created_by: value };
    }

    /**
     * Apply a resolved creator value to a TypeORM QueryBuilder (used by the
     * `/stats` aggregate queries so the tiles match the filtered list).
     */
    static applyToQb(
        qb: { andWhere: (sql: string, params?: any) => any },
        value: undefined | string | string[],
        alias = 'entity'
    ): void {
        if (value === undefined) return;
        if (Array.isArray(value)) {
            if (value.length === 0) {
                qb.andWhere('1 = 0'); // empty set → match nothing
            } else {
                qb.andWhere(`${alias}.created_by IN (:...__cb)`, {
                    __cb: value,
                });
            }
        } else {
            qb.andWhere(`${alias}.created_by = :__cb`, { __cb: value });
        }
    }

    /** The people the person-picker may offer to this caller. */
    async rosterFor(
        jwt: CreatorScopeJwt
    ): Promise<Array<{ _id: string; name: string }>> {
        const role = jwt?.roleName;

        const find: Record<string, any> = {
            companyId: jwt.companyId,
            status: ENUM_USER_STATUS.ACTIVE,
        };

        if (
            role === ENUM_SYSTEM_ROLE.COMPANY_ADMIN ||
            role === ENUM_SYSTEM_ROLE.SUPER_ADMIN
        ) {
            // all active company staff (role filter applied below)
        } else if (role === ENUM_SYSTEM_ROLE.LOCATION_ADMIN) {
            const allowed = await this.userIdsInLaLocations(jwt);
            find._id = { $in: [...allowed] };
        } else {
            // no dropdown for anyone else
            return [];
        }

        // Keep only internal staff — drop customers, vendors, lead-users, etc.
        const nonStaffRoleIds = await this.nonStaffRoleIds();
        if (nonStaffRoleIds.length) {
            find.role = { $nin: nonStaffRoleIds };
        }

        const users = await this.userRepository.findAll<any>(find, {
            select: {
                _id: true,
                name: true,
                first_name: true,
                last_name: true,
                email: true,
            },
        });

        return users
            // The caller is offered via the dedicated "You" option, so never
            // list them again here.
            .filter((u) => this.idStr(u._id) !== jwt.user)
            .map((u) => ({
                _id: this.idStr(u._id),
                name: this.displayName(u),
            }));
    }

    // ── internals ────────────────────────────────────────────────────────

    /** Role ids to exclude from the roster (customer/vendor/agent/super-admin). */
    private async nonStaffRoleIds(): Promise<string[]> {
        const roles = await this.roleRepository.findAll<any>({
            name: { $in: NON_STAFF_ROLE_NAMES },
        });
        return roles.map((r) => this.idStr(r._id));
    }

    /** LA territory → user ids whose primary location falls in it (incl. the LA). */
    private async userIdsInLaLocations(
        jwt: CreatorScopeJwt
    ): Promise<Set<string>> {
        const locationSet = await this.resolveLaLocationSet(jwt);
        const ids = new Set<string>();
        ids.add(jwt.user); // an LA always sees their own records

        if (locationSet.length) {
            const users = await this.userRepository.findAll<any>(
                {
                    companyId: jwt.companyId,
                    location_id: { $in: locationSet },
                },
                { select: { _id: true } }
            );
            for (const u of users) ids.add(this.idStr(u._id));
        }
        return ids;
    }

    /** location_id ∪ accessible_locations — token first, DB as authoritative fallback. */
    private async resolveLaLocationSet(
        jwt: CreatorScopeJwt
    ): Promise<string[]> {
        const set = new Set<string>();
        if (jwt.locationId) set.add(jwt.locationId);
        for (const l of jwt.assignedLocations ?? []) if (l) set.add(this.idStr(l));

        // The token may omit accessible_locations — read the LA's own record.
        const me = await this.userRepository
            .findOneById<any>(jwt.user)
            .catch(() => null);
        if (me) {
            if (me.location_id) set.add(this.idStr(me.location_id));
            for (const l of me.accessible_locations ?? []) {
                if (l) set.add(this.idStr(l));
            }
        }
        return [...set];
    }

    private async assertUserInCompany(
        userId: string,
        companyId: string
    ): Promise<void> {
        const user = await this.userRepository
            .findOneById<any>(userId)
            .catch(() => null);
        if (!user || (user.companyId && user.companyId !== companyId)) {
            throw new NotFoundException('creator.userNotFound');
        }
    }

    private displayName(u: any): string {
        return (
            u?.name ||
            [u?.first_name, u?.last_name].filter(Boolean).join(' ') ||
            u?.email ||
            'Unknown'
        );
    }

    private idStr(v: any): string {
        return v?.toString?.() ?? String(v);
    }
}
