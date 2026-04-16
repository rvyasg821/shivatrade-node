import { Injectable, ForbiddenException, PipeTransform } from '@nestjs/common';
import { CompanyDoc } from '@modules/company/repository/entities/company.entity';
import { ENUM_COMPANY_STATUS_CODE_ERROR } from '@modules/company/enums/company.status-code.enum';

@Injectable()
export class CompanyOwnershipPipe implements PipeTransform {
    constructor() { }

    async transform(value: CompanyDoc): Promise<CompanyDoc> {
        // This pipe will be used in combination with guards that validate ownership
        // For now, it just returns the value as ownership validation will be handled
        // at the controller level through guards or manual checks
        return value;
    }
}