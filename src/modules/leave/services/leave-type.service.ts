import { Injectable, NotFoundException } from '@nestjs/common';
import { LeaveTypeRepository } from '../repository/repositories/leave-type.repository';
import { LeaveTypeEntity } from '../repository/entities/leave-type.entity';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class LeaveTypeService {
    constructor(private readonly leaveTypeRepository: LeaveTypeRepository) {}

    async create(companyId: string, data: Partial<LeaveTypeEntity>): Promise<LeaveTypeEntity> {
        return this.leaveTypeRepository.create({
            ...data,
            company_id: companyId,
            soft_delete: false,
        });
    }

    async findAll(companyId: string): Promise<LeaveTypeEntity[]> {
        return this.leaveTypeRepository.findAll(
            {
                $or: [{ company_id: companyId }, { is_system: true }],
                soft_delete: false,
                is_active: true,
            },
            { order: { name: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC } }
        ) as Promise<LeaveTypeEntity[]>;
    }

    async findByCompany(companyId: string, includeSystem = true): Promise<LeaveTypeEntity[]> {
        const find: any = { soft_delete: false };
        if (includeSystem) {
            find.$or = [{ company_id: companyId }, { is_system: true }];
        } else {
            find.company_id = companyId;
        }
        return this.leaveTypeRepository.findAll(find, {
            order: { name: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC },
        }) as Promise<LeaveTypeEntity[]>;
    }

    async findOneById(id: string): Promise<LeaveTypeEntity> {
        const item = await this.leaveTypeRepository.findOne({ _id: id, soft_delete: false });
        if (!item) throw new NotFoundException('Leave type not found');
        return item as LeaveTypeEntity;
    }

    async update(id: string, data: Partial<LeaveTypeEntity>): Promise<LeaveTypeEntity> {
        const item = await this.findOneById(id);
        return this.leaveTypeRepository.update(item, data) as Promise<LeaveTypeEntity>;
    }

    async softDelete(id: string): Promise<void> {
        const item = await this.findOneById(id);
        await this.leaveTypeRepository.update(item, { soft_delete: true });
    }

    mapGet(lt: LeaveTypeEntity) {
        return {
            _id: lt._id,
            company_id: lt.company_id,
            name: lt.name,
            slug: lt.slug,
            color: lt.color,
            is_paid: lt.is_paid,
            requires_approval: lt.requires_approval,
            max_days_per_year: lt.max_days_per_year,
            is_system: lt.is_system,
            carry_over_allowed: lt.carry_over_allowed,
            max_carry_over_days: lt.max_carry_over_days,
            accrual_method: lt.accrual_method,
            notice_days: lt.notice_days,
            min_block_days: lt.min_block_days,
            max_consecutive: lt.max_consecutive,
            documentation_required: lt.documentation_required,
            documentation_after_days: lt.documentation_after_days,
            is_active: lt.is_active,
            createdAt: lt.createdAt,
        };
    }
}
