import { Injectable } from '@nestjs/common';
import { LeavePolicyRepository } from '../repository/repositories/leave-policy.repository';
import { LeavePolicyEntity } from '../repository/entities/leave-policy.entity';
import { ENUM_PROBATION_ENTITLEMENT_METHOD } from '../enums/leave.enum';

@Injectable()
export class LeavePolicyService {
    constructor(private readonly policyRepository: LeavePolicyRepository) {}

    async getOrCreate(companyId: string): Promise<LeavePolicyEntity> {
        let policy = await this.policyRepository.findOne({ company_id: companyId });
        if (!policy) {
            policy = await this.policyRepository.create({
                company_id: companyId,
                leave_year_start_month: 1,
                include_bank_holidays: true,
                bradford_factor_enabled: false,
                bradford_factor_threshold: 150,
                auto_approve_enabled: false,
                toil_enabled: false,
                default_annual_entitlement: 28,
                probation_entitlement_method: ENUM_PROBATION_ENTITLEMENT_METHOD.PRO_RATA,
            });
        }
        return policy as LeavePolicyEntity;
    }

    async update(companyId: string, data: Partial<LeavePolicyEntity>): Promise<LeavePolicyEntity> {
        const policy = await this.getOrCreate(companyId);
        return this.policyRepository.update(policy, data) as Promise<LeavePolicyEntity>;
    }

    mapGet(policy: LeavePolicyEntity) {
        return {
            _id: policy._id,
            company_id: policy.company_id,
            leave_year_start_month: policy.leave_year_start_month,
            include_bank_holidays: policy.include_bank_holidays,
            bradford_factor_enabled: policy.bradford_factor_enabled,
            bradford_factor_threshold: policy.bradford_factor_threshold,
            auto_approve_enabled: policy.auto_approve_enabled,
            toil_enabled: policy.toil_enabled,
            default_annual_entitlement: policy.default_annual_entitlement,
            probation_entitlement_method: policy.probation_entitlement_method,
        };
    }
}
