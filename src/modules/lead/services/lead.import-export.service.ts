import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import { LeadService } from './lead.service';
import { LeadRepository } from '../repository/repositories/lead.repository';
import { LeadLineRepository } from '../repository/repositories/lead-line.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { ENUM_LEAD_STATUS, ENUM_LEAD_SOURCE } from '../enums/lead.enum';

// Lead document import. Historical leads carry their original voucher_no,
// status and (indicative) requirement lines. Multiple rows sharing one
// voucher_no form ONE lead with several product lines; the lead's header
// (company / contact / status / …) is taken from the FIRST row of the group.
//
// Runs the create path in SILENT import mode — lead email-uniqueness is relaxed
// (a customer legitimately has many historical leads) and no notifications
// fire. Idempotent: a voucher_no that already exists is SKIPPED, never
// duplicated (leads are transactional docs — re-import must not rewrite them).
const BASE_HEADERS = [
    'voucher_no',
    'company_name',
    'contact_name',
    'contact_email',
    'contact_phone',
    // Optional link to an EXISTING customer (repeat-business lead). Filled →
    // matched by company name and linked (source becomes existing_customer);
    // a filled-but-unmatched value is a row error (never auto-creates a
    // customer — masters are a prerequisite). Blank → a plain unlinked lead.
    'customer_name',
    'source',
    'status',
    'expected_value',
    'currency',
    // Interested-in products. A single cell may list several codes,
    // comma-separated (e.g. PRD-001, PRD-002). A lead is indicative, so no
    // qty / price is captured — those are pinned down at the Quotation stage.
    'product_code',
    'notes',
];

const SAMPLE_ROWS: Record<string, any>[] = [
    {
        voucher_no: 'STIPL/RQ/0001/2026-27',
        company_name: 'Orient Global Trading LLC',
        contact_name: 'Ahmed Khan',
        contact_email: 'ahmed@orientglobal.example.com',
        contact_phone: '+971 50 123 4567',
        // Repeat-business lead — links to this existing customer.
        customer_name: 'Orient Global Trading LLC',
        source: 'referral',
        status: 'qualified',
        expected_value: '50000',
        currency: 'USD',
        // Several interested-in products in one cell, comma-separated.
        product_code: 'PRD-001, PRD-002',
        notes: 'Needs FOB Nhava Sheva',
    },
    {
        voucher_no: 'STIPL/RQ/0002/2026-27',
        company_name: 'Sunrise Exports India',
        contact_name: 'Priya Menon',
        contact_email: 'priya@sunrise.example.com',
        contact_phone: '+91 98200 11223',
        customer_name: '',
        source: 'web',
        status: 'new',
        expected_value: '',
        currency: 'INR',
        product_code: '',
        notes: 'Enquiry via website',
    },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LeadImportLine {
    rowNum: number;
    product_code: string;
    product_id: string;
}

export interface LeadImportDoc {
    voucher_no: string;
    rowNums: number[];
    header: {
        company_name: string;
        contact_name: string;
        contact_email: string;
        contact_phone?: string;
        customer_id?: string;
        customer_name?: string;
        source?: ENUM_LEAD_SOURCE;
        status: ENUM_LEAD_STATUS;
        expected_value?: number;
        currency?: string;
        notes?: string;
    };
    lines: LeadImportLine[];
    status: 'valid_new' | 'skip' | 'error';
    errors: string[];
    warnings: string[];
}

@Injectable()
export class LeadImportExportService {
    private readonly logger = new Logger(LeadImportExportService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly leadService: LeadService,
        private readonly leadRepository: LeadRepository,
        private readonly leadLineRepository: LeadLineRepository,
        private readonly productRepository: ProductRepository,
        private readonly customerRepository: CustomerRepository
    ) {}

    generateSampleExcel(): Buffer {
        const aoa: any[][] = [[...BASE_HEADERS]];
        for (const r of SAMPLE_ROWS) aoa.push(BASE_HEADERS.map((h) => r[h] ?? ''));
        return this.fileService.writeExcelFromArray(aoa);
    }

    async parseAndValidate(
        fileBuffer: Buffer,
        companyId: string
    ): Promise<{ summary: any; rows: LeadImportDoc[] }> {
        let sheets;
        try {
            sheets = this.fileService.readExcel(fileBuffer);
        } catch {
            throw new BadRequestException(
                'Unable to read the file. Please upload a valid Excel or CSV file.'
            );
        }
        const rawRows = (sheets?.[0]?.data || []) as Record<string, any>[];
        if (!rawRows.length)
            throw new BadRequestException('The file contains no data rows.');

        const headerKeys = Object.keys(rawRows[0]).map((k) =>
            k.trim().toLowerCase()
        );
        const required = ['voucher_no', 'company_name', 'contact_email'];
        const missing = required.filter((c) => !headerKeys.includes(c));
        if (missing.length)
            throw new BadRequestException(
                `Missing required column(s): ${missing.join(
                    ', '
                )}. Expected columns: ${BASE_HEADERS.join(', ')}.`
            );

        // product-code → product map + existing voucher set for idempotency.
        const products = await this.productRepository.findByCompanyId(companyId);
        const productByCode = new Map<string, any>();
        for (const p of products as any[])
            if (p.code) productByCode.set(String(p.code).trim().toLowerCase(), p);

        const existingLeads = (await this.leadRepository.findByCompanyId(
            companyId
        )) as any[];
        const existingVouchers = new Set<string>(
            existingLeads.map((l) => (l.voucher_no || '').trim().toLowerCase())
        );

        // customer company_name → customer, for the optional existing-customer
        // link. Match is by name only (customers have no code).
        const customers = (await this.customerRepository.findByCompanyId(
            companyId
        )) as any[];
        const customerByName = new Map<string, any>();
        for (const c of customers)
            customerByName.set(
                (c.company_name || '').trim().toLowerCase(),
                c
            );

        const get = (raw: Record<string, any>, col: string): string => {
            const key = Object.keys(raw).find(
                (k) => k.trim().toLowerCase() === col
            );
            return key ? String(raw[key] ?? '').trim() : '';
        };

        // Group CONTIGUOUS rows by voucher_no (order preserved). The export
        // writes a lead's extra product lines on continuation rows with a BLANK
        // voucher_no (only the first row of a lead carries the header), so a
        // blank-voucher row must attach to the CURRENT lead — carry the last
        // seen voucher forward instead of keying every blank row under "".
        const groups = new Map<string, { rowNum: number; raw: any }[]>();
        const order: string[] = [];
        let currentVno = '';
        for (let i = 0; i < rawRows.length; i++) {
            const raw = rawRows[i];
            const rowNum = i + 2;
            const vno = get(raw, 'voucher_no');
            if (vno) currentVno = vno; // a voucher starts / switches the group
            const key = currentVno.toLowerCase(); // blanks inherit the current lead
            if (!groups.has(key)) {
                groups.set(key, []);
                order.push(key);
            }
            groups.get(key).push({ rowNum, raw });
        }

        const docs: LeadImportDoc[] = [];
        for (const key of order) {
            const groupRows = groups.get(key);
            const first = groupRows[0].raw;
            const rowNums = groupRows.map((g) => g.rowNum);
            const errors: string[] = [];
            const warnings: string[] = [];

            const voucher_no = get(first, 'voucher_no');
            if (!voucher_no) {
                errors.push('voucher_no is required');
            }

            const company_name = get(first, 'company_name');
            const contact_name = get(first, 'contact_name');
            const contact_email = get(first, 'contact_email');
            if (!company_name) errors.push('company_name is required');
            if (!contact_name) errors.push('contact_name is required');
            if (!contact_email) errors.push('contact_email is required');
            else if (!EMAIL_RE.test(contact_email))
                errors.push('contact_email is not a valid email address');

            // source / status enums (optional; validated when present)
            let source: ENUM_LEAD_SOURCE | undefined;
            const sourceRaw = get(first, 'source').toLowerCase();
            if (sourceRaw) {
                if (
                    (Object.values(ENUM_LEAD_SOURCE) as string[]).includes(
                        sourceRaw
                    )
                )
                    source = sourceRaw as ENUM_LEAD_SOURCE;
                else warnings.push(`Unknown source "${sourceRaw}" — left blank`);
            }
            let status = ENUM_LEAD_STATUS.NEW;
            const statusRaw = get(first, 'status').toLowerCase();
            if (statusRaw) {
                if (
                    (Object.values(ENUM_LEAD_STATUS) as string[]).includes(
                        statusRaw
                    )
                )
                    status = statusRaw as ENUM_LEAD_STATUS;
                else
                    errors.push(
                        `Invalid status "${statusRaw}" (expected one of ${Object.values(
                            ENUM_LEAD_STATUS
                        ).join(', ')})`
                    );
            }

            // Optional existing-customer link (decoupled from source): if the
            // customer_name column is filled it MUST resolve to an existing
            // customer — a filled-but-unmatched value errors (never auto-creates
            // a customer). When it resolves, the lead links to it and its source
            // is set to existing_customer, mirroring the Add Lead form.
            const customerName = get(first, 'customer_name');
            let customer_id: string | undefined;
            if (customerName) {
                const c = customerByName.get(customerName.toLowerCase());
                if (!c)
                    errors.push(
                        `customer_name "${customerName}" not found (import Customers first, or leave blank for a new lead)`
                    );
                else {
                    customer_id = c._id.toString();
                    source = ENUM_LEAD_SOURCE.EXISTING_CUSTOMER;
                }
            }

            const expectedRaw = get(first, 'expected_value');
            const expected_value = expectedRaw
                ? Number(expectedRaw)
                : undefined;
            if (expectedRaw && !Number.isFinite(expected_value))
                errors.push('expected_value must be numeric');

            // Interested-in products. A cell may list several codes
            // comma-separated (a lead is indicative); multi-row style (same
            // voucher_no across rows) also works. Products are de-duplicated
            // across the whole lead. No qty / price is captured for a lead.
            const lines: LeadImportLine[] = [];
            const seenProductIds = new Set<string>();
            for (const g of groupRows) {
                const rawCodes = get(g.raw, 'product_code');
                if (!rawCodes) continue;
                const codes = rawCodes
                    .split(',')
                    .map((c) => c.trim())
                    .filter(Boolean);
                for (const code of codes) {
                    const product = productByCode.get(code.toLowerCase());
                    if (!product) {
                        errors.push(
                            `Row ${g.rowNum}: product_code "${code}" not found`
                        );
                        continue;
                    }
                    const pid = product._id.toString();
                    if (seenProductIds.has(pid)) continue; // dedupe within lead
                    seenProductIds.add(pid);
                    lines.push({
                        rowNum: g.rowNum,
                        product_code: code,
                        product_id: pid,
                    });
                }
            }

            const alreadyExists =
                !!voucher_no && existingVouchers.has(voucher_no.toLowerCase());
            let docStatus: LeadImportDoc['status'];
            if (errors.length) docStatus = 'error';
            else if (alreadyExists) docStatus = 'skip';
            else docStatus = 'valid_new';

            docs.push({
                voucher_no,
                rowNums,
                header: {
                    company_name,
                    contact_name,
                    contact_email,
                    contact_phone: get(first, 'contact_phone') || undefined,
                    customer_id,
                    customer_name: customerName || undefined,
                    source,
                    status,
                    expected_value,
                    currency: get(first, 'currency').toUpperCase() || undefined,
                    notes: get(first, 'notes') || undefined,
                },
                lines,
                status: docStatus,
                errors,
                warnings,
            });
        }

        const summary = {
            total: docs.length,
            valid_new: docs.filter((d) => d.status === 'valid_new').length,
            valid_update: 0,
            skipped: docs.filter((d) => d.status === 'skip').length,
            errors: docs.filter((d) => d.status === 'error').length,
            warnings: docs.reduce((n, d) => n + d.warnings.length, 0),
        };
        return { summary, rows: docs };
    }

    async importLeads(
        docs: LeadImportDoc[],
        companyId: string,
        userId: string
    ): Promise<{
        created: number;
        skipped: number;
        errors: { row: number; message: string }[];
    }> {
        let created = 0;
        let skipped = 0;
        const errors: { row: number; message: string }[] = [];

        for (const doc of docs) {
            if (doc.status === 'skip') {
                skipped++;
                continue;
            }
            if (doc.status !== 'valid_new') continue;
            try {
                await this.leadService.create(
                    companyId,
                    {
                        company_name: doc.header.company_name,
                        contact_name: doc.header.contact_name,
                        contact_email: doc.header.contact_email,
                        contact_phone: doc.header.contact_phone,
                        customer_id: doc.header.customer_id,
                        source: doc.header.source,
                        status: doc.header.status,
                        expected_value: doc.header.expected_value,
                        currency: doc.header.currency,
                        description: doc.header.notes,
                        lines: doc.lines.map((l) => ({
                            product_id: l.product_id,
                        })),
                    } as any,
                    userId,
                    // Preserve the original number + status; silent relaxes
                    // email-uniqueness and suppresses notifications.
                    {
                        voucher_no: doc.voucher_no,
                        status: doc.header.status,
                        silent: true,
                    }
                );
                created++;
            } catch (err: any) {
                this.logger.error(
                    `Lead import ${doc.voucher_no} failed: ${err?.message}`
                );
                errors.push({
                    row: doc.rowNums[0],
                    message: err?.message || 'Import failed',
                });
            }
        }
        return { created, skipped, errors };
    }

    /** Export leads as one row per requirement line (header repeated); a lead
     *  with no lines still exports one row. Round-trips the import template. */
    async exportLeads(companyId: string): Promise<Buffer> {
        const leads = (await this.leadRepository.findByCompanyId(
            companyId
        )) as any[];

        // product id → code, for line rows.
        const products = await this.productRepository.findByCompanyId(companyId);
        const codeById = new Map<string, string>();
        for (const p of products as any[])
            codeById.set(p._id.toString(), p.code || '');

        // customer id → company_name, for the customer_name link column.
        const customers = (await this.customerRepository.findByCompanyId(
            companyId
        )) as any[];
        const custNameById = new Map<string, string>();
        for (const c of customers)
            custNameById.set(c._id.toString(), c.company_name || '');

        const aoa: any[][] = [[...BASE_HEADERS]];
        for (const lead of leads) {
            const lines = (await this.leadLineRepository.findByLeadId(
                lead._id.toString()
            )) as any[];
            const linkedCustomer =
                (lead.customer_id &&
                    custNameById.get(lead.customer_id.toString())) ||
                (lead.converted_customer_id &&
                    custNameById.get(lead.converted_customer_id.toString())) ||
                '';
            const base = {
                voucher_no: lead.voucher_no || '',
                company_name: lead.company_name || '',
                contact_name: lead.contact_name || '',
                contact_email: lead.contact_email || '',
                contact_phone: lead.contact_phone || '',
                customer_name: linkedCustomer,
                source: lead.source || '',
                status: lead.status || '',
                expected_value: lead.expected_value ?? '',
                currency: lead.currency || '',
                notes: lead.description || '',
            };
            if (!lines.length) {
                aoa.push(
                    BASE_HEADERS.map((h) =>
                        h === 'product_code' ? '' : (base as any)[h] ?? ''
                    )
                );
                continue;
            }
            // One row per interested-in product (header repeated on the first).
            lines.forEach((ln, idx) => {
                const head = idx === 0 ? base : ({} as any);
                aoa.push(
                    BASE_HEADERS.map((h) => {
                        if (h === 'product_code')
                            return codeById.get(ln.product_id?.toString()) || '';
                        return (head as any)[h] ?? '';
                    })
                );
            });
        }
        return this.fileService.writeExcelFromArray(aoa);
    }
}
