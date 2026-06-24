import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CommandModule, CommandService } from 'nestjs-command';
import { ENUM_APP_ENVIRONMENT } from '@app/enums/app.enum';
import { MigrationModule } from '@migration/migration.module';

async function bootstrap() {
    process.env.APP_ENV = ENUM_APP_ENVIRONMENT.MIGRATION;

    const app = await NestFactory.createApplicationContext(MigrationModule, {
        // Seeds/commands are meant to be verbose — surface their progress
        // (`logger.log`/`warn`), not just errors. Without 'log' here every
        // `this.logger.log(...)` in a seed is silently dropped.
        logger: ['error', 'fatal', 'warn', 'log'],
        abortOnError: true,
        bufferLogs: false,
    });

    const logger = new Logger('NestJs-Seed');

    try {
        await app.select(CommandModule).get(CommandService).exec();
        process.exit(0);
    } catch (err: unknown) {
        logger.error(err);

        process.exit(1);
    }
}

bootstrap();
