import { Injectable } from '@nestjs/common';
import { CompanySettingsRepository } from '../repository/repositories/company-settings.repository';
import { CompanySettingsEntity } from '../repository/entities/company-settings.entity';
import { HelperEncryptionService } from '@common/helper/services/helper.encryption.service';

const SENSITIVE_FIELDS = ['smtp_password', 'sms_api_key', 'sms_api_secret', 'whatsapp_api_key', 'whatsapp_api_secret'];

@Injectable()
export class CompanySettingsService {
    private readonly encKey: string;
    private readonly encIv: string;

    constructor(
        private readonly settingsRepository: CompanySettingsRepository,
        private readonly encryptionService: HelperEncryptionService,
    ) {
        const secret = process.env.AUTH_JWT_ACCESS_TOKEN_SECRET || 'default-secret-key-for-encryption!!';
        this.encKey = secret.substring(0, 32).padEnd(32, '0');
        this.encIv = secret.substring(0, 16).padEnd(16, '0');
    }

    private encrypt(value: string): string {
        if (!value) return value;
        return this.encryptionService.aes256Encrypt(value, this.encKey, this.encIv);
    }

    private decrypt(value: string): string {
        if (!value) return value;
        try {
            return this.encryptionService.aes256Decrypt<string>(value, this.encKey, this.encIv);
        } catch {
            return value; // return as-is if decryption fails (e.g. plaintext from before encryption)
        }
    }

    private encryptSensitiveFields(data: Record<string, any>): Record<string, any> {
        const result = { ...data };
        for (const field of SENSITIVE_FIELDS) {
            if (result[field] !== undefined && result[field] !== null && result[field] !== '') {
                result[field] = this.encrypt(result[field]);
            }
        }
        return result;
    }

    private decryptSensitiveFields(entity: CompanySettingsEntity): Record<string, any> {
        const result: any = { ...entity };
        for (const field of SENSITIVE_FIELDS) {
            if (result[field]) {
                result[field] = this.decrypt(result[field]);
            }
        }
        return result;
    }

    async getCompanyDefaults(companyId: string): Promise<CompanySettingsEntity> {
        let settings = await this.settingsRepository.findOne({ company_id: companyId, location_id: null as any });
        if (!settings) {
            settings = await this.settingsRepository.create({
                company_id: companyId,
                location_id: null,
            });
        }
        return settings as CompanySettingsEntity;
    }

    async getOrCreate(companyId: string, locationId?: string): Promise<CompanySettingsEntity & { is_inherited?: boolean }> {
        if (!locationId) {
            const defaults = await this.getCompanyDefaults(companyId);
            (defaults as any).is_inherited = false;
            return defaults as CompanySettingsEntity & { is_inherited: boolean };
        }

        const locationSettings = await this.settingsRepository.findOne({ company_id: companyId, location_id: locationId });
        if (locationSettings) {
            (locationSettings as any).is_inherited = false;
            return locationSettings as CompanySettingsEntity & { is_inherited: boolean };
        }

        const defaults = await this.getCompanyDefaults(companyId);
        (defaults as any).is_inherited = true;
        return defaults as CompanySettingsEntity & { is_inherited: boolean };
    }

    async update(companyId: string, data: Partial<CompanySettingsEntity>, locationId?: string): Promise<CompanySettingsEntity> {
        const encrypted = this.encryptSensitiveFields(data as any);

        if (!locationId) {
            const defaults = await this.getCompanyDefaults(companyId);
            return this.settingsRepository.update(defaults, encrypted) as Promise<CompanySettingsEntity>;
        }

        let locationSettings = await this.settingsRepository.findOne({ company_id: companyId, location_id: locationId });
        if (locationSettings) {
            return this.settingsRepository.update(locationSettings, encrypted) as Promise<CompanySettingsEntity>;
        }

        return this.settingsRepository.create({
            company_id: companyId,
            location_id: locationId,
            ...encrypted,
        }) as Promise<CompanySettingsEntity>;
    }

    async deleteLocationOverride(companyId: string, locationId: string): Promise<CompanySettingsEntity> {
        const locationSettings = await this.settingsRepository.findOne({ company_id: companyId, location_id: locationId });
        if (locationSettings) {
            await this.settingsRepository.delete(locationSettings);
        }
        return this.getCompanyDefaults(companyId);
    }

    mapGet(s: CompanySettingsEntity & { is_inherited?: boolean }) {
        const decrypted = this.decryptSensitiveFields(s);
        return {
            _id: s._id,
            company_id: s.company_id,
            location_id: s.location_id,
            // SMTP
            smtp_enabled: s.smtp_enabled,
            smtp_host: s.smtp_host,
            smtp_port: s.smtp_port,
            smtp_username: s.smtp_username,
            smtp_password: decrypted.smtp_password,
            smtp_from_email: s.smtp_from_email,
            smtp_from_name: s.smtp_from_name,
            smtp_secure: s.smtp_secure,
            // SMS
            sms_enabled: s.sms_enabled,
            sms_provider: s.sms_provider,
            sms_api_key: decrypted.sms_api_key,
            sms_api_secret: decrypted.sms_api_secret,
            sms_from_number: s.sms_from_number,
            // WhatsApp
            whatsapp_enabled: s.whatsapp_enabled,
            whatsapp_provider: s.whatsapp_provider,
            whatsapp_api_key: decrypted.whatsapp_api_key,
            whatsapp_api_secret: decrypted.whatsapp_api_secret,
            whatsapp_from_number: s.whatsapp_from_number,
            // Code Generation
            location_code_mode: s.location_code_mode || 'manual',
            location_code_prefix: s.location_code_prefix || '',
            location_code_next_seq: s.location_code_next_seq || 1,
            employee_code_mode: s.employee_code_mode || 'manual',
            employee_code_prefix: s.employee_code_prefix || '',
            employee_code_next_seq: s.employee_code_next_seq || 1,
            // Per-module voucher prefixes
            lead_voucher_prefix: s.lead_voucher_prefix || '',
            rfq_voucher_prefix: s.rfq_voucher_prefix || '',
            quotation_voucher_prefix: s.quotation_voucher_prefix || '',
            sales_order_voucher_prefix: s.sales_order_voucher_prefix || '',
            invoice_voucher_prefix: s.invoice_voucher_prefix || '',
            po_vendor_voucher_prefix: s.po_vendor_voucher_prefix || '',
            grn_voucher_prefix: s.grn_voucher_prefix || '',
            debit_note_voucher_prefix: s.debit_note_voucher_prefix || '',
            // Branding
            logo_url: s.logo_url,
            company_display_name: s.company_display_name,
            footer_address: s.footer_address,
            footer_contact: s.footer_contact,
            footer_extra: s.footer_extra,
            // Compliance
            compliance_config: s.compliance_config || null,
            // Meta
            is_inherited: !!(s as any).is_inherited,
        };
    }

    /**
     * Generate next auto code and atomically increment sequence.
     * @param type 'location' or 'employee'
     */
    /**
     * Generate next auto code. Accepts optional existingCodes array to find the real max sequence.
     * @param companyId
     * @param type 'location' | 'employee'
     * @param existingCodes Array of existing codes (e.g. ['EMP0001', 'EMP0002']) to determine the real max
     */
    async generateNextCode(companyId: string, type: 'location' | 'employee', existingCodes?: string[]): Promise<string> {
        const settings = await this.getCompanyDefaults(companyId);
        const modeField = `${type}_code_mode` as keyof CompanySettingsEntity;
        const prefixField = `${type}_code_prefix` as keyof CompanySettingsEntity;
        const seqField = `${type}_code_next_seq` as keyof CompanySettingsEntity;

        const mode = (settings[modeField] as string) || 'manual';
        if (mode !== 'auto') return '';

        const prefix = ((settings[prefixField] as string) || '').toUpperCase();
        let seq = (settings[seqField] as number) || 1;

        // If existing codes provided, find the real max sequence to avoid duplicates
        if (existingCodes?.length) {
            const prefixUpper = prefix.toUpperCase();
            let maxSeq = 0;
            for (const code of existingCodes) {
                if (!code) continue;
                const upper = code.toUpperCase();
                // Extract number part after prefix
                const numPart = upper.startsWith(prefixUpper)
                    ? upper.slice(prefixUpper.length)
                    : upper.replace(/^[A-Z]+/, '');
                const parsed = parseInt(numPart, 10);
                if (!isNaN(parsed) && parsed > maxSeq) maxSeq = parsed;
            }
            if (maxSeq >= seq) seq = maxSeq + 1;
        }

        const code = `${prefix}${String(seq).padStart(4, '0')}`;

        // Update the stored sequence to the next value
        await this.settingsRepository.update(settings, { [seqField]: seq + 1 } as any);

        return code;
    }

    /**
     * Get code settings for a company (used by frontend forms).
     * Accepts optional existingCodes to compute accurate next sequence.
     */
    async getCodeSettings(companyId: string, existingEmployeeCodes?: string[], existingLocationCodes?: string[]) {
        const settings = await this.getCompanyDefaults(companyId);
        const locPrefix = ((settings.location_code_prefix as string) || '').toUpperCase();
        let locSeq = (settings.location_code_next_seq as number) || 1;
        const empPrefix = ((settings.employee_code_prefix as string) || '').toUpperCase();
        let empSeq = (settings.employee_code_next_seq as number) || 1;

        // Find real next sequence from existing codes
        const findMaxSeq = (codes: string[], prefix: string, storedSeq: number): number => {
            let maxSeq = 0;
            const pfx = prefix.toUpperCase();
            for (const code of codes) {
                if (!code) continue;
                const upper = code.toUpperCase();
                const numPart = upper.startsWith(pfx) ? upper.slice(pfx.length) : upper.replace(/^[A-Z]+/, '');
                const parsed = parseInt(numPart, 10);
                if (!isNaN(parsed) && parsed > maxSeq) maxSeq = parsed;
            }
            return Math.max(maxSeq + 1, storedSeq);
        };

        if (existingEmployeeCodes?.length) {
            empSeq = findMaxSeq(existingEmployeeCodes, empPrefix, empSeq);
        }
        if (existingLocationCodes?.length) {
            locSeq = findMaxSeq(existingLocationCodes, locPrefix, locSeq);
        }

        return {
            location_code_mode: settings.location_code_mode || 'manual',
            location_code_prefix: locPrefix,
            location_code_preview: `${locPrefix}${String(locSeq).padStart(4, '0')}`,
            employee_code_mode: settings.employee_code_mode || 'manual',
            employee_code_prefix: empPrefix,
            employee_code_preview: `${empPrefix}${String(empSeq).padStart(4, '0')}`,
            employee_code_next_seq: empSeq,
        };
    }
}
