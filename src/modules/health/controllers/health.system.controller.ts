import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
    DiskHealthIndicator,
    HealthCheck,
    HealthCheckService,
    MemoryHealthIndicator,
    TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { DataSource } from 'typeorm';

import { InjectDataSource } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { Response } from '@common/response/decorators/response.decorator';
import { IResponse } from '@common/response/interfaces/response.interface';


import { HealthDatabaseResponseDto } from '@modules/health/dtos/response/health.database.response.dto';
import {
    HealthSystemCheckDatabaseDoc,
    HealthSystemCheckInstanceDoc,
} from '@modules/health/docs/health.system.doc';
import { HealthInstanceResponseDto } from '@modules/health/dtos/response/health.instance.response.dto';



@ApiTags('modules.system.health')
@Controller({
    version: VERSION_NEUTRAL,
    path: '/health',
})
export class HealthSystemController {
    constructor(
        @InjectDataSource(DATABASE_CONNECTION_NAME)
        private readonly dataSource: DataSource,
        private readonly health: HealthCheckService,
        private readonly memoryHealthIndicator: MemoryHealthIndicator,
        private readonly diskHealthIndicator: DiskHealthIndicator,
        private readonly typeOrmIndicator: TypeOrmHealthIndicator,
    ) {}

    // TODO: (v8) MORE HEALTH CHECK
    // - google
    // - apple
    // - sentry
    // - redis

    

    @HealthSystemCheckDatabaseDoc()
    @Response('health.checkDatabase')
    @HealthCheck()
    @Get('/database')
    async checkDatabase(): Promise<IResponse<HealthDatabaseResponseDto>> {
        const data = await this.health.check([
            () =>
                this.typeOrmIndicator.pingCheck('database'),
        ]);
        return {
            data,
        };
    }

    @HealthSystemCheckInstanceDoc()
    @Response('health.checkInstance')
    @HealthCheck()
    @Get('/instance')
    async checkInstance(): Promise<IResponse<HealthInstanceResponseDto>> {
        const data = await this.health.check([
            () =>
                this.memoryHealthIndicator.checkRSS(
                    'memoryRss',
                    300 * 1024 * 1024
                ),
            () =>
                this.memoryHealthIndicator.checkHeap(
                    'memoryHeap',
                    300 * 1024 * 1024
                ),
            () =>
                this.diskHealthIndicator.checkStorage('storage', {
                    thresholdPercent: 0.75,
                    path: '/',
                }),
        ]);

        return {
            data,
        };
    }
}
