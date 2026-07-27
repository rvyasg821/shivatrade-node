import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import { CustomerService } from './customer.service';
import { CustomerRepository } from '../repository/repositories/customer.repository';
import { CustomerContactRepository } from '../repository/repositories/customer-contact.repository';
import { CustomerAddressRepository } from '../repository/repositories/customer-address.repository';
import {
    ENUM_CUSTOMER_STATUS,
    ENUM_CUSTOMER_ADDRESS_TYPE,
} from '../enums/customer.enum';

// Customer import mirrors the Vendor importer (company + primary contact +
// bill-to / ship-to address) with the export-business extras: iec, currency,
// status. Runs the create path in SILENT import mode — historical customers
// get NO login user and NO welcome email (§6.1 / §12.4).
//
// Upsert by company_name (same convention as the Products importer, matched by
// code): a row whose company_name already exists is UPDATED in place — the
// customer's own fields, its primary contact, and its bill-to / ship-to
// addresses are overwritten from the sheet. The update stays SILENT too: it
// edits the existing contact row directly and never provisions / re-syncs a
// login user. This makes export → edit → re-import a safe edit round-trip.
const BASE_HEADERS = [
    'company_name',
    'contact_name',
    'contact_email',
    'contact_phone',
    'gstin',
    'pan',
    'iec',
    'currency',
    'status',
    'bill_to_address',
    'ship_to_address',
    'country',
    'state',
    'city',
];

const SAMPLE_ROWS: Record<string, any>[] = [
    {
        company_name: 'Orient Global Trading LLC',
        contact_name: 'Ahmed Khan',
        contact_email: 'ahmed@orientglobal.example.com',
        contact_phone: '+971 50 123 4567',
        gstin: '',
        pan: '',
        iec: '0399001234',
        currency: 'USD',
        status: 'active',
        bill_to_address: 'Office 402, Al Maktoum Road',
        ship_to_address: 'Jebel Ali Free Zone, Warehouse 17',
        country: 'United Arab Emirates',
        state: 'Dubai',
        city: 'Dubai',
    },
    {
        company_name: 'Sunrise Exports India',
        contact_name: 'Priya Menon',
        contact_email: 'priya@sunriseexports.example.com',
        contact_phone: '+91 98200 11223',
        gstin: '27ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
        iec: '0399005678',
        currency: 'INR',
        status: 'active',
        bill_to_address: '14 Marine Drive',
        ship_to_address: '',
        country: 'India',
        state: 'Maharashtra',
        city: 'Mumbai',
    },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CustomerImportRow {
    rowNum: number;
    data: {
        company_name: string;
        contact_name: string;
        contact_email: string;
        contact_phone?: string;
        gstin?: string;
        pan?: string;
        iec?: string;
        currency?: string;
        status: ENUM_CUSTOMER_STATUS;
        bill_to_address?: string;
        ship_to_address?: string;
        country?: string;
        state?: string;
        city?: string;
    };
    status: 'valid_new' | 'valid_update' | 'error';
    errors: string[];
    warnings: string[];
}

@Injectable()
export class CustomerImportExportService {
    private readonly logger = new Logger(CustomerImportExportService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly customerService: CustomerService,
        private readonly customerRepository: CustomerRepository,
        private readonly contactRepository: CustomerContactRepository,
        private readonly addressRepository: CustomerAddressRepository
    ) {}

    /** Sample Excel — the columns with two filled example rows. */
    generateSampleExcel(): Buffer {
        const aoa: any[][] = [[...BASE_HEADERS]];
        for (const r of SAMPLE_ROWS) {
            aoa.push(BASE_HEADERS.map((h) => r[h] ?? ''));
        }
        return this.fileService.writeExcelFromArray(aoa);
    }

    /**
     * Parse + validate an uploaded file. Row-level problems land in each row's
     * `errors`; only file-level problems throw. A row whose company name
     * already exists is marked `skip` (idempotent re-run), not an error.
     */
    async parseAndValidate(
        fileBuffer: Buffer,
        companyId: string
    ): Promise<{ summary: any; rows: CustomerImportRow[] }> {
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

        const headerKeys = Object.keys(rawRows[0]).map((k) =>
            k.trim().toLowerCase()
        );
        // Only company_name is required; contact name / email are optional.
        const requiredCols = ['company_name'];
        const missing = requiredCols.filter((c) => !headerKeys.includes(c));
        if (missing.length > 0) {
            throw new BadRequestException(
                `Missing required column(s): ${missing.join(
                    ', '
                )}. Expected columns: ${BASE_HEADERS.join(', ')}.`
            );
        }

        const existing = await this.customerRepository.findByCompanyId(
            companyId
        );
        const existingByName = new Set<string>(
            (existing as any[]).map((c) =>
                (c.company_name || '').trim().toLowerCase()
            )
        );

        const seenNames = new Set<string>();
        const rows: CustomerImportRow[] = [];

        for (let i = 0; i < rawRows.length; i++) {
            const raw = rawRows[i];
            const rowNum = i + 2; // 1-indexed + header row
            const errors: string[] = [];
            const warnings: string[] = [];

            const get = (col: string): string => {
                const key = Object.keys(raw).find(
                    (k) => k.trim().toLowerCase() === col
                );
                return key ? String(raw[key] ?? '').trim() : '';
            };

            const companyName = get('company_name');
            const contactName = get('contact_name');
            const contactEmail = get('contact_email');

            // ── Required fields (company_name is the ONLY required field) ──
            if (!companyName) errors.push('Company name is required');
            else if (companyName.length > 200)
                errors.push('Company name must not exceed 200 characters');

            // Contact name / email are optional — only length / format checked
            // when a value is actually present.
            if (contactName && contactName.length > 150)
                errors.push('Contact name must not exceed 150 characters');

            if (contactEmail && !EMAIL_RE.test(contactEmail))
                errors.push('Contact email is not a valid email address');

            // ── Status ──
            const statusRaw = get('status').toLowerCase();
            let status = ENUM_CUSTOMER_STATUS.ACTIVE;
            if (statusRaw) {
                if (statusRaw === 'active')
                    status = ENUM_CUSTOMER_STATUS.ACTIVE;
                else if (statusRaw === 'inactive')
                    status = ENUM_CUSTOMER_STATUS.INACTIVE;
                else
                    errors.push(
                        "Status must be 'active' or 'inactive' (or blank)"
                    );
            }

            // ── Optional caps ──
            const gstin = get('gstin');
            if (gstin && gstin.length > 30)
                errors.push('GSTIN must not exceed 30 characters');
            const pan = get('pan');
            if (pan && pan.length > 30)
                errors.push('PAN must not exceed 30 characters');
            const iec = get('iec');
            if (iec && iec.length > 20)
                errors.push('IEC must not exceed 20 characters');

            // ── Duplicate company name within the file ──
            const nameKey = companyName.toLowerCase();
            if (companyName && seenNames.has(nameKey)) {
                errors.push('Duplicate company name in file');
            }
            if (companyName) seenNames.add(nameKey);

            // ── Existing company_name → update in place; else create ──
            const alreadyExists =
                !!companyName && existingByName.has(nameKey);

            let rowStatus: CustomerImportRow['status'];
            if (errors.length > 0) rowStatus = 'error';
            else if (alreadyExists) rowStatus = 'valid_update';
            else rowStatus = 'valid_new';

            rows.push({
                rowNum,
                data: {
                    company_name: companyName,
                    contact_name: contactName,
                    contact_email: contactEmail,
                    contact_phone: get('contact_phone') || undefined,
                    gstin: gstin || undefined,
                    pan: pan || undefined,
                    iec: iec || undefined,
                    currency: get('currency').toUpperCase() || undefined,
                    status,
                    bill_to_address: get('bill_to_address') || undefined,
                    ship_to_address: get('ship_to_address') || undefined,
                    // Country defaults to India when the column is blank.
                    country: get('country') || 'India',
                    state: get('state') || undefined,
                    city: get('city') || undefined,
                },
                status: rowStatus,
                errors,
                warnings,
            });
        }

        const summary = {
            total: rows.length,
            valid_new: rows.filter((r) => r.status === 'valid_new').length,
            valid_update: rows.filter((r) => r.status === 'valid_update')
                .length,
            errors: rows.filter((r) => r.status === 'error').length,
            warnings: 0,
        };

        return { summary, rows };
    }

    /** Persist the validated rows. One bad row never aborts the batch. */
    async importCustomers(
        rows: CustomerImportRow[],
        companyId: string,
        userId: string
    ): Promise<{
        created: number;
        updated: number;
        errors: { row: number; message: string }[];
    }> {
        let created = 0;
        let updated = 0;
        const errors: { row: number; message: string }[] = [];

        // Map existing customers by lower-cased company_name so update rows can
        // resolve the entity to overwrite (matched the same way in preview).
        const existing = (await this.customerRepository.findByCompanyId(
            companyId
        )) as any[];
        const existingByName = new Map<string, any>();
        for (const c of existing) {
            existingByName.set(
                (c.company_name || '').trim().toLowerCase(),
                c
            );
        }

        for (const row of rows) {
            const d = row.data;
            try {
                if (row.status === 'valid_update') {
                    const target = existingByName.get(
                        d.company_name.trim().toLowerCase()
                    );
                    if (!target) {
                        // Raced away between preview and commit — treat as new.
                        await this.createCustomer(companyId, userId, d);
                        created++;
                        continue;
                    }
                    await this.updateExistingCustomer(companyId, target, d);
                    updated++;
                } else if (row.status === 'valid_new') {
                    await this.createCustomer(companyId, userId, d);
                    created++;
                }
            } catch (err: any) {
                this.logger.error(
                    `Customer import row ${row.rowNum} failed: ${err?.message}`
                );
                errors.push({
                    row: row.rowNum,
                    message: err?.message || 'Import failed',
                });
            }
        }

        return { created, updated, errors };
    }

    /** Create a new customer in SILENT import mode (no login user / email). */
    private async createCustomer(
        companyId: string,
        userId: string,
        d: CustomerImportRow['data']
    ): Promise<void> {
        // Build a primary contact only when the row actually carries a contact
        // name or email. A company-only row imports with NO contact (and hence
        // no login), mirroring the create flow.
        const contacts =
            d.contact_name || d.contact_email
                ? [
                      {
                          name: d.contact_name || undefined,
                          email: d.contact_email || undefined,
                          phone: d.contact_phone,
                          is_primary: true,
                      },
                  ]
                : [];

        await this.customerService.create(
            companyId,
            {
                company_name: d.company_name,
                gstin: d.gstin,
                pan: d.pan,
                iec: d.iec,
                currency: d.currency,
                status: d.status,
                contacts,
                addresses: this.buildAddresses(d),
            } as any,
            userId,
            // Preserve the real status; stay SILENT so no login user / welcome
            // email is provisioned.
            { status: d.status, silent: true }
        );
    }

    /**
     * Overwrite an existing customer from the sheet, SILENTLY: scalar fields +
     * the primary contact (edited in place) + bill-to / ship-to addresses. It
     * never provisions or re-syncs a login user, so editing an imported sheet
     * can't fire a welcome email or change a real login. The sheet is
     * authoritative — the exported round-trip carries every column, so blank
     * optional cells clear the field.
     */
    private async updateExistingCustomer(
        companyId: string,
        target: any,
        d: CustomerImportRow['data']
    ): Promise<void> {
        // ── Scalar fields on the customer itself ──
        target.gstin = d.gstin ?? null;
        target.pan = d.pan ?? null;
        target.iec = d.iec ?? null;
        if (d.currency) target.currency = d.currency;
        target.status = d.status;
        target.is_active = d.status === ENUM_CUSTOMER_STATUS.ACTIVE;
        await this.customerRepository.save(target);

        // ── Primary contact — edit the existing row in place (no user touch) ──
        const contacts = (await this.contactRepository.findByCustomerId(
            target._id.toString()
        )) as any[];
        const primary =
            contacts.find((c) => c.is_primary) || contacts[0] || null;
        const contactEmail = d.contact_email
            ? d.contact_email.trim().toLowerCase()
            : null;
        if (primary) {
            primary.name = d.contact_name || null;
            primary.email = contactEmail;
            primary.phone = d.contact_phone ?? null;
            await this.contactRepository.save(primary);
        } else if (d.contact_name || d.contact_email) {
            // Only create a fresh contact when the sheet actually carries one.
            await this.contactRepository.create({
                name: d.contact_name || null,
                email: contactEmail,
                phone: d.contact_phone,
                is_primary: true,
                customer_id: target._id.toString(),
                company_id: companyId,
            } as any);
        }

        // ── Addresses — upsert bill-to and ship-to in place ──
        const addrs = (await this.addressRepository.findAll({
            customer_id: target._id.toString(),
            soft_delete: false,
        } as any)) as any[];
        await this.upsertAddress(
            companyId,
            target._id.toString(),
            addrs,
            ENUM_CUSTOMER_ADDRESS_TYPE.BILL_TO,
            d.bill_to_address,
            d,
            true
        );
        await this.upsertAddress(
            companyId,
            target._id.toString(),
            addrs,
            ENUM_CUSTOMER_ADDRESS_TYPE.SHIP_TO,
            d.ship_to_address,
            d,
            false
        );
    }

    /** Update the existing address of `type` in place, or create it if absent. */
    private async upsertAddress(
        companyId: string,
        customerId: string,
        existingAddrs: any[],
        type: ENUM_CUSTOMER_ADDRESS_TYPE,
        line1: string | undefined,
        d: CustomerImportRow['data'],
        isDefault: boolean
    ): Promise<void> {
        const existing =
            existingAddrs.find((a) => a.type === type && a.is_default) ||
            existingAddrs.find((a) => a.type === type) ||
            null;

        // Nothing to write and none exists → leave it alone.
        if (!line1 && !existing) return;

        if (existing) {
            existing.address_line1 = line1 ?? null;
            existing.city = d.city ?? null;
            existing.state = d.state ?? null;
            existing.country = d.country ?? null;
            if (type === ENUM_CUSTOMER_ADDRESS_TYPE.BILL_TO) {
                existing.gstin = d.gstin ?? null;
                existing.iec = d.iec ?? null;
            }
            await this.addressRepository.save(existing);
        } else {
            await this.addressRepository.create({
                type,
                address_line1: line1,
                city: d.city,
                state: d.state,
                country: d.country,
                gstin:
                    type === ENUM_CUSTOMER_ADDRESS_TYPE.BILL_TO
                        ? d.gstin
                        : undefined,
                iec:
                    type === ENUM_CUSTOMER_ADDRESS_TYPE.BILL_TO
                        ? d.iec
                        : undefined,
                is_default: isDefault,
                customer_id: customerId,
                company_id: companyId,
            } as any);
        }
    }

    /** Build bill-to / ship-to address rows from the flat sheet columns. */
    private buildAddresses(d: CustomerImportRow['data']): any[] {
        const addresses: any[] = [];
        if (d.bill_to_address || d.city || d.state) {
            addresses.push({
                type: ENUM_CUSTOMER_ADDRESS_TYPE.BILL_TO,
                address_line1: d.bill_to_address,
                city: d.city,
                state: d.state,
                country: d.country,
                gstin: d.gstin,
                iec: d.iec,
                is_default: true,
            });
        }
        if (d.ship_to_address) {
            addresses.push({
                type: ENUM_CUSTOMER_ADDRESS_TYPE.SHIP_TO,
                address_line1: d.ship_to_address,
                city: d.city,
                state: d.state,
                country: d.country,
                is_default: addresses.length === 0,
            });
        }
        return addresses;
    }

    /**
     * Export every customer of the company back into the same template shape
     * (one row per customer, primary contact + default bill-to / ship-to). The
     * file round-trips: exported → re-imported = all rows `skip` (idempotent).
     */
    async exportCustomers(companyId: string): Promise<Buffer> {
        const customers = (await this.customerRepository.findByCompanyId(
            companyId
        )) as any[];

        // Batch-load contacts + addresses once, group in memory (no N+1).
        const contacts = (await this.contactRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const addresses = (await this.addressRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];

        const contactsByCustomer = new Map<string, any[]>();
        for (const c of contacts) {
            const k = c.customer_id?.toString();
            if (!k) continue;
            if (!contactsByCustomer.has(k)) contactsByCustomer.set(k, []);
            contactsByCustomer.get(k).push(c);
        }
        const addressesByCustomer = new Map<string, any[]>();
        for (const a of addresses) {
            const k = a.customer_id?.toString();
            if (!k) continue;
            if (!addressesByCustomer.has(k)) addressesByCustomer.set(k, []);
            addressesByCustomer.get(k).push(a);
        }

        const pickAddr = (list: any[] = [], type: string) =>
            list.find((a) => a.type === type && a.is_default) ||
            list.find((a) => a.type === type) ||
            null;

        const aoa: any[][] = [[...BASE_HEADERS]];
        for (const cust of customers) {
            const cid = cust._id?.toString();
            const cContacts = contactsByCustomer.get(cid) || [];
            const primary =
                cContacts.find((c) => c.is_primary) || cContacts[0] || {};
            const cAddrs = addressesByCustomer.get(cid) || [];
            const billTo = pickAddr(
                cAddrs,
                ENUM_CUSTOMER_ADDRESS_TYPE.BILL_TO
            );
            const shipTo = pickAddr(
                cAddrs,
                ENUM_CUSTOMER_ADDRESS_TYPE.SHIP_TO
            );
            const geo = billTo || shipTo || {};

            aoa.push([
                cust.company_name || '',
                primary.name || '',
                primary.email || '',
                primary.phone || '',
                cust.gstin || '',
                cust.pan || '',
                cust.iec || '',
                cust.currency || '',
                cust.status || ENUM_CUSTOMER_STATUS.ACTIVE,
                billTo?.address_line1 || '',
                shipTo?.address_line1 || '',
                geo.country || '',
                geo.state || '',
                geo.city || '',
            ]);
        }

        return this.fileService.writeExcelFromArray(aoa);
    }
}
