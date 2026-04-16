import { Injectable } from '@nestjs/common';
import { LeaveEntitlementRepository } from '../repository/repositories/leave-entitlement.repository';
import { LeaveEntitlementEntity } from '../repository/entities/leave-entitlement.entity';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class LeaveEntitlementService {
    constructor(private readonly entitlementRepository: LeaveEntitlementRepository) {}

    async getOrCreate(
        companyId: string,
        userId: string,
        leaveTypeId: string,
        year: number,
        defaultEntitlement = 0
    ): Promise<LeaveEntitlementEntity> {
        let ent = await this.entitlementRepository.findOne({
            user_id: userId,
            leave_type_id: leaveTypeId,
            year,
        });
        if (!ent) {
            ent = await this.entitlementRepository.create({
                company_id: companyId,
                user_id: userId,
                leave_type_id: leaveTypeId,
                year,
                total_entitlement: defaultEntitlement,
                carried_over: 0,
                additional: 0,
                used: 0,
                pending: 0,
                balance: defaultEntitlement,
            });
        }
        return ent as LeaveEntitlementEntity;
    }

    async findByUser(userId: string, year?: number): Promise<LeaveEntitlementEntity[]> {
        const find: any = { user_id: userId };
        if (year) find.year = year;
        return this.entitlementRepository.findAll(find, {
            order: { leave_type_id: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC },
        }) as Promise<LeaveEntitlementEntity[]>;
    }

    async findByCompany(companyId: string, year: number): Promise<LeaveEntitlementEntity[]> {
        return this.entitlementRepository.findAll(
            { company_id: companyId, year },
            { order: { user_id: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC } }
        ) as Promise<LeaveEntitlementEntity[]>;
    }

    async updateBalance(
        userId: string,
        leaveTypeId: string,
        year: number,
        delta: { used?: number; pending?: number }
    ): Promise<void> {
        const ent = await this.entitlementRepository.findOne({ user_id: userId, leave_type_id: leaveTypeId, year });
        if (!ent) return;
        const updates: Partial<LeaveEntitlementEntity> = {};
        if (delta.used !== undefined) updates.used = (ent as LeaveEntitlementEntity).used + delta.used;
        if (delta.pending !== undefined) updates.pending = (ent as LeaveEntitlementEntity).pending + delta.pending;

        const totalUsed = updates.used ?? (ent as LeaveEntitlementEntity).used;
        const totalPending = updates.pending ?? (ent as LeaveEntitlementEntity).pending;
        const total = (ent as LeaveEntitlementEntity).total_entitlement
            + (ent as LeaveEntitlementEntity).carried_over
            + (ent as LeaveEntitlementEntity).additional;
        updates.balance = total - totalUsed - totalPending;

        await this.entitlementRepository.update(ent as LeaveEntitlementEntity, updates);
    }

    async update(id: string, data: Partial<LeaveEntitlementEntity>): Promise<LeaveEntitlementEntity> {
        const item = await this.entitlementRepository.findOne({ _id: id });
        if (!item) throw new Error('Entitlement not found');
        return this.entitlementRepository.update(item as LeaveEntitlementEntity, data) as Promise<LeaveEntitlementEntity>;
    }

    mapGet(ent: LeaveEntitlementEntity) {
        return {
            _id: ent._id,
            company_id: ent.company_id,
            user_id: ent.user_id,
            leave_type_id: ent.leave_type_id,
            year: ent.year,
            total_entitlement: ent.total_entitlement,
            carried_over: ent.carried_over,
            additional: ent.additional,
            used: ent.used,
            pending: ent.pending,
            balance: ent.balance,
        };
    }
}
