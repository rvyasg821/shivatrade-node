import { Module, forwardRef } from '@nestjs/common';
import { CompanySettingsRepositoryModule } from './repository/company-settings.repository.module';
import { CompanySettingsService } from './services/company-settings.service';
import { EmailModule } from '@modules/email/email.module';
import { CompanyModule } from '@modules/company/company.module';
import { UserModule } from '@modules/user/user.module';

@Module({
    imports: [CompanySettingsRepositoryModule, forwardRef(() => EmailModule), forwardRef(() => CompanyModule), forwardRef(() => UserModule)],
    providers: [CompanySettingsService],
    exports: [CompanySettingsService],
})
export class CompanySettingsModule {}
