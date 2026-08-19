import { Global, Module } from '@nestjs/common';
import { PoVendorRepositoryModule } from '@modules/po-vendor/repository/po-vendor.repository.module';
import { GrnRepositoryModule } from '@modules/grn/repository/grn.repository.module';
import { ToleranceGuardService } from './services/tolerance-guard.service';

// Global so GRN / PO-Vendor / Invoice modules can inject ToleranceGuardService
// directly (same pattern as CompanySettingsModule) without adding an import
// and risking a circular dependency.
@Global()
@Module({
    imports: [PoVendorRepositoryModule, GrnRepositoryModule],
    providers: [ToleranceGuardService],
    exports: [ToleranceGuardService],
})
export class ToleranceGuardModule {}
