import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Algorithm } from 'jsonwebtoken';
import { IAuthJwtAccessTokenPayload } from '@modules/auth/interfaces/auth.interface';

@Injectable()
export class AuthJwtAccessStrategy extends PassportStrategy(
    Strategy,
    'jwtAccess'
) {
    constructor(private readonly configService: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderWithScheme(
                configService.get<string>('auth.jwt.prefix')
            ),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('auth.jwt.accessToken.secret'),
            algorithms: [
                configService.get<Algorithm>('auth.jwt.algorithm'),
            ],
        });
    }

    async validate(
        data: IAuthJwtAccessTokenPayload
    ): Promise<IAuthJwtAccessTokenPayload> {
        return data;
    }
}
