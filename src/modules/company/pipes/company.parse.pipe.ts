import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { CompanyDoc } from '@modules/company/repository/entities/company.entity';
import { CompanyService } from '@modules/company/services/company.service';
import { ENUM_COMPANY_STATUS_CODE_ERROR } from '@modules/company/enums/company.status-code.enum';

@Injectable()
export class CompanyParsePipe implements PipeTransform {
    constructor(private readonly companyService: CompanyService) { }

    async transform(value: any): Promise<CompanyDoc> {
        if (!value || typeof value !== 'string') {
            throw new NotFoundException({
                statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'company.error.notFound',
            });
        }

        const company: CompanyDoc = await this.companyService.findOneById(value, { join: true });

        if (!company) {
            throw new NotFoundException({
                statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'company.error.notFound',
            });
        }

        return company;
    }
}