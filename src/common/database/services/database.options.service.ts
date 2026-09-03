import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { IDatabaseOptionService } from '@common/database/interfaces/database.option-service.interface';

@Injectable()
export class DatabaseOptionService implements IDatabaseOptionService {
    constructor(private readonly configService: ConfigService) {}

    private readonly logger = new Logger(DatabaseOptionService.name);

    createOptions(): TypeOrmModuleOptions {
        const host = this.configService.get<string>('database.host');
        const port = this.configService.get<number>('database.port');
        const username = this.configService.get<string>('database.username');
        const password = this.configService.get<string>('database.password');
        const database = this.configService.get<string>('database.name');
        const synchronize = this.configService.get<boolean>('database.synchronize');
        const debug = this.configService.get<boolean>('database.debug');

        this.logger.log(
            `Database configured: host=${host} port=${port} database=${database} synchronize=${synchronize}`
        );

        const options: TypeOrmModuleOptions = {
            type: 'postgres',
            host,
            port,
            username,
            password,
            database,
            autoLoadEntities: true,
            synchronize: synchronize ?? true,
            logging: debug ? ['query', 'error'] : ['error'],
            // Without these, node-postgres has NO cap on how long a new
            // connection attempt can hang (default connectionTimeoutMillis
            // is 0 = unbounded) — right after a fresh deploy the pool starts
            // with zero warm connections, so the first query pays for a
            // brand-new TCP+auth handshake; on a loaded/shared host that can
            // take long enough to trip the app's own 30s request-timeout
            // interceptor with no diagnostic info. Bounding it here means a
            // stuck connection fails fast (and pg retries) instead of
            // silently hanging the whole request.
            extra: {
                max: 20,
                connectionTimeoutMillis: 10000,
                idleTimeoutMillis: 30000,
            },
        };

        return options;
    }
}
