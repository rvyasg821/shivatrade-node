import { forwardRef, Module } from '@nestjs/common';
import { UserRepositoryModule } from '@modules/user/repository/user.repository.module';
import { UserService } from '@modules/user/services/user.service';
import { CompanyModule } from '@modules/company/company.module';

@Module({
    imports: [
        forwardRef(() => UserRepositoryModule),
        forwardRef(() => CompanyModule),
    ],
    exports: [UserService],
    providers: [UserService],
    controllers: [],
})
export class UserModule {}
