import { Injectable, Logger } from '@nestjs/common';
import { utils, write, read } from 'xlsx';
import { UserService } from '@modules/user/services/user.service';
import { RoleService } from '@modules/role/services/role.service';
import { AuthService } from '@modules/auth/services/auth.service';
import { LocationService } from '@modules/location/services/location.service';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import { CompanyLookupService } from '@modules/company-lookup/services/company-lookup.service';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { ENUM_USER_SIGN_UP_FROM } from '@modules/user/enums/user.enum';
import { EnhancedEmailService } from '@modules/email/services/enhanced-email.service';

const CSV_HEADERS = [
    // Basic
    'employee_code', 'email', 'first_name', 'middle_name', 'last_name',
    'designation', 'department', 'employment_type',
    'date_of_joining', 'date_of_birth', 'mobile', 'dial_code', 'gender',
    // Personal
    'marital_status', 'nationality', 'ni_number', 'home_telephone',
    // Address
    'address_line1', 'address_line2', 'city', 'state', 'postcode', 'country',
    // Salary & Working
    'annual_salary', 'hourly_rate', 'weekly_working_hours', 'payroll_frequency', 'mode_of_transfer',
    // Bank & Tax
    'bank_name', 'account_holder_name', 'sort_code', 'account_number', 'tax_code', 'ni_category',
    // Pension
    'pension_opt_in', 'pension_provider', 'pension_employee_contribution', 'pension_employer_contribution',
    // Emergency Contact
    'kin_name', 'kin_relationship', 'kin_phone', 'kin_email',
];

const SAMPLE_ROWS = [
    {
        employee_code: 'EMP001', email: 'john.doe@company.com', first_name: 'John', middle_name: '', last_name: 'Doe',
        designation: 'Developer', department: 'IT', employment_type: 'full-time',
        date_of_joining: '2026-01-15', date_of_birth: '1990-05-20', mobile: '7911123456', dial_code: '+44', gender: 'MALE',
        marital_status: 'SINGLE', nationality: 'British', ni_number: 'AB123456C', home_telephone: '',
        address_line1: '123 High St', address_line2: '', city: 'London', state: 'Greater London', postcode: 'SW1A 1AA', country: 'GB',
        annual_salary: '35000', hourly_rate: '', weekly_working_hours: '40', payroll_frequency: 'monthly', mode_of_transfer: 'bank',
        bank_name: 'HSBC', account_holder_name: 'John Doe', sort_code: '40-01-02', account_number: '12345678', tax_code: '1257L', ni_category: 'A',
        pension_opt_in: 'true', pension_provider: 'Nest', pension_employee_contribution: '5', pension_employer_contribution: '3',
        kin_name: 'Jane Doe', kin_relationship: 'Spouse', kin_phone: '7911999999', kin_email: 'jane.doe@email.com',
    },
    {
        employee_code: '', email: 'jane.smith@company.com', first_name: 'Jane', middle_name: 'Marie', last_name: 'Smith',
        designation: 'Manager', department: 'HR', employment_type: 'full-time',
        date_of_joining: '2025-06-01', date_of_birth: '1988-12-10', mobile: '7911654321', dial_code: '+44', gender: 'FEMALE',
        marital_status: 'MARRIED', nationality: 'British', ni_number: 'CD654321B', home_telephone: '02012345678',
        address_line1: '456 Main Rd', address_line2: 'Apt 5', city: 'Manchester', state: '', postcode: 'M1 1AA', country: 'GB',
        annual_salary: '45000', hourly_rate: '', weekly_working_hours: '37.5', payroll_frequency: 'monthly', mode_of_transfer: 'bank',
        bank_name: 'Barclays', account_holder_name: 'Jane Smith', sort_code: '20-05-06', account_number: '87654321', tax_code: '1257L', ni_category: 'A',
        pension_opt_in: 'true', pension_provider: 'Nest', pension_employee_contribution: '5', pension_employer_contribution: '3',
        kin_name: 'Tom Smith', kin_relationship: 'Spouse', kin_phone: '7911888888', kin_email: 'tom.smith@email.com',
    },
];

/** Map of dial codes to country codes for CSV import */
const DIAL_CODE_TO_COUNTRY: Record<string, string> = {
    '1': 'US', '44': 'GB', '91': 'IN', '61': 'AU', '64': 'NZ', '353': 'IE',
    '971': 'AE', '966': 'SA', '65': 'SG', '60': 'MY', '49': 'DE', '33': 'FR',
    '39': 'IT', '34': 'ES', '31': 'NL', '86': 'CN', '81': 'JP', '82': 'KR',
    '55': 'BR', '27': 'ZA', '254': 'KE', '234': 'NG', '63': 'PH', '92': 'PK',
    '880': 'BD', '94': 'LK', '977': 'NP',
};

export interface ImportRow {
    rowNum: number;
    data: Record<string, any>;
    status: 'valid_new' | 'valid_update' | 'error';
    existingId?: string;
    errors: string[];
}

@Injectable()
export class EmployeeImportExportService {
    private readonly logger = new Logger(EmployeeImportExportService.name);

    constructor(
        private readonly userService: UserService,
        private readonly roleService: RoleService,
        private readonly authService: AuthService,
        private readonly locationService: LocationService,
        private readonly companySettingsService: CompanySettingsService,
        private readonly companyLookupService: CompanyLookupService,
        private readonly emailService: EnhancedEmailService,
    ) {}

    /** Find or create a company lookup entry (designation/department) */
    private async findOrCreateLookup(companyId: string, type: string, name: string): Promise<void> {
        if (!name?.trim()) return;
        try {
            await this.companyLookupService.create(companyId, type, name.trim());
        } catch {
            // Already exists — that's fine
        }
    }

    generateSampleCsv(): Buffer {
        const ws = utils.json_to_sheet(SAMPLE_ROWS, { header: CSV_HEADERS });
        const csv = utils.sheet_to_csv(ws);
        return Buffer.from(csv, 'utf8');
    }

    async exportEmployees(companyId: string, locationIds?: string[]): Promise<Buffer> {
        const employeeRole = await this.roleService.findOne({ name: ENUM_SYSTEM_ROLE.EMPLOYEE });
        if (!employeeRole) throw new Error('Employee role not found');

        const find: any = { companyId, role: employeeRole._id };
        if (locationIds && locationIds.length > 0) {
            find.location_id = { $in: locationIds };
        }

        const employees = await this.userService.findAll(find, {});

        // Build location map
        const locations = await this.locationService.findAll(companyId) as any[];
        const locMap: Record<string, string> = {};
        for (const loc of locations) {
            locMap[loc._id?.toString()] = loc.location_name;
        }

        const rows = employees.map((emp: any) => ({
            // Basic
            employee_code: emp.employee_code || '',
            email: emp.email || '',
            first_name: emp.first_name || '',
            middle_name: emp.middle_name || '',
            last_name: emp.last_name || '',
            designation: emp.designation || '',
            department: emp.department || '',
            location_name: emp.location_id ? (locMap[emp.location_id?.toString()] || '') : '',
            employment_type: emp.employment_type || '',
            date_of_joining: emp.date_of_joining ? String(emp.date_of_joining).split('T')[0] : '',
            date_of_birth: emp.date_of_birth ? String(emp.date_of_birth).split('T')[0] : '',
            mobile: emp.mobile || '',
            dial_code: emp.country_code?.dialCode || '',
            gender: emp.gender || '',
            // Personal
            marital_status: emp.marital_status || '',
            nationality: emp.nationality || '',
            ni_number: emp.ni_number || '',
            home_telephone: emp.home_telephone || '',
            // Address
            address_line1: emp.address_line1 || '',
            address_line2: emp.address_line2 || '',
            city: emp.city || '',
            state: emp.state || '',
            postcode: emp.postcode || '',
            country: emp.country || '',
            // Salary & Working
            annual_salary: emp.annual_salary != null ? String(emp.annual_salary) : '',
            hourly_rate: emp.hourly_rate != null ? String(emp.hourly_rate) : '',
            weekly_working_hours: emp.weekly_working_hours != null ? String(emp.weekly_working_hours) : '',
            payroll_frequency: emp.payroll_frequency || '',
            mode_of_transfer: emp.mode_of_transfer || '',
            // Bank & Tax
            bank_name: emp.bank_name || '',
            account_holder_name: emp.account_holder_name || '',
            sort_code: emp.sort_code || '',
            account_number: emp.account_number || '',
            tax_code: emp.tax_code || '',
            ni_category: emp.ni_category || '',
            // Pension
            pension_opt_in: emp.pension_opt_in != null ? String(emp.pension_opt_in) : '',
            pension_provider: emp.pension_provider || '',
            pension_employee_contribution: emp.pension_employee_contribution != null ? String(emp.pension_employee_contribution) : '',
            pension_employer_contribution: emp.pension_employer_contribution != null ? String(emp.pension_employer_contribution) : '',
            // Emergency Contact
            kin_name: emp.kin_name || '',
            kin_relationship: emp.kin_relationship || '',
            kin_phone: emp.kin_phone || '',
            kin_email: emp.kin_email || '',
        }));

        const ws = utils.json_to_sheet(rows, { header: CSV_HEADERS });
        const csv = utils.sheet_to_csv(ws);
        return Buffer.from(csv, 'utf8');
    }

    /** Normalize employment_type: accept underscores, spaces, or hyphens → always store with hyphens */
    /**
     * Parse mobile number from CSV, handling various formats:
     * - Plain digits: "7911123456" (uses dial_code column or location country)
     * - With dial code prefix: "+447911123456" or "447911123456"
     * - dial_code column: "+44" or "44"
     * Returns { mobile: digits only, countryCode: jsonb object }
     */
    private parseMobileNumber(
        rawMobile: string,
        csvDialCode: string,
        locationCountryCode: any,
    ): { mobile: string; countryCode: any } {
        if (!rawMobile) {
            return { mobile: '', countryCode: locationCountryCode || null };
        }

        // Clean mobile: remove spaces, dashes, parentheses
        let mobile = rawMobile.replace(/[\s\-()]/g, '');

        // Determine dial code: CSV column > detect from mobile > location
        let dialCode = '';
        let countryIso = '';

        // 1. Check CSV dial_code column
        if (csvDialCode) {
            dialCode = csvDialCode.replace(/[^0-9]/g, ''); // strip + and non-digits
            countryIso = DIAL_CODE_TO_COUNTRY[dialCode] || '';
        }

        // 2. If mobile starts with +, extract dial code from it
        if (!dialCode && mobile.startsWith('+')) {
            mobile = mobile.substring(1); // remove +
            // Try 3-digit, 2-digit, 1-digit dial codes
            for (const len of [3, 2, 1]) {
                const prefix = mobile.substring(0, len);
                if (DIAL_CODE_TO_COUNTRY[prefix]) {
                    dialCode = prefix;
                    countryIso = DIAL_CODE_TO_COUNTRY[prefix];
                    mobile = mobile.substring(len);
                    break;
                }
            }
        }

        // 3. If we have a dial code, strip it from mobile if it starts with it
        if (dialCode && mobile.startsWith(dialCode)) {
            mobile = mobile.substring(dialCode.length);
        }

        // 4. If still no dial code, use location's
        if (!dialCode && locationCountryCode) {
            const locDial = (locationCountryCode.dialCode || '').replace(/[^0-9]/g, '');
            if (locDial) {
                dialCode = locDial;
                countryIso = locationCountryCode.code || locationCountryCode.countryCode || '';
                // Strip location dial code from mobile if present
                if (mobile.startsWith(locDial)) {
                    mobile = mobile.substring(locDial.length);
                }
            }
        }

        // Remove any remaining leading zeros (UK-style: 07911... → 7911...)
        // But only if we have a dial code (don't strip for unknown formats)
        if (dialCode && mobile.startsWith('0')) {
            mobile = mobile.substring(1);
        }

        // Build country_code object
        let countryCode: any = locationCountryCode || null;
        if (dialCode) {
            countryCode = {
                dialCode: `+${dialCode}`,
                countryCode: countryIso.toLowerCase() || (locationCountryCode?.countryCode || locationCountryCode?.code || '').toLowerCase(),
                code: countryIso || locationCountryCode?.code || '',
            };
        }

        return { mobile, countryCode };
    }

    private normalizeEmploymentType(value: string): string {
        if (!value) return '';
        const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
        const valid = ['full-time', 'part-time', 'contract', 'intern'];
        return valid.includes(normalized) ? normalized : value.trim();
    }

    async parseAndValidate(
        fileBuffer: Buffer,
        companyId: string,
        locationId?: string,
    ): Promise<{ summary: any; rows: ImportRow[] }> {
        // Parse CSV
        const workbook = read(fileBuffer, { type: 'buffer', raw: true });
        const sheetName = workbook.SheetNames[0];
        const rawRows: Record<string, any>[] = utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: true });

        if (rawRows.length === 0) {
            return { summary: { total: 0, valid_new: 0, valid_update: 0, errors: 0 }, rows: [] };
        }

        // Get location's country_code for mobile number formatting
        let locationCountryCode: any = null;
        if (locationId) {
            try {
                const location = await this.locationService.findOneById(locationId);
                if (location?.country_code) {
                    locationCountryCode = location.country_code;
                }
            } catch { }
        }

        // Track seen emails/codes for duplicate detection within file
        const seenEmails = new Set<string>();
        const seenCodes = new Set<string>();

        const result: ImportRow[] = [];

        for (let i = 0; i < rawRows.length; i++) {
            const raw = rawRows[i];
            const rowNum = i + 2; // 1-indexed + header row
            const errors: string[] = [];

            const email = String(raw.email || '').trim().toLowerCase();
            const employeeCode = String(raw.employee_code || '').trim().toUpperCase();
            const firstName = String(raw.first_name || '').trim();

            // Required field validation
            if (!email) errors.push('Email is required');
            else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Invalid email format');
            if (!firstName) errors.push('First name is required');

            // Duplicate within file
            if (email && seenEmails.has(email)) errors.push('Duplicate email in file');
            if (employeeCode && seenCodes.has(employeeCode)) errors.push('Duplicate employee code in file');

            // Check existing user
            let existingId: string | undefined;
            let status: 'valid_new' | 'valid_update' | 'error' = 'valid_new';

            if (errors.length === 0 && email) {
                const existingUser = await this.userService.findOneByEmail(email).catch(() => null);
                if (existingUser) {
                    if (existingUser.companyId === companyId) {
                        existingId = existingUser._id?.toString();
                        status = 'valid_update';
                    } else {
                        errors.push('Email belongs to a user in another company');
                    }
                } else if (employeeCode) {
                    const byCode = await this.userService.findOne({ employee_code: employeeCode, companyId }).catch(() => null);
                    if (byCode) {
                        existingId = byCode._id?.toString();
                        status = 'valid_update';
                    }
                }
            }

            if (errors.length > 0) status = 'error';

            if (email) seenEmails.add(email);
            if (employeeCode) seenCodes.add(employeeCode);

            // Parse mobile number and country code
            const { mobile: parsedMobile, countryCode: parsedCountryCode } = this.parseMobileNumber(
                String(raw.mobile || '').trim(),
                String(raw.dial_code || '').trim(),
                locationCountryCode,
            );

            const str = (field: string) => String(raw[field] || '').trim();
            const num = (field: string) => { const v = String(raw[field] || '').trim(); return v ? parseFloat(v) : undefined; };

            result.push({
                rowNum,
                data: {
                    // Basic
                    employee_code: employeeCode,
                    email,
                    first_name: firstName,
                    middle_name: str('middle_name'),
                    last_name: str('last_name'),
                    designation: str('designation'),
                    department: str('department'),
                    location_id: locationId || null,
                    country_code: parsedCountryCode,
                    employment_type: this.normalizeEmploymentType(str('employment_type')),
                    date_of_joining: str('date_of_joining'),
                    date_of_birth: str('date_of_birth'),
                    mobile: parsedMobile,
                    gender: str('gender').toUpperCase(),
                    // Personal
                    marital_status: str('marital_status').toUpperCase(),
                    nationality: str('nationality'),
                    ni_number: str('ni_number').toUpperCase(),
                    home_telephone: str('home_telephone'),
                    // Address
                    address_line1: str('address_line1'),
                    address_line2: str('address_line2'),
                    city: str('city'),
                    state: str('state'),
                    postcode: str('postcode'),
                    country: str('country'),
                    // Salary & Working
                    annual_salary: num('annual_salary'),
                    hourly_rate: num('hourly_rate'),
                    weekly_working_hours: num('weekly_working_hours'),
                    payroll_frequency: str('payroll_frequency').toLowerCase(),
                    mode_of_transfer: str('mode_of_transfer').toLowerCase(),
                    // Bank & Tax
                    bank_name: str('bank_name'),
                    account_holder_name: str('account_holder_name'),
                    sort_code: str('sort_code'),
                    account_number: str('account_number'),
                    tax_code: str('tax_code'),
                    ni_category: str('ni_category').toUpperCase(),
                    // Pension
                    pension_opt_in: ['true', '1', 'yes'].includes(str('pension_opt_in').toLowerCase()) ? true : str('pension_opt_in') ? false : undefined,
                    pension_provider: str('pension_provider'),
                    pension_employee_contribution: num('pension_employee_contribution'),
                    pension_employer_contribution: num('pension_employer_contribution'),
                    // Emergency Contact
                    kin_name: str('kin_name'),
                    kin_relationship: str('kin_relationship'),
                    kin_phone: str('kin_phone'),
                    kin_email: str('kin_email'),
                },
                status,
                existingId,
                errors,
            });
        }

        const summary = {
            total: result.length,
            valid_new: result.filter((r) => r.status === 'valid_new').length,
            valid_update: result.filter((r) => r.status === 'valid_update').length,
            errors: result.filter((r) => r.status === 'error').length,
        };

        return { summary, rows: result };
    }

    async importEmployees(
        rows: ImportRow[],
        companyId: string,
        adminUserId: string,
        sendWelcomeEmail: boolean = false,
    ): Promise<{ created: number; updated: number; errors: { row: number; message: string }[] }> {
        const employeeRole = await this.roleService.findOne({ name: ENUM_SYSTEM_ROLE.EMPLOYEE });
        if (!employeeRole) throw new Error('Employee role not found');

        let created = 0;
        let updated = 0;
        const errors: { row: number; message: string }[] = [];

        for (const row of rows) {
            if (row.status === 'error') continue;

            try {
                // Auto-create designation/department lookups
                if (row.data.designation) {
                    await this.findOrCreateLookup(companyId, 'designation', row.data.designation);
                }
                if (row.data.department) {
                    await this.findOrCreateLookup(companyId, 'department', row.data.department);
                }

                if (row.status === 'valid_update' && row.existingId) {
                    // Update existing employee
                    const existing = await this.userService.findOneById(row.existingId);
                    if (!existing) {
                        errors.push({ row: row.rowNum, message: 'User not found for update' });
                        continue;
                    }

                    const updateData: any = {
                        first_name: row.data.first_name,
                        last_name: row.data.last_name,
                    };
                    // Only set fields that have values (don't overwrite with empty)
                    const setIfPresent = (fields: string[]) => {
                        for (const f of fields) {
                            if (row.data[f] !== undefined && row.data[f] !== '') updateData[f] = row.data[f];
                        }
                    };
                    setIfPresent([
                        'middle_name', 'designation', 'department', 'employment_type',
                        'date_of_joining', 'date_of_birth', 'gender',
                        'marital_status', 'nationality', 'ni_number', 'home_telephone',
                        'address_line1', 'address_line2', 'city', 'state', 'postcode', 'country',
                        'annual_salary', 'hourly_rate', 'weekly_working_hours', 'payroll_frequency', 'mode_of_transfer',
                        'bank_name', 'account_holder_name', 'sort_code', 'account_number', 'tax_code', 'ni_category',
                        'pension_opt_in', 'pension_provider', 'pension_employee_contribution', 'pension_employer_contribution',
                        'kin_name', 'kin_relationship', 'kin_phone', 'kin_email',
                        'location_id', 'employee_code', 'mobile', 'country_code',
                    ]);

                    await this.userService.update(existing, updateData);
                    updated++;
                } else {
                    // Create new employee
                    const rawPassword = 'Welcome@123';
                    const passwordHash = this.authService.createPassword(rawPassword);

                    let employeeCode = row.data.employee_code;
                    if (!employeeCode) {
                        employeeCode = await this.companySettingsService.generateNextCode(companyId, 'employee') || '';
                    }

                    const userData: any = {
                        first_name: row.data.first_name,
                        last_name: row.data.last_name,
                        name: `${row.data.first_name}${row.data.last_name ? ' ' + row.data.last_name : ''}`,
                        email: row.data.email,
                        mobile: row.data.mobile || undefined,
                        country_code: row.data.country_code || undefined,
                        gender: row.data.gender || undefined,
                        role: employeeRole._id.toString(),
                        companyId,
                        roleLevel: employeeRole.level,
                    };

                    const user = await this.userService.create(userData, passwordHash, ENUM_USER_SIGN_UP_FROM.ADMIN);

                    // Update employee-specific fields — set all non-empty values from CSV
                    const empUpdate: any = { employee_code: employeeCode };
                    const allFields = [
                        'middle_name', 'designation', 'department', 'employment_type',
                        'date_of_joining', 'date_of_birth', 'location_id',
                        'marital_status', 'nationality', 'ni_number', 'home_telephone',
                        'address_line1', 'address_line2', 'city', 'state', 'postcode', 'country',
                        'annual_salary', 'hourly_rate', 'weekly_working_hours', 'payroll_frequency', 'mode_of_transfer',
                        'bank_name', 'account_holder_name', 'sort_code', 'account_number', 'tax_code', 'ni_category',
                        'pension_opt_in', 'pension_provider', 'pension_employee_contribution', 'pension_employer_contribution',
                        'kin_name', 'kin_relationship', 'kin_phone', 'kin_email',
                    ];
                    for (const f of allFields) {
                        if (row.data[f] !== undefined && row.data[f] !== '') empUpdate[f] = row.data[f];
                    }

                    await this.userService.update(user, empUpdate);

                    // shared_users sync no longer needed — login authenticates from users table

                    // Send welcome email with login credentials (fire-and-forget)
                    if (sendWelcomeEmail) {
                        this.emailService.sendWelcome(
                            { name: user.name, email: user.email, password: rawPassword },
                            companyId,
                            row.data.location_id || undefined,
                        ).catch((err) => {
                            this.logger.warn(`Welcome email failed for ${user.email}: ${err.message}`);
                        });
                    }

                    created++;
                }
            } catch (err) {
                this.logger.error(`Import row ${row.rowNum} failed: ${err.message}`);
                errors.push({ row: row.rowNum, message: err.message });
            }
        }

        return { created, updated, errors };
    }
}
