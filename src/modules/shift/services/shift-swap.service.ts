import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { In } from 'typeorm';
import { ShiftSwapRequestRepository } from '../repository/repositories/shift-swap-request.repository';
import { ShiftSwapRequestEntity } from '../repository/entities/shift-swap-request.entity';
import { ShiftAssignmentService } from './shift-assignment.service';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';
import { RoleService } from '@modules/role/services/role.service';
import { ENUM_SHIFT_SWAP_STATUS, ENUM_SHIFT_ASSIGNMENT_STATUS } from '../enums/shift.enum';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class ShiftSwapService {
    constructor(
        private readonly swapRepository: ShiftSwapRequestRepository,
        private readonly assignmentService: ShiftAssignmentService,
        private readonly userRepository: UserRepository,
        private readonly roleService: RoleService,
    ) {}

    async findAll(companyId: string, filters: any = {}): Promise<ShiftSwapRequestEntity[]> {
        return this.swapRepository.findAll(
            { company_id: companyId, soft_delete: false, ...filters },
            { order: { createdAt: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC } }
        ) as Promise<ShiftSwapRequestEntity[]>;
    }

    async findByUser(userId: string): Promise<ShiftSwapRequestEntity[]> {
        return this.swapRepository.findAll(
            {
                soft_delete: false,
                $or: [{ requester_id: userId }, { target_id: userId }],
            },
            { order: { createdAt: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC } }
        ) as Promise<ShiftSwapRequestEntity[]>;
    }

    async findOneById(id: string): Promise<ShiftSwapRequestEntity> {
        const item = await this.swapRepository.findOne({ _id: id, soft_delete: false });
        if (!item) throw new NotFoundException('Swap request not found');
        return item as ShiftSwapRequestEntity;
    }

    async requestSwap(companyId: string, requesterId: string, data: {
        requester_assignment_id: string;
        target_id?: string;
        target_assignment_id?: string;
        reason?: string;
    }): Promise<ShiftSwapRequestEntity> {
        // Verify requester owns the assignment
        const reqAssign = await this.assignmentService.findOneById(data.requester_assignment_id);
        if (reqAssign.user_id !== requesterId) {
            throw new BadRequestException('You can only swap your own shifts');
        }

        return this.swapRepository.create({
            company_id: companyId,
            requester_id: requesterId,
            target_id: data.target_id || null,
            requester_assignment_id: data.requester_assignment_id,
            target_assignment_id: data.target_assignment_id || null,
            status: ENUM_SHIFT_SWAP_STATUS.PENDING,
            reason: data.reason || null,
            soft_delete: false,
        });
    }

    /** Target employee accepts the swap (peer response) */
    async respondSwap(id: string, targetId: string, accept: boolean): Promise<ShiftSwapRequestEntity> {
        const swap = await this.findOneById(id);
        if (swap.target_id && swap.target_id !== targetId) {
            throw new BadRequestException('You are not the target for this swap request');
        }
        if (swap.status !== ENUM_SHIFT_SWAP_STATUS.PENDING) {
            throw new BadRequestException('Swap is no longer pending');
        }
        const newStatus = accept ? ENUM_SHIFT_SWAP_STATUS.ACCEPTED : ENUM_SHIFT_SWAP_STATUS.REJECTED;
        return this.swapRepository.update(swap, { status: newStatus }) as Promise<ShiftSwapRequestEntity>;
    }

    /** Admin approves or rejects the swap (after peer accepted) */
    async adminDecide(id: string, adminId: string, approve: boolean, notes?: string): Promise<ShiftSwapRequestEntity> {
        const swap = await this.findOneById(id);
        if (swap.status !== ENUM_SHIFT_SWAP_STATUS.ACCEPTED) {
            throw new BadRequestException('Swap must be accepted by target before admin decision');
        }

        const newStatus = approve ? ENUM_SHIFT_SWAP_STATUS.ADMIN_APPROVED : ENUM_SHIFT_SWAP_STATUS.ADMIN_REJECTED;
        const updated = await this.swapRepository.update(swap, {
            status: newStatus,
            admin_approved_by: adminId,
            admin_approved_at: new Date(),
            admin_notes: notes || null,
        }) as ShiftSwapRequestEntity;

        // If approved, actually swap the assignments
        if (approve && swap.target_assignment_id) {
            const reqAssign = await this.assignmentService.findOneById(swap.requester_assignment_id);
            const tgtAssign = await this.assignmentService.findOneById(swap.target_assignment_id);

            const reqUserId = reqAssign.user_id;
            const tgtUserId = tgtAssign.user_id;

            await this.assignmentService.update(swap.requester_assignment_id, {
                user_id: tgtUserId,
                status: ENUM_SHIFT_ASSIGNMENT_STATUS.SWAPPED,
            });
            await this.assignmentService.update(swap.target_assignment_id, {
                user_id: reqUserId,
                status: ENUM_SHIFT_ASSIGNMENT_STATUS.SWAPPED,
            });
        }

        return updated;
    }

    async cancel(id: string, userId: string): Promise<ShiftSwapRequestEntity> {
        const swap = await this.findOneById(id);
        if (swap.requester_id !== userId) throw new BadRequestException('Only the requester can cancel');
        if (![ENUM_SHIFT_SWAP_STATUS.PENDING, ENUM_SHIFT_SWAP_STATUS.ACCEPTED].includes(swap.status as any)) {
            throw new BadRequestException('Cannot cancel a swap that has been decided');
        }
        return this.swapRepository.update(swap, { status: ENUM_SHIFT_SWAP_STATUS.REJECTED }) as Promise<ShiftSwapRequestEntity>;
    }

    async findAllForAdmin(companyId: string, filters: any = {}, locationId?: string): Promise<ShiftSwapRequestEntity[]> {
        if (locationId) {
            // Fetch users at this location, then filter swaps to only those users
            const locationUsers = await this.userRepository.findAll(
                { companyId, location_id: locationId }
            );
            const userIds = locationUsers.map(u => (u as any)._id);
            if (!userIds.length) return [];
            filters.requester_id = In(userIds);
        }
        return this.findAll(companyId, filters);
    }

    async enrichWithUserDetails(swaps: any[]): Promise<any[]> {
        if (!swaps.length) return swaps;

        // Collect unique user IDs from requester_id and target_id
        const userIdSet = new Set<string>();
        // Collect unique assignment IDs
        const assignIdSet = new Set<string>();
        for (const s of swaps) {
            if (s.requester_id) userIdSet.add(s.requester_id);
            if (s.target_id) userIdSet.add(s.target_id);
            if (s.requester_assignment_id) assignIdSet.add(s.requester_assignment_id);
            if (s.target_assignment_id) assignIdSet.add(s.target_assignment_id);
        }

        // Batch fetch users
        const userIds = [...userIdSet];
        const userMap = new Map<string, { name: string; email: string }>();
        if (userIds.length) {
            const users = await this.userRepository.findAll({ _id: In(userIds) });
            for (const u of users) {
                const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.name || '';
                userMap.set((u as any)._id, { name, email: u.email || '' });
            }
        }

        // Batch fetch assignments for date/time info (use mapGetResolved to fall back to template times)
        const assignIds = [...assignIdSet];
        const assignMap = new Map<string, { date: string; start_time: string; end_time: string }>();
        if (assignIds.length) {
            const rawAssignments = await Promise.all(
                assignIds.map(id => this.assignmentService.findOneById(id).catch(() => null))
            );
            const resolved = await Promise.all(
                rawAssignments.map(a => a ? this.assignmentService.mapGetResolved(a) : null)
            );
            for (const a of resolved) {
                if (a) {
                    assignMap.set(a._id, {
                        date: a.date,
                        start_time: a.start_time,
                        end_time: a.end_time,
                    });
                }
            }
        }

        // For swaps without target_assignment_id, look up target's shift on the same date
        for (const s of swaps) {
            if (!s.target_assignment_id && s.target_id) {
                const reqAssign = assignMap.get(s.requester_assignment_id);
                if (reqAssign?.date) {
                    const tgtShift = await this.assignmentService.findByUserAndDate(s.target_id, reqAssign.date).catch(() => null);
                    if (tgtShift) {
                        const resolved = await this.assignmentService.mapGetResolved(tgtShift);
                        assignMap.set(`target_${s._id}`, {
                            date: resolved.date,
                            start_time: resolved.start_time,
                            end_time: resolved.end_time,
                        });
                    }
                }
            }
        }

        // Attach user + assignment details to each swap
        return swaps.map(s => {
            const reqAssign = assignMap.get(s.requester_assignment_id);
            const tgtAssign = s.target_assignment_id
                ? assignMap.get(s.target_assignment_id)
                : assignMap.get(`target_${s._id}`);
            return {
                ...s,
                requester_name: userMap.get(s.requester_id)?.name || null,
                requester_email: userMap.get(s.requester_id)?.email || null,
                target_name: s.target_id ? (userMap.get(s.target_id)?.name || null) : null,
                target_email: s.target_id ? (userMap.get(s.target_id)?.email || null) : null,
                requester_shift_date: reqAssign?.date || null,
                requester_shift_start: reqAssign?.start_time || null,
                requester_shift_end: reqAssign?.end_time || null,
                target_shift_date: tgtAssign?.date || null,
                target_shift_start: tgtAssign?.start_time || null,
                target_shift_end: tgtAssign?.end_time || null,
            };
        });
    }

    /**
     * Get colleague employees in the same company (excluding the requesting user).
     * Returns minimal data: _id, first_name, last_name, employee_code.
     */
    async getColleagues(companyId: string, excludeUserId: string): Promise<any[]> {
        const find: any = { companyId };
        const employeeRole = await this.roleService.findOne({ name: ENUM_SYSTEM_ROLE.EMPLOYEE });
        if (employeeRole?._id) find.role = employeeRole._id;

        const users = await this.userRepository.findAll(find, { paging: { limit: 500, offset: 0 } });

        return (users as any[])
            .filter(u => u._id !== excludeUserId)
            .map(u => ({
                _id: u._id,
                first_name: u.first_name || u.firstName || '',
                last_name: u.last_name || u.lastName || '',
                employee_code: u.employee_code || u.employeeCode || '',
            }));
    }

    mapGet(s: ShiftSwapRequestEntity) {
        return {
            _id: s._id,
            company_id: s.company_id,
            requester_id: s.requester_id,
            target_id: s.target_id,
            requester_assignment_id: s.requester_assignment_id,
            target_assignment_id: s.target_assignment_id,
            status: s.status,
            reason: s.reason,
            admin_approved_by: s.admin_approved_by,
            admin_approved_at: s.admin_approved_at,
            admin_notes: s.admin_notes,
            createdAt: s.createdAt,
        };
    }
}
