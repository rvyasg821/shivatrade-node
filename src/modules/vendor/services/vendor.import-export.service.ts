import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import { VendorService } from './vendor.service';
import { VendorRepository } from '../repository/repositories/vendor.repository';
import { ENUM_VENDOR_STATUS } from '../enums/vendor.enum';

// Vendor import is intentionally minimal: a company + its primary contact +
// one optional address. Vendor `code` is auto-generated (VND-0001), so it is
// NOT an import column. Required: company_name, name, email, phone.
const BASE_HEADERS = [
    'company_name',
    'name',
    'email',
    'phone',
    'address_line1',
    'address_line2',
    'city',
    'state',
    'country',
    'postcode',
    'gstin',
    'pan',
    'website',
];

const SAMPLE_ROWS: Record<string, any>[] = [
    {
        company_name: 'Acme Steel Pvt Ltd',
        name: 'Ravi Sharma',
        email: 'ravi@acmesteel.example.com',
        phone: '+91 98765 43210',
        address_line1: 'Plot 12, GIDC Industrial Estate',
        address_line2: 'Phase II',
        city: 'Rajkot',
        state: 'Gujarat',
        country: 'India',
        postcode: '360003',
        gstin: '24ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
        website: 'https://acmesteel.example.com',
    },
    {
        company_name: 'Bright Packaging Co',
        name: 'Neha Patel',
        email: 'neha@brightpack.example.com',
        phone: '+91 99887 76655',
        address_line1: '',
        address_line2: '',
        city: '',
        state: '',
        country: '',
        postcode: '',
        gstin: '',
        pan: '',
        website: '',
    },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface VendorImportRow {
    rowNum: number;
    data: {
        company_name: string;
        name: string;
        email: string;
        phone: string;
        address_line1?: string;
        address_line2?: string;
        city?: string;
        state?: string;
        country?: string;
        postcode?: string;
        gstin?: string;
        pan?: string;
        website?: string;
    };
    status: 'valid_new' | 'error';
    errors: string[];
    warnings: string[];
}

@Injectable()
export class VendorImportExportService {
    private readonly logger = new Logger(VendorImportExportService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly vendorService: VendorService,
        private readonly vendorRepository: VendorRepository
    ) {}

    /** Sample Excel — the columns with two filled example rows. */
    generateSampleExcel(): Buffer {
        const aoa: any[][] = [[...BASE_HEADERS]];
        for (const r of SAMPLE_ROWS) {
            aoa.push(BASE_HEADERS.map(h => r[h] ?? ''));
        }
        return this.fileService.writeExcelFromArray(aoa);
    }

    /**
     * Parse + validate an uploaded file. Row-level problems land in each row's
     * `errors`; only file-level problems throw. Import is create-only — a row
     * whose company name already exists is flagged as an error.
     */
    async parseAndValidate(
        fileBuffer: Buffer,
        companyId: string
    ): Promise<{ summary: any; rows: VendorImportRow[] }> {
        let sheets;
        try {
            sheets = this.fileService.readExcel(fileBuffer);
        } catch {
            throw new BadRequestException(
                'Unable to read the file. Please upload a valid Excel or CSV file.'
            );
        }

        const rawRows = (sheets?.[0]?.data || []) as Record<string, any>[];
        if (!rawRows.length) {
            throw new BadRequestException('The file contains no data rows.');
        }

        const headerKeys = Object.keys(rawRows[0]).map(k =>
            k.trim().toLowerCase()
        );
        const requiredCols = ['company_name', 'name', 'email', 'phone'];
        const missing = requiredCols.filter(c => !headerKeys.includes(c));
        if (missing.length > 0) {
            throw new BadRequestException(
                `Missing required column(s): ${missing.join(
                    ', '
                )}. Expected columns: ${BASE_HEADERS.join(', ')}.`
            );
        }

        const existing = await this.vendorRepository.findByCompanyId(companyId);
        const existingByName = new Set<string>(
            (existing as any[]).map(v =>
                (v.company_name || '').trim().toLowerCase()
            )
        );

        const seenNames = new Set<string>();
        const rows: VendorImportRow[] = [];

        for (let i = 0; i < rawRows.length; i++) {
            const raw = rawRows[i];
            const rowNum = i + 2; // 1-indexed + header row
            const errors: string[] = [];
            const warnings: string[] = [];

            const get = (col: string): string => {
                const key = Object.keys(raw).find(
                    k => k.trim().toLowerCase() === col
                );
                return key ? String(raw[key] ?? '').trim() : '';
            };

            const companyName = get('company_name');
            const name = get('name');
            const email = get('email');
            const phone = get('phone');

            // ── Required fields ──
            if (!companyName) errors.push('Company name is required');
            else if (companyName.length > 200)
                errors.push('Company name must not exceed 200 characters');

            if (!name) errors.push('Contact name is required');
            else if (name.length > 150)
                errors.push('Contact name must not exceed 150 characters');

            if (!email) errors.push('Email is required');
            else if (!EMAIL_RE.test(email))
                errors.push('Email is not a valid email address');

            if (!phone) errors.push('Phone is required');

            // ── Optional caps ──
            const gstin = get('gstin');
            if (gstin && gstin.length > 15)
                errors.push('GSTIN must not exceed 15 characters');
            const pan = get('pan');
            if (pan && pan.length > 10)
                errors.push('PAN must not exceed 10 characters');
            const website = get('website');
            if (website && website.length > 500)
                errors.push('Website must not exceed 500 characters');

            // ── Duplicate company name within the file ──
            const nameKey = companyName.toLowerCase();
            if (companyName && seenNames.has(nameKey)) {
                errors.push('Duplicate company name in file');
            }
            if (companyName) seenNames.add(nameKey);

            // ── Already exists (create-only import) ──
            if (companyName && existingByName.has(nameKey)) {
                errors.push('A vendor with this company name already exists');
            }

            rows.push({
                rowNum,
                data: {
                    company_name: companyName,
                    name,
                    email,
                    phone,
                    address_line1: get('address_line1') || undefined,
                    address_line2: get('address_line2') || undefined,
                    city: get('city') || undefined,
                    state: get('state') || undefined,
                    // Country defaults to India when the column is blank.
                    country: get('country') || 'India',
                    postcode: get('postcode') || undefined,
                    gstin: gstin || undefined,
                    pan: pan || undefined,
                    website: website || undefined,
                },
                status: errors.length > 0 ? 'error' : 'valid_new',
                errors,
                warnings,
            });
        }

        const summary = {
            total: rows.length,
            valid_new: rows.filter(r => r.status === 'valid_new').length,
            valid_update: 0,
            errors: rows.filter(r => r.status === 'error').length,
            warnings: rows.reduce((n, r) => n + r.warnings.length, 0),
        };

        return { summary, rows };
    }

    /** Persist the validated rows. One bad row never aborts the batch. */
    async importVendors(
        rows: VendorImportRow[],
        companyId: string,
        userId: string
    ): Promise<{
        created: number;
        updated: number;
        errors: { row: number; message: string }[];
    }> {
        let created = 0;
        const errors: { row: number; message: string }[] = [];

        for (const row of rows) {
            if (row.status === 'error') continue;
            const d = row.data;
            try {
                // Include an address only when at least one address field is set.
                const hasAddress = !!(
                    d.address_line1 ||
                    d.address_line2 ||
                    d.city ||
                    d.state ||
                    d.postcode
                );
                await this.vendorService.create(
                    companyId,
                    {
                        company_name: d.company_name,
                        // Code auto-generated (VND-0001).
                        website: d.website,
                        gstin: d.gstin,
                        pan: d.pan,
                        status: ENUM_VENDOR_STATUS.ACTIVE,
                        contacts: [
                            {
                                name: d.name,
                                email: d.email,
                                phone: d.phone,
                                is_primary: true,
                            },
                        ],
                        addresses: hasAddress
                            ? [
                                  {
                                      address_line1: d.address_line1,
                                      address_line2: d.address_line2,
                                      city: d.city,
                                      state: d.state,
                                      country: d.country,
                                      postcode: d.postcode,
                                      gstin: d.gstin,
                                      is_default: true,
                                  },
                              ]
                            : [],
                    } as any,
                    userId
                );
                created++;
            } catch (err: any) {
                this.logger.error(
                    `Vendor import row ${row.rowNum} failed: ${err?.message}`
                );
                errors.push({
                    row: row.rowNum,
                    message: err?.message || 'Import failed',
                });
            }
        }

        return { created, updated: 0, errors };
    }
}
