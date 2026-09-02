import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { HttpArgumentsHost } from '@nestjs/common/interfaces';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { Response } from 'express';
import { IAppException } from '@app/interfaces/app.interface';
import { FileImportException } from '@common/file/exceptions/file.import.exception';
import { HelperDateService } from '@common/helper/services/helper.date.service';
import { ENUM_MESSAGE_LANGUAGE } from '@common/message/enums/message.enum';
import { MessageService } from '@common/message/services/message.service';
import { RequestValidationException } from '@common/request/exceptions/request.validation.exception';
import { IRequestApp } from '@common/request/interfaces/request.interface';
import { ResponseMetadataDto } from '@common/response/dtos/response.dto';
import * as Sentry from '@sentry/nestjs';

@Catch()
export class AppGeneralFilter implements ExceptionFilter {
    private readonly logger = new Logger(AppGeneralFilter.name);

    constructor(
        private readonly httpAdapterHost: HttpAdapterHost,
        private readonly messageService: MessageService,
        private readonly configService: ConfigService,
        private readonly helperDateService: HelperDateService
    ) { }

    async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
        const { httpAdapter } = this.httpAdapterHost;

        const ctx: HttpArgumentsHost = host.switchToHttp();
        const response: Response = ctx.getResponse<Response>();
        const request: IRequestApp = ctx.getRequest<IRequestApp>();

        this.logger.error(exception);

        // sentry
        this.sendToSentry(exception);

        if (exception instanceof HttpException) {
            const response = exception.getResponse();
            const statusHttp = exception.getStatus();

            httpAdapter.reply(ctx.getResponse(), response, statusHttp);
            return;
        }

        // set default
        const statusHttp: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
        const messagePath = `http.${statusHttp}`;
        const statusCode = HttpStatus.INTERNAL_SERVER_ERROR;

        // metadata
        const today = this.helperDateService.create();
        const xLanguage: string =
            request.__language ??
            this.configService.get<ENUM_MESSAGE_LANGUAGE>('message.language');
        const xTimestamp = this.helperDateService.getTimestamp(today);
        const xTimezone = this.helperDateService.getZone(today);
        const xVersion =
            request.__version ??
            this.configService.get<string>('app.urlVersion.version');
        const xRepoVersion = this.configService.get<string>('app.version');
        const metadata: ResponseMetadataDto = {
            language: xLanguage,
            timestamp: xTimestamp,
            timezone: xTimezone,
            path: request.path,
            version: xVersion,
            repoVersion: xRepoVersion,
        };

        const message: string = this.messageService.setMessage(messagePath, {
            customLanguage: xLanguage,
        });

        // Log internal server errors to file
        if (statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
            const logEntry = `[${xTimestamp}] ERROR 500: ${request.method} ${request.path}\n` +
                `Message: ${message}\n` +
                `Path: ${request.path}\n` +
                `User Agent: ${request.get('user-agent') || 'Unknown'}\n` +
                `IP: ${request.ip}\n` +
                `Status Code: ${statusCode}\n` +
                `Exception: ${exception instanceof Error ? exception.message : 'Unknown error'}\n` +
                `Stack: ${exception instanceof Error ? exception.stack : 'No stack trace'}\n` +
                `Metadata: ${JSON.stringify(metadata)}\n` +
                `----------------------------------------\n`;

            try {
                const logFilePath = join(process.cwd(), 'src/errorLogs/log.txt');

                // The directory is gitignored, so it never exists on a fresh
                // clone/deploy — every write silently failed until now (only
                // the catch below's console.error showed it, easy to miss).
                const logDir = dirname(logFilePath);
                if (!existsSync(logDir)) {
                    mkdirSync(logDir, { recursive: true });
                }

                // Check if file exists, if not create it
                if (!existsSync(logFilePath)) {
                    writeFileSync(logFilePath, '');
                }

                appendFileSync(logFilePath, logEntry);
            } catch (error) {
                this.logger.error('Failed to write to error log file:', error);
            }
        }

        const responseBody: IAppException = {
            statusCode,
            message,
            _metadata: metadata,
        };

        response
            .setHeader('x-custom-lang', xLanguage)
            .setHeader('x-timestamp', xTimestamp)
            .setHeader('x-timezone', xTimezone)
            .setHeader('x-version', xVersion)
            .setHeader('x-repo-version', xRepoVersion)
            .status(statusHttp)
            .json(responseBody);

        return;
    }

    sendToSentry(exception: unknown): void {
        if (
            (exception instanceof HttpException &&
                !(exception instanceof InternalServerErrorException)) ||
            exception instanceof RequestValidationException ||
            exception instanceof FileImportException
        ) {
            return;
        }

        try {
            Sentry.captureException(exception);
        } catch (err: unknown) {
            this.logger.error(err);
        }

        return;
    }
}
