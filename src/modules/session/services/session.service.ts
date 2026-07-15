import { DatabaseService } from '@common/database/services/database.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { plainToInstance } from 'class-transformer';
import { Request } from 'express';
import { Duration } from 'luxon';
import {
    IDatabaseCreateOptions,
    IDatabaseDeleteManyOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseOptions,
    IDatabaseUpdateManyOptions,
} from '@common/database/interfaces/database.interface';
import { HelperDateService } from '@common/helper/services/helper.date.service';
import { SessionCreateRequestDto } from '@modules/session/dtos/request/session.create.request.dto';
import { SessionListResponseDto } from '@modules/session/dtos/response/session.list.response.dto';
import { ENUM_SESSION_STATUS } from '@modules/session/enums/session.enum';
import { ISessionService } from '@modules/session/interfaces/session.service.interface';
import {
    SessionDoc,
    SessionEntity,
} from '@modules/session/repository/entities/session.entity';
import { SessionRepository } from '@modules/session/repository/repositories/session.repository';
import { IUserDoc } from '@modules/user/interfaces/user.interface';
import { AuditLogService } from '@modules/tracking/services/audit-log.service';
import { ENUM_AUDIT_ACTION } from '@modules/tracking/repository/entities/audit-log.entity';

@Injectable()
export class SessionService implements ISessionService {
    private readonly refreshTokenExpiration: number;
    private readonly appName: string;

    private readonly keyPrefix: string;

    constructor(
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
        private readonly configService: ConfigService,
        private readonly helperDateService: HelperDateService,
        private readonly sessionRepository: SessionRepository,
        private readonly databaseService: DatabaseService,
        private readonly auditLogService: AuditLogService
    ) {
        this.refreshTokenExpiration = this.configService.get<number>(
            'auth.jwt.refreshToken.expirationTime'
        )!;
        this.appName = this.configService.get<string>('app.name')!;

        this.keyPrefix = this.configService.get<string>('session.keyPrefix')!;
    }

    convertToObjectId(id: string) {
        return id;
    }

    async findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<SessionDoc[]> {
        return this.sessionRepository.findAll<SessionDoc>(find, options);
    }

    async findAllByUser(
        user: any,
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<SessionDoc[]> {
        return this.sessionRepository.findAll<SessionDoc>(
            { user, ...find },
            options
        );
    }

    async findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<SessionDoc> {
        return this.sessionRepository.findOneById<SessionDoc>(_id, options);
    }

    async findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<SessionDoc> {
        return this.sessionRepository.findOne<SessionDoc>(find, options);
    }

    async findOneActiveById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<SessionDoc> {
        const today = this.helperDateService.create();

        return this.sessionRepository.findOne<SessionDoc>(
            {
                _id,
                ...this.databaseService.filterGte('expiredAt', today),
            },
            options
        );
    }

    async findOneActiveByIdAndUser(
        _id: string,
        user: string,
        options?: IDatabaseFindOneOptions
    ): Promise<SessionDoc> {
        const today = this.helperDateService.create();

        return this.sessionRepository.findOne<SessionDoc>(
            {
                _id,
                user,
                ...this.databaseService.filterGte('expiredAt', today),
            },
            options
        );
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return this.sessionRepository.getTotal(find, options);
    }

    async getTotalByUser(
        user: any,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return this.sessionRepository.getTotal({ user }, options);
    }

    async create(
        request: Request,
        { user }: SessionCreateRequestDto,
        options?: IDatabaseCreateOptions
    ): Promise<SessionDoc> {
        const today = this.helperDateService.create();
        const expiredAt: Date = this.helperDateService.forward(
            today,
            Duration.fromObject({
                seconds: this.refreshTokenExpiration,
            })
        );

        const create = new SessionEntity();
        create.user = this.convertToObjectId(user);
        create.hostname = request.hostname;
        create.ip = request.ip ?? '0.0.0.0';
        create.protocol = request.protocol;
        create.originalUrl = request.originalUrl;
        create.method = request.method;

        create.userAgent = request.headers['user-agent'] as string;
        create.xForwardedFor = request.headers['x-forwarded-for'] as string;
        create.xForwardedHost = request.headers['x-forwarded-host'] as string;
        create.xForwardedPorto = request.headers['x-forwarded-porto'] as string;

        create.status = ENUM_SESSION_STATUS.ACTIVE;
        create.expiredAt = expiredAt;

        return this.sessionRepository.create<SessionEntity>(create, options);
    }

    mapList(
        userLogins: SessionDoc[] | SessionEntity[]
    ): SessionListResponseDto[] {
        return plainToInstance(
            SessionListResponseDto,
            userLogins.map((e: SessionDoc | SessionEntity) =>
                (e as any).toObject ? (e as any).toObject() : e
            )
        );
    }

    async findLoginSession(_id: string): Promise<string> {
        return (await this.cacheManager.get<string>(
            `${this.appName}:${this.keyPrefix}:${_id}`
        ))!;
    }

    async setLoginSession(user: IUserDoc, session: SessionDoc): Promise<void> {
        const key = `${this.appName}:${this.keyPrefix}:${session._id}`;

        await this.cacheManager.set(
            key,
            { user: user._id },
            this.refreshTokenExpiration
        );

        return;
    }

    async deleteLoginSession(_id: string): Promise<void> {
        const key = `${this.appName}:${this.keyPrefix}:${_id}`;
        await this.cacheManager.del(key);

        return;
    }

    async resetLoginSession(): Promise<void> {
        await this.cacheManager.clear();

        return;
    }

    async updateRevoke(
        repository: SessionDoc,
        options?: IDatabaseOptions
    ): Promise<SessionDoc> {
        const sessId = String(repository._id);
        await this.deleteLoginSession(sessId);

        repository.status = ENUM_SESSION_STATUS.REVOKED;
        repository.revokeAt = this.helperDateService.create();

        const saved = await this.sessionRepository.save(repository, options);

        // Activity feed: a revoked session is a sign-out. Attribute it to the
        // session's owner (correct even when an admin force-revokes it, and when
        // the client just drops its tokens the server still has this signal).
        const userId = String((repository as any).user || '') || undefined;
        this.auditLogService.recordSummary({
            entity_name: 'AuthEntity',
            entity_id: userId,
            action: ENUM_AUDIT_ACTION.LOGOUT,
            user_id: userId,
            summary: { session: sessId },
        });

        return saved;
    }

    async updateManyRevokeByUser(
        user: any,
        options?: IDatabaseUpdateManyOptions
    ): Promise<boolean> {
        const today = this.helperDateService.create();
        const sessions = await this.findAllByUser(user, undefined, options);
        const promises = sessions.map(e => this.deleteLoginSession(String(e._id)));

        await Promise.all(promises);

        await this.sessionRepository.updateMany(
            {
                user,
            },
            {
                status: ENUM_SESSION_STATUS.REVOKED,
                revokeAt: today,
            },
            options
        );

        return true;
    }

    async deleteMany(
        find?: Record<string, any>,
        options?: IDatabaseDeleteManyOptions
    ): Promise<boolean> {
        await this.sessionRepository.deleteMany(find, options);

        return true;
    }
}
