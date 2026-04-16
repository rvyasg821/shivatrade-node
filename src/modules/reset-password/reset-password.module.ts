import { forwardRef, Module } from '@nestjs/common';
import { ResetPasswordRepositoryModule } from '@modules/reset-password/repository/reset-password.repository.module';
import { ResetPasswordService } from '@modules/reset-password/services/reset-password.service';
import { UserModule } from '@modules/user/user.module';
@Module({
    imports: [
        ResetPasswordRepositoryModule,
        forwardRef(() => UserModule),
    ],
    exports: [ResetPasswordService],
    providers: [ResetPasswordService],
    controllers: [],
})
export class ResetPasswordModule {}
