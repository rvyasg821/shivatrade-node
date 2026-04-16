import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Algorithm } from 'jsonwebtoken';
import { IAuthJwtRefreshTokenPayload } from '@modules/auth/interfaces/auth.interface';

@Injectable()
export class AuthJwtRefreshStrategy extends PassportStrategy(
    Strategy,
    'jwtRefresh'
) {
    constructor(private readonly configService: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderWithScheme(
                configService.get<string>('auth.jwt.prefix')
            ),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>(
                'auth.jwt.refreshToken.secret'
            ),
            algorithms: [
                configService.get<Algorithm>('auth.jwt.algorithm'),
            ],
        });
    }

    async validate(
        data: IAuthJwtRefreshTokenPayload
    ): Promise<IAuthJwtRefreshTokenPayload> {
        return data;
    }
}
