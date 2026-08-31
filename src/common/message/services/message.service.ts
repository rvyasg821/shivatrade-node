import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ValidationError } from 'class-validator';
import { I18nService } from 'nestjs-i18n';
import { HelperArrayService } from '@common/helper/services/helper.array.service';
import { ENUM_MESSAGE_LANGUAGE } from '@common/message/enums/message.enum';
import {
    IMessageErrorOptions,
    IMessageSetOptions,
    IMessageValidationError,
    IMessageValidationImportError,
    IMessageValidationImportErrorParam,
} from '@common/message/interfaces/message.interface';
import { IMessageService } from '@common/message/interfaces/message.service.interface';

@Injectable()
export class MessageService implements IMessageService {
    private readonly defaultLanguage: ENUM_MESSAGE_LANGUAGE;
    private readonly availableLanguage: ENUM_MESSAGE_LANGUAGE[];
    private readonly debug: boolean;

    constructor(
        private readonly i18n: I18nService,
        private readonly configService: ConfigService,
        private readonly helperArrayService: HelperArrayService
    ) {
        this.defaultLanguage =
            this.configService.get<ENUM_MESSAGE_LANGUAGE>('message.language');
        this.availableLanguage = this.configService.get<
            ENUM_MESSAGE_LANGUAGE[]
        >('message.availableLanguage');
        this.debug = this.configService.get<boolean>('debug.enable');
    }

    //! Filter message base on available language
    filterLanguage(customLanguage: string): string[] {
        return this.helperArrayService.getIntersection(
            [customLanguage],
            this.availableLanguage
        );
    }

    //! set message by path  base on language
    setMessage(path: string, options?: IMessageSetOptions): string {
        const language: string = options?.customLanguage
            ? this.filterLanguage(options.customLanguage)[0]
            : this.defaultLanguage;

        return this.i18n.translate(path, {
            lang: language,
            args: options?.properties,
            debug: this.debug,
        }) as any;
    }

    setValidationMessage(
        errors: ValidationError[],
        options?: IMessageErrorOptions
    ): IMessageValidationError[] {
        const messages: IMessageValidationError[] = [];
        for (const error of errors) {
            let property = error.property;

            let constraintMessages: Record<string, string> =
                error.constraints ?? {};
            const constraints: string[] = Object.keys(constraintMessages);
            if (constraints.length === 0) {
                let children: ValidationError[] = error.children ?? [];
                let lastConstraint: Record<string, string> = {};

                while (children.length > 0) {
                    const child = children[0];

                    lastConstraint = child.constraints ?? {};
                    property = `${property}.${child.property}`;
                    children = children[0].children;
                }

                constraintMessages = lastConstraint ?? {};
                constraints.push(...Object.keys(constraintMessages));
            }

            for (const constraint of constraints) {
                // `matches` (@Matches) is a generic, MULTI-PURPOSE decorator —
                // reused across many unrelated DTOs (currency codes, PAN,
                // GSTIN, OTP digits, shift start/end time, phone) each with
                // their OWN `message` option — unlike `isNotEmpty`/`isUUID`/
                // etc., which have one universal meaning app-wide and are
                // fine to phrase generically. A single generic
                // `request.matches` i18n string can never be right for all
                // of them, and it was wrongly hardcoded to a copy-pasted
                // password-strength message (languages/*/request.json's
                // "matches" key) — every @Matches failure anywhere in the
                // app (not just this one field) showed that same wrong
                // message. Every @Matches() call site already supplies its
                // own message, so use the decorator-resolved one (already
                // sitting in constraintMessages[constraint]) instead of the
                // generic i18n lookup.
                if (constraint === 'matches' && constraintMessages[constraint]) {
                    messages.push({
                        property,
                        message: constraintMessages[constraint],
                    });
                    continue;
                }

                const message = this.setMessage(`request.${constraint}`, {
                    customLanguage: options?.customLanguage,
                    properties: {
                        property: property.split('.').pop(),
                        value: error.value,
                    },
                });

                messages.push({
                    property,
                    message: message,
                });
            }
        }

        return messages;
    }

    setValidationImportMessage(
        errors: IMessageValidationImportErrorParam[],
        options?: IMessageErrorOptions
    ): IMessageValidationImportError[] {
        return errors.map(val => ({
            row: val.row,
            sheetName: val.sheetName,
            errors: this.setValidationMessage(val.errors, options),
        }));
    }
}
