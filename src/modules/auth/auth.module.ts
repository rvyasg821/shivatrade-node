import { DynamicModule, Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { AuthJwtAccessStrategy } from '@modules/auth/guards/jwt/strategies/auth.jwt.access.strategy';
import { AuthJwtRefreshStrategy } from '@modules/auth/guards/jwt/strategies/auth.jwt.refresh.strategy';
import { AuthService } from '@modules/auth/services/auth.service';
import { OTPService } from '@modules/auth/services/otp.service';
import { OTPRepositoryModule } from '@modules/auth/repository/otp.repository.module';
import { UserModule } from '@modules/user/user.module';
import { EmailModule } from '@modules/email/email.module';
import { Algorithm } from 'jsonwebtoken';
import { CompanyModule } from '@modules/company/company.module';
import { RoleModule } from '@modules/role/role.module';
import { SessionModule } from '@modules/session/session.module';
import { SubscriptionModule } from '@modules/subscription/subscription.module';
import { CompanySettingsModule } from '@modules/company-settings/company-settings.module';
import { LocationModule } from '@modules/location/location.module';

@Module({
    providers: [AuthService, OTPService],
    exports: [AuthService, OTPService],
    controllers: [],
    imports: [
        OTPRepositoryModule,
        EmailModule,
        forwardRef(() => CompanyModule),
        forwardRef(() => RoleModule),
        forwardRef(() => UserModule),
        forwardRef(() => SessionModule),
        forwardRef(() => SubscriptionModule),
        forwardRef(() => CompanySettingsModule),
        forwardRef(() => LocationModule),
        JwtModule.registerAsync({
            inject: [ConfigService],
            imports: [ConfigModule],
            useFactory: (configService: ConfigService): JwtModuleOptions => ({
                signOptions: {
                    audience: configService.get<string>('auth.jwt.audience'),
                    issuer: configService.get<string>('auth.jwt.issuer'),
                    algorithm:
                        configService.get<Algorithm>('auth.jwt.algorithm'),
                },
            }),
        }),
    ],
})
export class AuthModule {
    static forRoot(): DynamicModule {
        return {
            module: AuthModule,
            providers: [AuthJwtAccessStrategy, AuthJwtRefreshStrategy],
            exports: [],
            controllers: [],
            imports: [],
        };
    }
}
