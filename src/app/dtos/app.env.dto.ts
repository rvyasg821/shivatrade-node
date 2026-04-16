import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUrl,
    Min,
    MinLength,
} from 'class-validator';
import { ENUM_APP_ENVIRONMENT } from '@app/enums/app.enum';
import { ENUM_MESSAGE_LANGUAGE } from '@common/message/enums/message.enum';

export class AppEnvDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    APP_NAME: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    @IsEnum(ENUM_APP_ENVIRONMENT)
    APP_ENV: ENUM_APP_ENVIRONMENT;

    @IsString()
    @IsNotEmpty()
    @IsEnum(ENUM_MESSAGE_LANGUAGE)
    APP_LANGUAGE: ENUM_MESSAGE_LANGUAGE;

    @IsString()
    @IsNotEmpty()
    APP_TIMEZONE: string;

    @IsNotEmpty()
    @IsString()
    HOME_NAME: string;

    @IsNotEmpty()
    @IsUrl({ require_tld: false })
    @IsString()
    HOME_URL: string;

    @IsNotEmpty()
    @IsString()
    @MinLength(1)
    HTTP_HOST: string;

    @IsNumber({
        allowInfinity: false,
        allowNaN: false,
        maxDecimalPlaces: 0,
    })
    @IsInt()
    @Min(1)
    @IsNotEmpty()
    @Type(() => Number)
    HTTP_PORT: number;

    @IsBoolean()
    @IsNotEmpty()
    @Type(() => Boolean)
    DEBUG_ENABLE: boolean;

    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    DEBUG_LEVEL: string;

    @IsBoolean()
    @IsNotEmpty()
    @Type(() => Boolean)
    DEBUG_INTO_FILE: boolean;

    @IsBoolean()
    @IsNotEmpty()
    @Type(() => Boolean)
    DEBUG_PRETTIER: boolean;

    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    MIDDLEWARE_CORS_ORIGIN: string;

    @IsBoolean()
    @IsNotEmpty()
    @Type(() => Boolean)
    URL_VERSIONING_ENABLE: boolean;

    @IsNumber({
        allowInfinity: false,
        allowNaN: false,
        maxDecimalPlaces: 0,
    })
    @Min(1)
    @IsInt()
    @IsNotEmpty()
    @Type(() => Number)
    URL_VERSION: number;

    @IsOptional()
    @IsString()
    @MinLength(1)
    DATABASE_URL?: string;

    @IsBoolean()
    @IsNotEmpty()
    @Type(() => Boolean)
    DATABASE_DEBUG: boolean;

    @IsNotEmpty()
    @IsString()
    @MinLength(1)
    AUTH_JWT_AUDIENCE: string;

    @IsNotEmpty()
    @IsString()
    @MinLength(1)
    AUTH_JWT_ISSUER: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    AUTH_JWT_ACCESS_TOKEN_SECRET: string;

    @IsNotEmpty()
    @IsString()
    @MinLength(1)
    AUTH_JWT_ACCESS_TOKEN_EXPIRED: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    AUTH_JWT_REFRESH_TOKEN_SECRET: string;

    @IsNotEmpty()
    @IsString()
    @MinLength(1)
    AUTH_JWT_REFRESH_TOKEN_EXPIRED: string;

    @IsOptional()
    @IsString()
    AWS_S3_CREDENTIAL_KEY?: string;

    @IsOptional()
    @IsString()
    AWS_S3_CREDENTIAL_SECRET?: string;

    @IsOptional()
    @IsString()
    AWS_S3_REGION?: string;

    @IsOptional()
    @IsString()
    AWS_S3_PUBLIC_BUCKET?: string;

    @IsOptional()
    @IsString()
    AWS_S3_PUBLIC_CDN?: string;

    @IsOptional()
    @IsString()
    AWS_S3_PRIVATE_BUCKET?: string;

    @IsOptional()
    @IsString()
    AWS_SES_CREDENTIAL_KEY?: string;

    @IsOptional()
    @IsString()
    AWS_SES_CREDENTIAL_SECRET?: string;

    @IsOptional()
    @IsString()
    AWS_SES_REGION?: string;

    @IsOptional()
    @IsString()
    AUTH_SOCIAL_GOOGLE_CLIENT_ID?: string;

    @IsOptional()
    @IsString()
    AUTH_SOCIAL_GOOGLE_CLIENT_SECRET?: string;

    @IsOptional()
    @IsString()
    AUTH_SOCIAL_APPLE_CLIENT_ID?: string;

    @IsOptional()
    @IsString()
    AUTH_SOCIAL_APPLE_SIGN_IN_CLIENT_ID?: string;

    @IsNotEmpty()
    @IsString()
    REDIS_HOST: string;

    @IsNumber({
        allowInfinity: false,
        allowNaN: false,
        maxDecimalPlaces: 0,
    })
    @IsInt()
    @Min(1)
    @IsNotEmpty()
    @Type(() => Number)
    REDIS_PORT: number;

    @IsOptional()
    @IsString()
    REDIS_USERNAME?: string;

    @IsOptional()
    @IsString()
    REDIS_PASSWORD?: string;

    @IsOptional()
    @IsString()
    SENTRY_DSN?: string;

    // Multi-Tenant Configuration
    @IsOptional()
    @IsString()
    @MinLength(64)
    MULTI_TENANT_ENCRYPTION_KEY?: string;

    @IsOptional()
    @IsNumber({
        allowInfinity: false,
        allowNaN: false,
        maxDecimalPlaces: 0,
    })
    @IsInt()
    @Min(1)
    @Type(() => Number)
    MT_MAX_POOL_SIZE?: number;

    @IsOptional()
    @IsNumber({
        allowInfinity: false,
        allowNaN: false,
        maxDecimalPlaces: 0,
    })
    @IsInt()
    @Min(0)
    @Type(() => Number)
    MT_MIN_POOL_SIZE?: number;

    @IsOptional()
    @IsNumber({
        allowInfinity: false,
        allowNaN: false,
        maxDecimalPlaces: 0,
    })
    @IsInt()
    @Min(10000)
    @Type(() => Number)
    MT_MAX_IDLE_TIME_MS?: number;

    @IsOptional()
    @IsNumber({
        allowInfinity: false,
        allowNaN: false,
        maxDecimalPlaces: 0,
    })
    @IsInt()
    @Min(1000)
    @Type(() => Number)
    MT_SERVER_SELECTION_TIMEOUT_MS?: number;

    @IsOptional()
    @IsNumber({
        allowInfinity: false,
        allowNaN: false,
        maxDecimalPlaces: 0,
    })
    @IsInt()
    @Min(1000)
    @Type(() => Number)
    MT_SOCKET_TIMEOUT_MS?: number;

    @IsOptional()
    @IsNumber({
        allowInfinity: false,
        allowNaN: false,
        maxDecimalPlaces: 0,
    })
    @IsInt()
    @Min(1000)
    @Type(() => Number)
    MT_HEARTBEAT_FREQUENCY_MS?: number;

    @IsOptional()
    @IsNumber({
        allowInfinity: false,
        allowNaN: false,
        maxDecimalPlaces: 0,
    })
    @IsInt()
    @Min(1)
    @Type(() => Number)
    MT_MAX_TENANTS_PER_INSTANCE?: number;

    @IsOptional()
    @IsNumber({
        allowInfinity: false,
        allowNaN: false,
        maxDecimalPlaces: 0,
    })
    @IsInt()
    @Min(1000)
    @Type(() => Number)
    MT_CONNECTION_TIMEOUT_MS?: number;

    @IsOptional()
    @IsNumber({
        allowInfinity: false,
        allowNaN: false,
        maxDecimalPlaces: 0,
    })
    @IsInt()
    @Min(10000)
    @Type(() => Number)
    MT_IDLE_TIMEOUT_MS?: number;

    @IsOptional()
    @IsNumber({
        allowInfinity: false,
        allowNaN: false,
        maxDecimalPlaces: 0,
    })
    @IsInt()
    @Min(10000)
    @Type(() => Number)
    MT_HEALTH_CHECK_INTERVAL_MS?: number;

    @IsOptional()
    @IsNumber({
        allowInfinity: false,
        allowNaN: false,
        maxDecimalPlaces: 0,
    })
    @IsInt()
    @Min(1)
    @Type(() => Number)
    MULTI_TENANT_MAX_RETRIES?: number;

    @IsOptional()
    @IsNumber({
        allowInfinity: false,
        allowNaN: false,
        maxDecimalPlaces: 0,
    })
    @IsInt()
    @Min(100)
    @Type(() => Number)
    MULTI_TENANT_BASE_DELAY?: number;

    @IsOptional()
    @IsNumber({
        allowInfinity: false,
        allowNaN: false,
        maxDecimalPlaces: 0,
    })
    @IsInt()
    @Min(1000)
    @Type(() => Number)
    MULTI_TENANT_MAX_DELAY?: number;
}
