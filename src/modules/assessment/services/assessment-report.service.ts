import { Injectable } from '@nestjs/common';
import {
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseCreateOptions,
    IDatabaseSaveOptions,
    IDatabaseDeleteOptions,
    IDatabaseSoftDeleteOptions,
} from '@common/database/interfaces/database.interface';
import { AssessmentReportRepository } from '@modules/assessment/repository/repositories/assessment-report.repository';
import {
    AssessmentReportDoc,
    AssessmentReportEntity,
} from '@modules/assessment/repository/entities/assessment-report.entity';
import { IAssessmentReportService } from '@modules/assessment/interfaces/assessment-report.service.interface';

@Injectable()
export class AssessmentReportService implements IAssessmentReportService {
    constructor(
        private readonly assessmentReportRepository: AssessmentReportRepository,
    ) { }

    setTenantConnection(_connection: any) {
        // No-op: TypeORM uses a shared connection pool
    }

    async findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<AssessmentReportDoc[]> {
        return this.assessmentReportRepository.findAll<AssessmentReportDoc>(find, options);
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return this.assessmentReportRepository.getTotal(find, options);
    }

    async findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<AssessmentReportDoc> {
        return this.assessmentReportRepository.findOneById<AssessmentReportDoc>(_id, options);
    }

    async findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<AssessmentReportDoc> {
        return this.assessmentReportRepository.findOne<AssessmentReportDoc>(find, options);
    }

    async create(
        data: Partial<AssessmentReportEntity>,
        options?: IDatabaseCreateOptions
    ): Promise<AssessmentReportDoc> {
        const create: AssessmentReportEntity = new AssessmentReportEntity();
        create.assessment_id = data.assessment_id;
        create.assessment_data = data.assessment_data;
        create.group_data = data.group_data || [];
        create.name = data.name;
        create.first_name = data.first_name;
        create.last_name = data.last_name;
        create.company_name = data.company_name;
        create.email = data.email;
        create.mobile = data.mobile;
        create.email_code = data.email_code;
        create.mobile_code = data.mobile_code;
        create.business_type = data.business_type;
        create.team_size = data.team_size || 0;
        create.operation_description = data.operation_description;
        create.address1 = data.address1;
        create.address2 = data.address2;
        create.city = data.city;
        create.state = data.state;
        create.country = data.country;
        create.zipcode = data.zipcode;
        create.total = data.total || 0;
        create.pass = data.pass || 0;
        create.fail = data.fail || 0;
        create.invalid = data.invalid || 0;
        create.score = data.score || 0;
        create.pdf_path = data.pdf_path;
        create.email_verified = data.email_verified || false;
        create.mobile_verified = data.mobile_verified || false;
        create.status = data.status || 1;

        return this.assessmentReportRepository.create<AssessmentReportEntity>(create, options);
    }

    async update(
        repository: AssessmentReportDoc,
        data: Partial<AssessmentReportEntity>,
        options?: IDatabaseSaveOptions
    ): Promise<AssessmentReportDoc> {
        if (data.assessment_id !== undefined) repository.assessment_id = data.assessment_id;
        if (data.assessment_data !== undefined) repository.assessment_data = data.assessment_data;
        if (data.group_data !== undefined) repository.group_data = data.group_data;
        if (data.name !== undefined) repository.name = data.name;
        if (data.first_name !== undefined) repository.first_name = data.first_name;
        if (data.last_name !== undefined) repository.last_name = data.last_name;
        if (data.company_name !== undefined) repository.company_name = data.company_name;
        if (data.email !== undefined) {
            if (data.email !== repository.email) {
                repository.secondary_email = data.email;
                repository.secondary_email_code = data.email_code;
                data.email_verified = false;
            } else {
                repository.email = data.email;
            }
        }
        if (data.mobile !== undefined) repository.mobile = data.mobile;
        if (data.email_code !== undefined) repository.email_code = data.email_code;
        if (data.mobile_code !== undefined) repository.mobile_code = data.mobile_code;
        if (data.business_type !== undefined) repository.business_type = data.business_type;
        if (data.team_size !== undefined) repository.team_size = data.team_size;
        if (data.operation_description !== undefined) repository.operation_description = data.operation_description;
        if (data.address1 !== undefined) repository.address1 = data.address1;
        if (data.address2 !== undefined) repository.address2 = data.address2;
        if (data.city !== undefined) repository.city = data.city;
        if (data.state !== undefined) repository.state = data.state;
        if (data.country !== undefined) repository.country = data.country;
        if (data.zipcode !== undefined) repository.zipcode = data.zipcode;
        if (data.total !== undefined) repository.total = data.total;
        if (data.pass !== undefined) repository.pass = data.pass;
        if (data.fail !== undefined) repository.fail = data.fail;
        if (data.invalid !== undefined) repository.invalid = data.invalid;
        if (data.score !== undefined) repository.score = data.score;
        if (data.pdf_path !== undefined) repository.pdf_path = data.pdf_path;
        if (data.email_verified !== undefined) {
            if (data.email_verified === true) {
                repository.email = repository.secondary_email || repository.email;
                repository.secondary_email = null;
                repository.secondary_email_code = null;
                repository.email_verified = true
            } else[
                repository.email_verified = data.email_verified
            ]
        };
        if (data.mobile_verified !== undefined) repository.mobile_verified = data.mobile_verified;
        if (data.status !== undefined) repository.status = data.status;

        return this.assessmentReportRepository.save(repository, options);
    }

    async delete(
        repository: AssessmentReportDoc,
        options?: IDatabaseDeleteOptions
    ): Promise<AssessmentReportDoc> {
        return this.assessmentReportRepository.delete({ _id: repository._id }, options);
    }

    async softDelete(
        repository: AssessmentReportDoc,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<AssessmentReportDoc> {
        return this.assessmentReportRepository.softDelete(repository, options);
    }

    async restore(
        repository: AssessmentReportDoc,
        options?: IDatabaseSaveOptions
    ): Promise<AssessmentReportDoc> {
        return this.assessmentReportRepository.restore(repository, options);
    }

    async verifyEmailCode(reportId: string, emailCode: string): Promise<boolean> {
        const report = await this.assessmentReportRepository.findOne<AssessmentReportDoc>({
            _id: reportId,
            $or: [
                { email_code: emailCode, },
                { secondary_email_code: emailCode }
            ]
        });
        return !!report;
    }

    async verifyMobileCode(reportId: string, mobileCode: string): Promise<boolean> {
        const report = await this.assessmentReportRepository.findOne<AssessmentReportDoc>({
            _id: reportId,
            mobile_code: mobileCode,
        });
        return !!report;
    }

    generateVerificationCode(): string {
        // Generate a 6-digit random code
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
}