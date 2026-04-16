import { Injectable, NotFoundException } from '@nestjs/common';
import { RtwCheckRepository } from '../repository/repositories/rtw-check.repository';
import { RtwCheckEntity } from '../repository/entities/rtw-check.entity';
import { ImmigrationRecordRepository } from '../repository/repositories/immigration-record.repository';
import { ENUM_RTW_CHECK_TYPE, ENUM_RTW_CHECK_RESULT } from '../enums/compliance.enum';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class RtwCheckService {
    constructor(
        private readonly rtwRepo: RtwCheckRepository,
        private readonly immigrationRepo: ImmigrationRecordRepository,
    ) {}

    async findAll(companyId: string, userId?: string, filters: any = {}): Promise<RtwCheckEntity[]> {
        const find: any = { company_id: companyId, soft_delete: false, ...filters };
        if (userId) find.user_id = userId;
        return this.rtwRepo.findAll(find, {
            order: { check_date: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC },
        }) as Promise<RtwCheckEntity[]>;
    }

    async findOneById(id: string): Promise<RtwCheckEntity> {
        const item = await this.rtwRepo.findOne({ _id: id, soft_delete: false });
        if (!item) throw new NotFoundException('RTW check not found');
        return item as RtwCheckEntity;
    }

    async findFollowUpsdue(companyId: string): Promise<RtwCheckEntity[]> {
        const today = new Date().toISOString().split('T')[0];
        return this.rtwRepo.findAll({
            company_id: companyId,
            soft_delete: false,
            follow_up_required: true,
            follow_up_date: { $lte: today },
        }, {
            order: { follow_up_date: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC },
        }) as Promise<RtwCheckEntity[]>;
    }

    async create(companyId: string, checkedBy: string, data: {
        user_id: string;
        immigration_record_id?: string;
        check_type?: string;
        check_date?: string;
        result?: string;
        valid_from?: string;
        valid_until?: string;
        document_ids?: string[];
        share_code_used?: string;
        employer_checking_reference?: string;
        follow_up_required?: boolean;
        follow_up_date?: string;
        notes?: string;
    }): Promise<RtwCheckEntity> {
        const check = await this.rtwRepo.create({
            company_id: companyId,
            user_id: data.user_id,
            immigration_record_id: data.immigration_record_id || null,
            checked_by: checkedBy,
            check_type: (data.check_type as any) || ENUM_RTW_CHECK_TYPE.MANUAL,
            check_date: data.check_date,
            result: (data.result as any) || ENUM_RTW_CHECK_RESULT.PENDING,
            valid_from: data.valid_from || null,
            valid_until: data.valid_until || null,
            document_ids: data.document_ids || [],
            share_code_used: data.share_code_used || null,
            employer_checking_reference: data.employer_checking_reference || null,
            follow_up_required: data.follow_up_required ?? false,
            follow_up_date: data.follow_up_date || null,
            notes: data.notes || null,
            soft_delete: false,
        });

        // Update immigration record's last_rtw_check_date
        if (data.immigration_record_id) {
            const immigRecord = await this.immigrationRepo.findOne({ _id: data.immigration_record_id });
            if (immigRecord) {
                await this.immigrationRepo.update(immigRecord, {
                    last_rtw_check_date: data.check_date,
                    next_rtw_check_date: data.valid_until || null,
                });
            }
        }

        return check;
    }

    async update(id: string, data: Partial<RtwCheckEntity>): Promise<RtwCheckEntity> {
        const item = await this.findOneById(id);
        return this.rtwRepo.update({ _id: (item as any)._id }, data) as Promise<RtwCheckEntity>;
    }

    async softDelete(id: string): Promise<void> {
        const item = await this.findOneById(id);
        await this.rtwRepo.update({ _id: (item as any)._id }, { soft_delete: true } as any);
    }

    mapGet(r: RtwCheckEntity) {
        return {
            _id: r._id,
            company_id: r.company_id,
            user_id: r.user_id,
            immigration_record_id: r.immigration_record_id,
            checked_by: r.checked_by,
            check_type: r.check_type,
            check_date: r.check_date,
            result: r.result,
            valid_from: r.valid_from,
            valid_until: r.valid_until,
            document_ids: r.document_ids,
            share_code_used: r.share_code_used,
            follow_up_required: r.follow_up_required,
            follow_up_date: r.follow_up_date,
            notes: r.notes,
            createdAt: r.createdAt,
        };
    }
}
