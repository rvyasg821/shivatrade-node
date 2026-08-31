import { BadRequestException, Injectable } from '@nestjs/common';
import { CompanySettingsRepository } from '../repository/repositories/company-settings.repository';
import { CompanySettingsEntity } from '../repository/entities/company-settings.entity';
import { HelperEncryptionService } from '@common/helper/services/helper.encryption.service';

const SENSITIVE_FIELDS = ['smtp_password', 'sms_api_key', 'sms_api_secret', 'whatsapp_api_key', 'whatsapp_api_secret'];

/**
 * These two fields are documented (and built, per the FE's own comments —
 * TOLERANCE_THREE_WAY_MATCH_PLAN.md §12.5) as COMPANY-WIDE ONLY — there is no
 * concept of a per-location tolerance policy or FY-closure cutoff. They are
 * always read from the company-defaults row (location_id: null) by
 * ToleranceGuardService.limitPctFor() and assertPostingDateOpen() below, so
 * they must always be WRITTEN there too, regardless of which location is
 * currently selected in the UI when an operator saves Settings — otherwise
 * a save silently lands on a location-scoped row nothing ever reads, and
 * the whole three-way-match / FY-closure gate looks configured but has zero
 * real effect. (Real bug found via a full test pass: GRN qty tolerance was
 * configured through the Settings UI, which always attaches the currently
 * selected location, and the GRN confirm endpoint never saw it.)
 */
const COMPANY_WIDE_ONLY_FIELDS: Array<keyof CompanySettingsEntity> = [
    'tolerance_config',
    'books_closed_upto',
];

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

    /** Overwrites the company-wide-only fields on `row` with the company
     *  defaults' values, in place — so a location-scoped row never displays
     *  (or resaves) a stale/orphaned copy of a field that's actually
     *  enforced from the defaults row alone. */
    private overlayCompanyWideFields(
        row: CompanySettingsEntity,
        defaults: CompanySettingsEntity
    ): CompanySettingsEntity {
        for (const field of COMPANY_WIDE_ONLY_FIELDS) {
            (row as any)[field] = (defaults as any)[field];
        }
        return row;
    }

    async getOrCreate(companyId: string, locationId?: string): Promise<CompanySettingsEntity & { is_inherited?: boolean }> {
        if (!locationId) {
            const defaults = await this.getCompanyDefaults(companyId);
            (defaults as any).is_inherited = false;
            return defaults as CompanySettingsEntity & { is_inherited: boolean };
        }

        const defaults = await this.getCompanyDefaults(companyId);
        const locationSettings = await this.settingsRepository.findOne({ company_id: companyId, location_id: locationId });
        if (locationSettings) {
            (locationSettings as any).is_inherited = false;
            this.overlayCompanyWideFields(locationSettings, defaults);
            return locationSettings as CompanySettingsEntity & { is_inherited: boolean };
        }

        (defaults as any).is_inherited = true;
        return defaults as CompanySettingsEntity & { is_inherited: boolean };
    }

    async update(companyId: string, data: Partial<CompanySettingsEntity>, locationId?: string): Promise<CompanySettingsEntity> {
        const encrypted = this.encryptSensitiveFields(data as any);

        // A cleared closure date arrives as '' — store NULL so the `date`
        // column is valid and the lock reads as "no closure".
        if ('books_closed_upto' in encrypted && !encrypted.books_closed_upto) {
            encrypted.books_closed_upto = null;
        }

        // Company-wide-only fields (tolerance_config, books_closed_upto) are
        // pulled out of the payload and ALWAYS written to the company-defaults
        // row, never a location-scoped one — see COMPANY_WIDE_ONLY_FIELDS doc
        // comment. Everything else in `encrypted` still follows `locationId`
        // as before.
        const companyWide: Record<string, any> = {};
        for (const field of COMPANY_WIDE_ONLY_FIELDS) {
            if (field in encrypted) {
                companyWide[field] = encrypted[field];
                delete encrypted[field];
            }
        }
        let defaults: CompanySettingsEntity | undefined;
        if (Object.keys(companyWide).length) {
            defaults = await this.getCompanyDefaults(companyId);
            defaults = (await this.settingsRepository.update(
                defaults,
                companyWide
            )) as CompanySettingsEntity;
        }

        if (!locationId) {
            if (!Object.keys(encrypted).length) return defaults || this.getCompanyDefaults(companyId);
            const base = defaults || (await this.getCompanyDefaults(companyId));
            return this.settingsRepository.update(base, encrypted) as Promise<CompanySettingsEntity>;
        }

        let locationSettings = await this.settingsRepository.findOne({ company_id: companyId, location_id: locationId });
        let result: CompanySettingsEntity;
        if (locationSettings) {
            result = Object.keys(encrypted).length
                ? ((await this.settingsRepository.update(
                      locationSettings,
                      encrypted
                  )) as CompanySettingsEntity)
                : locationSettings;
        } else {
            result = (await this.settingsRepository.create({
                company_id: companyId,
                location_id: locationId,
                ...encrypted,
            })) as CompanySettingsEntity;
        }
        // The response reflects what's actually enforced — overlay the
        // just-saved (or pre-existing) company-wide fields rather than
        // whatever this location row happens to still be carrying.
        this.overlayCompanyWideFields(
            result,
            defaults || (await this.getCompanyDefaults(companyId))
        );
        return result;
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
            product_code_prefix: s.product_code_prefix || 'PRD',
            product_code_next_seq: s.product_code_next_seq || 1,
            vendor_code_prefix: s.vendor_code_prefix || 'VND',
            vendor_code_next_seq: s.vendor_code_next_seq || 1,
            // Per-module voucher prefixes
            lead_voucher_prefix: s.lead_voucher_prefix || '',
            rfq_voucher_prefix: s.rfq_voucher_prefix || '',
            quotation_voucher_prefix: s.quotation_voucher_prefix || '',
            sales_order_voucher_prefix: s.sales_order_voucher_prefix || '',
            invoice_voucher_prefix: s.invoice_voucher_prefix || '',
            po_vendor_voucher_prefix: s.po_vendor_voucher_prefix || '',
            grn_voucher_prefix: s.grn_voucher_prefix || '',
            debit_note_voucher_prefix: s.debit_note_voucher_prefix || '',
            payment_voucher_prefix: s.payment_voucher_prefix || '',
            receipt_voucher_prefix: s.receipt_voucher_prefix || '',
            // Branding
            logo_url: s.logo_url,
            company_display_name: s.company_display_name,
            footer_address: s.footer_address,
            footer_contact: s.footer_contact,
            footer_extra: s.footer_extra,
            // Financial Year Closure
            books_closed_upto: s.books_closed_upto || null,
            // Compliance
            compliance_config: s.compliance_config || null,
            // Tolerance & Three-Way Match
            tolerance_config: s.tolerance_config || null,
            // Meta
            is_inherited: !!(s as any).is_inherited,
        };
    }

    // ─── Financial Year Closure ───────────────────────────────────────────

    /** dd-Mmm-yyyy for a YYYY-MM-DD string (for user-facing messages). */
    private static formatDate(ymd: string): string {
        const [y, m, d] = ymd.split('-');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const mi = parseInt(m, 10) - 1;
        if (!y || isNaN(mi) || mi < 0 || mi > 11 || !d) return ymd;
        return `${d}-${months[mi]}-${y}`;
    }

    /**
     * Financial-year closure guard. Throws if `date` falls on or before the
     * company's `books_closed_upto` cutoff (i.e. inside a closed period).
     * `date` is a YYYY-MM-DD string or Date; a null/empty date is ignored
     * (nothing to validate), and no cutoff configured = never blocks. Read-only:
     * reads the company-wide settings row directly and never writes.
     * @param docLabel human label for the message, e.g. 'invoice', 'receipt'.
     */
    async assertPostingDateOpen(
        companyId: string,
        date?: string | Date | null,
        docLabel = 'entry'
    ): Promise<void> {
        if (!date) return;
        const settings = await this.settingsRepository.findOne({
            company_id: companyId,
            location_id: null as any,
        });
        const cutoff = (settings as any)?.books_closed_upto;
        if (!cutoff) return;

        const d = (typeof date === 'string' ? date : new Date(date).toISOString()).slice(0, 10);
        const c = (typeof cutoff === 'string' ? cutoff : new Date(cutoff).toISOString()).slice(0, 10);
        // YYYY-MM-DD compares correctly as a plain string.
        if (d <= c) {
            throw new BadRequestException(
                `Financial year is closed up to ${CompanySettingsService.formatDate(c)}. ` +
                    `Cannot post or edit this ${docLabel} dated ${CompanySettingsService.formatDate(d)} — it falls in a closed period.`
            );
        }
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
     * Generate the next product code (always auto), e.g. PRD-0001. Robust
     * against existing data: derives the next sequence from both the stored
     * counter and the highest existing `PREFIX-####` code, and bumps past any
     * collision with the supplied existing codes.
     * @param existingCodes all current product codes for the company.
     */
    async generateProductCode(
        companyId: string,
        existingCodes: string[] = []
    ): Promise<string> {
        const settings = await this.getCompanyDefaults(companyId);
        const prefix = (
            (settings.product_code_prefix as string) || 'PRD'
        ).toUpperCase();
        let seq = (settings.product_code_next_seq as number) || 1;

        const used = new Set<string>();
        let maxSeq = 0;
        const re = new RegExp(`^${prefix}-(\\d+)$`, 'i');
        for (const c of existingCodes) {
            if (!c) continue;
            const trimmed = c.trim();
            used.add(trimmed.toUpperCase());
            const m = trimmed.match(re);
            if (m) {
                const n = parseInt(m[1], 10);
                if (!isNaN(n) && n > maxSeq) maxSeq = n;
            }
        }
        if (maxSeq >= seq) seq = maxSeq + 1;

        let code = `${prefix}-${String(seq).padStart(4, '0')}`;
        while (used.has(code.toUpperCase())) {
            seq += 1;
            code = `${prefix}-${String(seq).padStart(4, '0')}`;
        }

        await this.settingsRepository.update(settings, {
            product_code_next_seq: seq + 1,
        } as any);

        return code;
    }

    /**
     * Batch variant of `generateProductCode` — returns `count` sequential codes
     * in ONE settings read/write instead of one per product. Used by the bulk
     * product import so a 6000-row upload doesn't do 6000 code queries. Same
     * prefix / max-seq / collision logic; the next-seq counter is advanced by
     * the full batch so subsequent creates never reuse a code.
     */
    async generateProductCodes(
        companyId: string,
        existingCodes: string[] = [],
        count = 0
    ): Promise<string[]> {
        if (count <= 0) return [];
        const settings = await this.getCompanyDefaults(companyId);
        const prefix = (
            (settings.product_code_prefix as string) || 'PRD'
        ).toUpperCase();
        let seq = (settings.product_code_next_seq as number) || 1;

        const used = new Set<string>();
        let maxSeq = 0;
        const re = new RegExp(`^${prefix}-(\\d+)$`, 'i');
        for (const c of existingCodes) {
            if (!c) continue;
            const trimmed = c.trim();
            used.add(trimmed.toUpperCase());
            const m = trimmed.match(re);
            if (m) {
                const n = parseInt(m[1], 10);
                if (!isNaN(n) && n > maxSeq) maxSeq = n;
            }
        }
        if (maxSeq >= seq) seq = maxSeq + 1;

        const codes: string[] = [];
        for (let i = 0; i < count; i++) {
            let code = `${prefix}-${String(seq).padStart(4, '0')}`;
            while (used.has(code.toUpperCase())) {
                seq += 1;
                code = `${prefix}-${String(seq).padStart(4, '0')}`;
            }
            used.add(code.toUpperCase());
            codes.push(code);
            seq += 1;
        }

        await this.settingsRepository.update(settings, {
            product_code_next_seq: seq,
        } as any);

        return codes;
    }

    /**
     * Generate the next vendor code (always auto), e.g. VND-0001. Same robust
     * logic as `generateProductCode`.
     */
    async generateVendorCode(
        companyId: string,
        existingCodes: string[] = []
    ): Promise<string> {
        const settings = await this.getCompanyDefaults(companyId);
        const prefix = (
            (settings.vendor_code_prefix as string) || 'VND'
        ).toUpperCase();
        let seq = (settings.vendor_code_next_seq as number) || 1;

        const used = new Set<string>();
        let maxSeq = 0;
        const re = new RegExp(`^${prefix}-(\\d+)$`, 'i');
        for (const c of existingCodes) {
            if (!c) continue;
            const trimmed = c.trim();
            used.add(trimmed.toUpperCase());
            const m = trimmed.match(re);
            if (m) {
                const n = parseInt(m[1], 10);
                if (!isNaN(n) && n > maxSeq) maxSeq = n;
            }
        }
        if (maxSeq >= seq) seq = maxSeq + 1;

        let code = `${prefix}-${String(seq).padStart(4, '0')}`;
        while (used.has(code.toUpperCase())) {
            seq += 1;
            code = `${prefix}-${String(seq).padStart(4, '0')}`;
        }

        await this.settingsRepository.update(settings, {
            vendor_code_next_seq: seq + 1,
        } as any);

        return code;
    }

    /**
     * Batch variant of `generateVendorCode` — returns `count` sequential codes
     * in ONE settings read/write. Used by the bulk vendor import so a large
     * upload doesn't do a full-table code scan per row (mirrors
     * `generateProductCodes`).
     */
    async generateVendorCodes(
        companyId: string,
        existingCodes: string[] = [],
        count = 0
    ): Promise<string[]> {
        if (count <= 0) return [];
        const settings = await this.getCompanyDefaults(companyId);
        const prefix = (
            (settings.vendor_code_prefix as string) || 'VND'
        ).toUpperCase();
        let seq = (settings.vendor_code_next_seq as number) || 1;

        const used = new Set<string>();
        let maxSeq = 0;
        const re = new RegExp(`^${prefix}-(\\d+)$`, 'i');
        for (const c of existingCodes) {
            if (!c) continue;
            const trimmed = c.trim();
            used.add(trimmed.toUpperCase());
            const m = trimmed.match(re);
            if (m) {
                const n = parseInt(m[1], 10);
                if (!isNaN(n) && n > maxSeq) maxSeq = n;
            }
        }
        if (maxSeq >= seq) seq = maxSeq + 1;

        const codes: string[] = [];
        for (let i = 0; i < count; i++) {
            let code = `${prefix}-${String(seq).padStart(4, '0')}`;
            while (used.has(code.toUpperCase())) {
                seq += 1;
                code = `${prefix}-${String(seq).padStart(4, '0')}`;
            }
            used.add(code.toUpperCase());
            codes.push(code);
            seq += 1;
        }

        await this.settingsRepository.update(settings, {
            vendor_code_next_seq: seq,
        } as any);

        return codes;
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
