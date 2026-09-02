import { Command } from 'nestjs-command';
import { Injectable, Logger } from '@nestjs/common';
import { CompanySettingsRepository } from '@modules/company-settings/repository/repositories/company-settings.repository';
import { HelperEncryptionService } from '@common/helper/services/helper.encryption.service';

// Same field list as CompanySettingsService — kept in sync manually since this
// is a standalone one-time script, not a shared import (it deliberately does
// NOT depend on CompanySettingsService, which will soon require the new key
// with no fallback and lose the ability to decrypt under the old derivation).
const SENSITIVE_FIELDS = [
    'smtp_password',
    'sms_api_key',
    'sms_api_secret',
    'whatsapp_api_key',
    'whatsapp_api_secret',
];

/**
 * ONE-TIME migration for SECURITY_HARDENING_PLAN.md B1 — re-encrypts every
 * company_settings sensitive field from the OLD key derivation
 * (AUTH_JWT_ACCESS_TOKEN_SECRET, or its hardcoded fallback) to the NEW
 * dedicated SETTINGS_ENCRYPTION_KEY. Run this ONCE, at deploy time, BEFORE
 * (or in the same deploy as) the CompanySettingsService change that drops
 * the old fallback — after that change ships, the old key is gone from the
 * app and this script is the only place that still knows how to read it.
 *
 * Usage: node dist/cli migrate:settings-encryption-key
 * Required env: SETTINGS_ENCRYPTION_KEY (the new key). AUTH_JWT_ACCESS_TOKEN_SECRET
 * only needs to still be set/unchanged from before this migration for the OLD
 * derivation to correctly decrypt existing values.
 */
@Injectable()
export class MigrateSettingsEncryptionKeyCommand {
    private readonly logger = new Logger(
        MigrateSettingsEncryptionKeyCommand.name
    );

    constructor(
        private readonly settingsRepository: CompanySettingsRepository,
        private readonly encryptionService: HelperEncryptionService
    ) {}

    @Command({
        command: 'migrate:settings-encryption-key',
        describe:
            'Re-encrypt company_settings sensitive fields from the old hardcoded-fallback key to the new dedicated SETTINGS_ENCRYPTION_KEY',
    })
    async migrate(): Promise<void> {
        const newSecret = process.env.SETTINGS_ENCRYPTION_KEY;
        if (!newSecret) {
            throw new Error(
                'SETTINGS_ENCRYPTION_KEY is not set. Set it before running this migration — it becomes the new encryption key for stored company settings secrets.'
            );
        }
        const oldSecret =
            process.env.AUTH_JWT_ACCESS_TOKEN_SECRET ||
            'default-secret-key-for-encryption!!';

        const oldKey = oldSecret.substring(0, 32).padEnd(32, '0');
        const oldIv = oldSecret.substring(0, 16).padEnd(16, '0');
        const newKey = newSecret.substring(0, 32).padEnd(32, '0');
        const newIv = newSecret.substring(0, 16).padEnd(16, '0');

        if (oldKey === newKey) {
            throw new Error(
                'SETTINGS_ENCRYPTION_KEY resolves to the same key as the old derivation — refusing to run (this would not actually re-encrypt anything). Pick a genuinely new secret.'
            );
        }

        this.logger.log('Starting settings-encryption-key migration...');

        const rows = await this.settingsRepository.findAll({} as any);
        let rowsUpdated = 0;
        let fieldsUpdated = 0;
        let rowsSkipped = 0;

        for (const row of rows as any[]) {
            let changed = false;
            for (const field of SENSITIVE_FIELDS) {
                const value = row[field];
                if (!value) continue;
                let plain: string;
                try {
                    plain = this.encryptionService.aes256Decrypt<string>(
                        value,
                        oldKey,
                        oldIv
                    );
                } catch (err: any) {
                    this.logger.warn(
                        `company_settings ${row._id} field "${field}": could not decrypt under the OLD key (${err?.message}). Left unchanged — likely already migrated or was stored as plaintext.`
                    );
                    continue;
                }
                row[field] = this.encryptionService.aes256Encrypt<string>(
                    plain,
                    newKey,
                    newIv
                );
                changed = true;
                fieldsUpdated++;
            }
            if (changed) {
                await this.settingsRepository.save(row);
                rowsUpdated++;
            } else {
                rowsSkipped++;
            }
        }

        this.logger.log(
            `Migration complete: ${rowsUpdated} company_settings rows re-encrypted (${fieldsUpdated} fields), ${rowsSkipped} rows had nothing to migrate.`
        );
        this.logger.log(
            'Verify: read a setting back through the app UI (e.g. SMTP password) and confirm it round-trips correctly, THEN deploy the CompanySettingsService change that removes the old key fallback.'
        );
    }
}
