import { Injectable, NotFoundException } from '@nestjs/common';
import { ImmigrationRecordRepository } from '../repository/repositories/immigration-record.repository';
import { ImmigrationRecordEntity } from '../repository/entities/immigration-record.entity';
import {
    ENUM_IMMIGRATION_STATUS,
    ENUM_IMMIGRATION_RECORD_STATUS,
} from '../enums/compliance.enum';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class ImmigrationService {
    constructor(private readonly repo: ImmigrationRecordRepository) {}

    async findAll(companyId: string, filters: any = {}): Promise<ImmigrationRecordEntity[]> {
        return this.repo.findAll(
            { company_id: companyId, soft_delete: false, ...filters },
            { order: { createdAt: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC } }
        ) as Promise<ImmigrationRecordEntity[]>;
    }

    async findByUser(userId: string): Promise<ImmigrationRecordEntity[]> {
        return this.repo.findAll(
            { user_id: userId, soft_delete: false },
            { order: { createdAt: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC } }
        ) as Promise<ImmigrationRecordEntity[]>;
    }

    async findOneById(id: string): Promise<ImmigrationRecordEntity> {
        const item = await this.repo.findOne({ _id: id, soft_delete: false });
        if (!item) throw new NotFoundException('Immigration record not found');
        return item as ImmigrationRecordEntity;
    }

    async findLatestByUser(userId: string): Promise<ImmigrationRecordEntity | null> {
        const items = await this.findByUser(userId);
        return items[0] ?? null;
    }

    async create(companyId: string, userId: string, data: Partial<ImmigrationRecordEntity>): Promise<ImmigrationRecordEntity> {
        return this.repo.create({
            company_id: companyId,
            user_id: userId,
            immigration_status: ENUM_IMMIGRATION_STATUS.VISA_HOLDER,
            is_sponsored: false,
            status: ENUM_IMMIGRATION_RECORD_STATUS.ACTIVE,
            soft_delete: false,
            ...data,
        });
    }

    async update(id: string, data: Partial<ImmigrationRecordEntity>): Promise<ImmigrationRecordEntity> {
        const item = await this.findOneById(id);
        return this.repo.update({ _id: (item as any)._id }, data) as Promise<ImmigrationRecordEntity>;
    }

    async softDelete(id: string): Promise<void> {
        const item = await this.findOneById(id);
        await this.repo.update({ _id: (item as any)._id }, { soft_delete: true } as any);
    }

    /** Returns records with visa expiring within `days` days */
    async findExpiringVisas(companyId: string, days: number, filters: any = {}): Promise<ImmigrationRecordEntity[]> {
        const today = new Date();
        const future = new Date();
        future.setDate(today.getDate() + days);
        const todayStr = today.toISOString().split('T')[0];
        const futureStr = future.toISOString().split('T')[0];

        return this.repo.findAll({
            company_id: companyId,
            soft_delete: false,
            visa_expiry_date: { $gte: todayStr, $lte: futureStr },
            ...filters,
        }, {
            order: { visa_expiry_date: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC },
        }) as Promise<ImmigrationRecordEntity[]>;
    }

    /** Update status based on visa expiry proximity */
    async refreshStatus(id: string): Promise<ImmigrationRecordEntity> {
        const item = await this.findOneById(id);
        if (!item.visa_expiry_date) return item;

        const today = new Date();
        const expiry = new Date(item.visa_expiry_date);
        const daysLeft = Math.floor((expiry.getTime() - today.getTime()) / 86400000);

        let status = ENUM_IMMIGRATION_RECORD_STATUS.ACTIVE;
        if (daysLeft < 0) status = ENUM_IMMIGRATION_RECORD_STATUS.EXPIRED;
        else if (daysLeft <= 30) status = ENUM_IMMIGRATION_RECORD_STATUS.ACTION_REQUIRED;
        else if (daysLeft <= 90) status = ENUM_IMMIGRATION_RECORD_STATUS.EXPIRING;

        return this.repo.update(item, { status }) as Promise<ImmigrationRecordEntity>;
    }

    mapGet(r: ImmigrationRecordEntity) {
        return {
            _id: r._id,
            company_id: r.company_id,
            user_id: r.user_id,
            visa_type: r.visa_type,
            immigration_status: r.immigration_status,
            brp_number: r.brp_number,
            share_code: r.share_code,
            visa_start_date: r.visa_start_date,
            visa_expiry_date: r.visa_expiry_date,
            work_restriction: r.work_restriction,
            is_sponsored: r.is_sponsored,
            cos_number: r.cos_number,
            cos_start_date: r.cos_start_date,
            cos_expiry_date: r.cos_expiry_date,
            sponsor_license_number: r.sponsor_license_number,
            last_rtw_check_date: r.last_rtw_check_date,
            next_rtw_check_date: r.next_rtw_check_date,
            status: r.status,
            notes: r.notes,
            createdAt: r.createdAt,
        };
    }
}
