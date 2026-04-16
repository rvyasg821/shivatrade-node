import { Module } from '@nestjs/common';
import { ContractRepositoryModule } from './repository/contract.repository.module';
import { UserModule } from '@modules/user/user.module';
import { RoleModule } from '@modules/role/role.module';
import { LocationModule } from '@modules/location/location.module';
import { CompanySettingsModule } from '@modules/company-settings/company-settings.module';
import { ContractTemplateService } from './services/contract-template.service';
import { ContractSectionService } from './services/contract-section.service';
import { ContractFieldService } from './services/contract-field.service';
import { EmployeeContractService } from './services/employee-contract.service';
import { ContractPlaceholderService } from './services/contract-placeholder.service';
import { ContractPdfService } from './services/contract-pdf.service';
import { ContractNotificationService } from './services/contract-notification.service';

@Module({
    imports: [ContractRepositoryModule, UserModule, RoleModule, LocationModule, CompanySettingsModule],
    providers: [
        ContractTemplateService,
        ContractSectionService,
        ContractFieldService,
        EmployeeContractService,
        ContractPlaceholderService,
        ContractPdfService,
        ContractNotificationService,
    ],
    exports: [
        ContractTemplateService,
        ContractSectionService,
        ContractFieldService,
        EmployeeContractService,
        ContractPlaceholderService,
        ContractPdfService,
        ContractNotificationService,
    ],
})
export class ContractModule {}
