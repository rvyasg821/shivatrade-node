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

        // The typeof check above only rejects null/undefined/non-string —
        // a malformed-but-string value still reached a raw, uncaught
        // Postgres "invalid input syntax for uuid" error here (same class
        // of gap fixed on User/Role/Country/Discount/Inventory/Subscription/
        // Plan this session).
        let company: CompanyDoc | undefined;
        try {
            company = await this.companyService.findOneById(value, { join: true });
        } catch {
            company = undefined;
        }

        if (!company) {
            throw new NotFoundException({
                statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'company.error.notFound',
            });
        }

        return company;
    }
}