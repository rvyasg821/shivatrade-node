import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import { LeadService } from './lead.service';
import { LeadRepository } from '../repository/repositories/lead.repository';
import { LeadLineRepository } from '../repository/repositories/lead-line.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { ENUM_LEAD_STATUS, ENUM_LEAD_SOURCE } from '../enums/lead.enum';

// Lead document import — TWO sheets:
//   1. "Leads"             → one row per lead (all header fields).
//   2. "Requirement Items" → one row per requirement line, linked to its lead
//                            by COMPANY NAME (a NEW lead has no voucher_no yet —
//                            voucher is auto-generated — so company_name, always
//                            present, is the link key between the two sheets).
//
// voucher_no is OPTIONAL: blank = a brand-new lead (voucher auto-generated); a
// filled voucher_no that already exists is SKIPPED (historical re-import never
// rewrites a lead). Runs create in SILENT import mode (email-uniqueness relaxed,
// no notifications).
const LEAD_SHEET = 'Leads';
const ITEMS_SHEET = 'Requirement Items';

// Sheet 1 — lead header. company_name is REQUIRED and links the items sheet.
const LEAD_HEADERS = [
    // Blank for a new lead (auto-generated). A filled existing voucher is
    // skipped (historical import). NOT the link key — company_name is.
    'voucher_no',
    'reference_no',
    'company_name',
    'contact_name',
    'contact_email',
    'contact_phone',
    // Optional link to an EXISTING customer (repeat-business lead). Filled →
    // matched by company name and linked (source becomes existing_customer); a
    // filled-but-unmatched value errors (never auto-creates a customer). Blank
    // → a plain unlinked lead.
    'customer_name',
    'source',
    'status',
    'expected_value',
    'currency',
    'delivery_expectation',
    'follow_up_date',
    'notes',
];

// Sheet 2 — requirement items, one row per line. company_name links to a lead.
const ITEM_HEADERS = [
    'company_name',
    'product_code',
    'hs_code',
    'part_no',
    'unit',
    'qty',
    'customer_reference',
    'description',
];

const LEAD_SAMPLE_ROWS: Record<string, any>[] = [
    {
        // Blank voucher_no → a NEW lead (voucher auto-generated on import).
        voucher_no: '',
        reference_no: 'REF-2026-014',
        company_name: 'Orient Global Trading LLC',
        contact_name: 'Ahmed Khan',
        contact_email: 'ahmed@orientglobal.example.com',
        contact_phone: '+971 50 123 4567',
        customer_name: 'Orient Global Trading LLC',
        source: 'referral',
        status: 'qualified',
        expected_value: '50000',
        currency: 'USD',
        delivery_expectation: 'Within 30 days',
        follow_up_date: '2026-08-20',
        notes: 'Needs FOB Nhava Sheva',
    },
    {
        voucher_no: '',
        reference_no: '',
        company_name: 'Sunrise Exports India',
        contact_name: 'Priya Menon',
        contact_email: 'priya@sunrise.example.com',
        contact_phone: '+91 98200 11223',
        customer_name: '',
        source: 'web',
        status: 'new',
        expected_value: '',
        currency: 'INR',
        delivery_expectation: '',
        follow_up_date: '',
        notes: 'Enquiry via website',
    },
];

const ITEM_SAMPLE_ROWS: Record<string, any>[] = [
    {
        company_name: 'Orient Global Trading LLC',
        product_code: 'PRD-001',
        hs_code: '84849000',
        part_no: 'P-001',
        unit: 'Nos',
        qty: '100',
        customer_reference: 'Buyer ref A',
        description: 'Gasket kit',
    },
    {
        company_name: 'Orient Global Trading LLC',
        product_code: 'PRD-002',
        hs_code: '40169330',
        part_no: 'P-002',
        unit: 'Nos',
        qty: '50',
        customer_reference: '',
        description: '',
    },
    {
        company_name: 'Sunrise Exports India',
        product_code: 'PRD-003',
        hs_code: '',
        part_no: '',
        unit: 'KG',
        qty: '200',
        customer_reference: '',
        description: 'Bulk order',
    },
];

interface LeadImportLine {
    rowNum: number;
    product_code: string;
    product_id: string;
    hs_code?: string;
    part_no?: string;
    unit?: string;
    qty?: string;
    customer_reference?: string;
    description?: string;
}

export interface LeadImportDoc {
    voucher_no: string;
    rowNums: number[];
    // Set when this row matched an EXISTING lead (by voucher, else company) and
    // carries NEW products — status 'valid_update' appends `lines` to it.
    existing_lead_id?: string;
    header: {
        company_name: string;
        contact_name: string;
        contact_email: string;
        contact_phone?: string;
        reference_no?: string;
        customer_id?: string;
        customer_name?: string;
        source?: ENUM_LEAD_SOURCE;
        status: ENUM_LEAD_STATUS;
        expected_value?: number;
        currency?: string;
        delivery_expectation?: string;
        follow_up_date?: string;
        notes?: string;
    };
    lines: LeadImportLine[];
    status: 'valid_new' | 'valid_update' | 'skip' | 'error';
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
        const leadAoa: any[][] = [[...LEAD_HEADERS]];
        for (const r of LEAD_SAMPLE_ROWS)
            leadAoa.push(LEAD_HEADERS.map((h) => r[h] ?? ''));
        const itemAoa: any[][] = [[...ITEM_HEADERS]];
        for (const r of ITEM_SAMPLE_ROWS)
            itemAoa.push(ITEM_HEADERS.map((h) => r[h] ?? ''));
        return this.fileService.writeExcelSheetsFromArray([
            { sheetName: LEAD_SHEET, rows: leadAoa },
            { sheetName: ITEMS_SHEET, rows: itemAoa },
        ]);
    }

    async parseAndValidate(
        fileBuffer: Buffer,
        companyId: string
    ): Promise<{ summary: any; rows: LeadImportDoc[] }> {
        let sheets: any[];
        try {
            sheets = this.fileService.readExcel(fileBuffer) as any[];
        } catch {
            throw new BadRequestException(
                'Unable to read the file. Please upload a valid Excel or CSV file.'
            );
        }
        if (!sheets?.length)
            throw new BadRequestException('The file contains no data.');

        const byName = (names: string[]) =>
            sheets.find((s) =>
                names.includes((s.sheetName || '').trim().toLowerCase())
            );
        // Leads sheet: by name, else the first sheet. Items sheet: by name, else
        // whichever remaining sheet isn't the Leads sheet.
        const leadSheet = byName(['leads', 'lead']) || sheets[0];
        const itemSheet =
            byName([
                'requirement items',
                'requirement item',
                'items',
                'line items',
                'requirement_items',
            ]) || sheets.find((s) => s !== leadSheet);

        const leadRows = (leadSheet?.data || []) as Record<string, any>[];
        const itemRows = (itemSheet?.data || []) as Record<string, any>[];
        if (!leadRows.length)
            throw new BadRequestException(
                'The Leads sheet contains no data rows.'
            );

        const leadHeaderKeys = Object.keys(leadRows[0]).map((k) =>
            k.trim().toLowerCase()
        );
        const required = ['company_name'];
        const missing = required.filter((c) => !leadHeaderKeys.includes(c));
        if (missing.length)
            throw new BadRequestException(
                `Leads sheet is missing required column(s): ${missing.join(
                    ', '
                )}. Expected columns: ${LEAD_HEADERS.join(', ')}.`
            );
        // Legacy single-sheet files carried product_code inline on the lead row.
        const leadSheetHasInlineProducts = leadHeaderKeys.includes(
            'product_code'
        );

        const get = (raw: Record<string, any>, col: string): string => {
            const key = Object.keys(raw).find(
                (k) => k.trim().toLowerCase() === col
            );
            return key ? String(raw[key] ?? '').trim() : '';
        };

        // product-code → product map + existing voucher set for idempotency.
        const products = await this.productRepository.findByCompanyId(companyId);
        const productByCode = new Map<string, any>();
        for (const p of products as any[])
            if (p.code) productByCode.set(String(p.code).trim().toLowerCase(), p);

        const existingLeads = (await this.leadRepository.findByCompanyId(
            companyId
        )) as any[];
        // Existing-lead lookup so a re-import can APPEND new products to a lead
        // that already exists — matched by voucher_no (exact), else by company
        // name. company map keeps the FIRST lead for a company (rare duplicates).
        const existingByVoucher = new Map<string, any>();
        const existingByCompany = new Map<string, any>();
        for (const l of existingLeads) {
            const vk = (l.voucher_no || '').trim().toLowerCase();
            if (vk) existingByVoucher.set(vk, l);
            const ck = (l.company_name || '').trim().toLowerCase();
            if (ck && !existingByCompany.has(ck)) existingByCompany.set(ck, l);
        }

        // customer company_name → customer, for the optional existing-customer
        // link. Match is by name only (customers have no code).
        const customers = (await this.customerRepository.findByCompanyId(
            companyId
        )) as any[];
        const customerByName = new Map<string, any>();
        for (const c of customers)
            customerByName.set((c.company_name || '').trim().toLowerCase(), c);

        // Requirement items grouped by COMPANY NAME (the link to a lead).
        interface RawItem {
            rowNum: number;
            product_code: string;
            hs_code: string;
            part_no: string;
            unit: string;
            qty: string;
            customer_reference: string;
            description: string;
        }
        const itemsByCompany = new Map<string, RawItem[]>();
        for (let i = 0; i < itemRows.length; i++) {
            const raw = itemRows[i];
            const company = get(raw, 'company_name');
            const productCode = get(raw, 'product_code');
            // Skip a fully-blank / unlinked item row.
            if (!company || !productCode) continue;
            const key = company.toLowerCase();
            if (!itemsByCompany.has(key)) itemsByCompany.set(key, []);
            itemsByCompany.get(key).push({
                rowNum: i + 2,
                product_code: productCode,
                hs_code: get(raw, 'hs_code'),
                part_no: get(raw, 'part_no'),
                unit: get(raw, 'unit'),
                qty: get(raw, 'qty'),
                customer_reference: get(raw, 'customer_reference'),
                description: get(raw, 'description'),
            });
        }

        const docs: LeadImportDoc[] = [];
        const seenCompanies = new Set<string>();
        for (let i = 0; i < leadRows.length; i++) {
            const raw = leadRows[i];
            const rowNum = i + 2;
            const errors: string[] = [];
            const warnings: string[] = [];

            const company_name = get(raw, 'company_name');
            const contact_name = get(raw, 'contact_name');
            const contact_email = get(raw, 'contact_email');
            // A row with none of the identity fields is an empty/trailing row.
            if (!company_name && !contact_name && !contact_email) continue;
            // Only company_name is required. contact_name / contact_email are
            // OPTIONAL (a lead may be captured with just the company); an email,
            // when present, isn't format-validated on import.
            if (!company_name) errors.push('company_name is required');

            const companyKey = company_name.toLowerCase();
            if (company_name && seenCompanies.has(companyKey))
                warnings.push(
                    `Duplicate company_name "${company_name}" in the Leads sheet — items are linked by company name, so both leads receive the same items`
                );
            if (company_name) seenCompanies.add(companyKey);

            // voucher_no is OPTIONAL (blank = new lead → auto-generated).
            const voucher_no = get(raw, 'voucher_no');

            // source / status enums (optional; validated when present)
            let source: ENUM_LEAD_SOURCE | undefined;
            const sourceRaw = get(raw, 'source').toLowerCase();
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
            const statusRaw = get(raw, 'status').toLowerCase();
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

            // Optional existing-customer link (decoupled from source): a filled
            // customer_name MUST resolve to an existing customer (never creates
            // one); when it resolves, source becomes existing_customer.
            const customerName = get(raw, 'customer_name');
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

            const expectedRaw = get(raw, 'expected_value');
            const expected_value = expectedRaw
                ? Number(expectedRaw)
                : undefined;
            if (expectedRaw && !Number.isFinite(expected_value))
                errors.push('expected_value must be numeric');

            // Requirement lines: from the Items sheet (matched by company name).
            // Legacy files with an inline product_code column on the lead row are
            // still honoured (comma-separated codes). Products are de-duplicated.
            const lines: LeadImportLine[] = [];
            const seenProductIds = new Set<string>();
            const addLine = (
                code: string,
                srcRow: number,
                extra?: Partial<LeadImportLine>
            ) => {
                const product = productByCode.get(code.trim().toLowerCase());
                if (!product) {
                    errors.push(
                        `Items row ${srcRow}: product_code "${code}" not found`
                    );
                    return;
                }
                const pid = product._id.toString();
                if (seenProductIds.has(pid)) return; // dedupe within lead
                seenProductIds.add(pid);
                lines.push({
                    rowNum: srcRow,
                    product_code: code,
                    product_id: pid,
                    // Blank sheet cells fall back to the product master, so a
                    // row with just product_code + qty auto-fills HSN/part/unit.
                    hs_code:
                        extra?.hs_code || product.hsn_code || undefined,
                    part_no: extra?.part_no || product.part_no || undefined,
                    unit:
                        extra?.unit ||
                        product.unit_of_measure ||
                        undefined,
                    qty: extra?.qty || undefined,
                    customer_reference: extra?.customer_reference || undefined,
                    description: extra?.description || undefined,
                });
            };
            for (const it of itemsByCompany.get(companyKey) || []) {
                addLine(it.product_code, it.rowNum, {
                    hs_code: it.hs_code,
                    part_no: it.part_no,
                    unit: it.unit,
                    qty: it.qty,
                    customer_reference: it.customer_reference,
                    description: it.description,
                });
            }
            if (leadSheetHasInlineProducts) {
                const inline = get(raw, 'product_code');
                for (const code of inline
                    .split(',')
                    .map((c) => c.trim())
                    .filter(Boolean))
                    addLine(code, rowNum);
            }

            // Match an EXISTING lead (voucher first, then company_name) — SAME
            // upsert as the Vendor import: an existing lead is UPDATED (header +
            // line items), a new one is created. The line MERGE happens at
            // import time (existing lines updated by product, new ones added,
            // none removed), so `docLines` carries ALL the sheet's items.
            let docStatus: LeadImportDoc['status'];
            let existing_lead_id: string | undefined;
            const docLines = lines;
            if (errors.length) {
                docStatus = 'error';
            } else {
                const target =
                    (voucher_no &&
                        existingByVoucher.get(voucher_no.toLowerCase())) ||
                    existingByCompany.get(companyKey);
                if (target) {
                    existing_lead_id = target._id.toString();
                    docStatus = 'valid_update';
                    warnings.push(
                        `Existing lead — header${
                            lines.length ? ` + ${lines.length} item(s)` : ''
                        } will be updated (new products added, none removed)`
                    );
                } else {
                    docStatus = 'valid_new';
                }
            }

            docs.push({
                voucher_no,
                rowNums: [rowNum],
                existing_lead_id,
                header: {
                    company_name,
                    contact_name,
                    contact_email,
                    contact_phone: get(raw, 'contact_phone') || undefined,
                    reference_no: get(raw, 'reference_no') || undefined,
                    customer_id,
                    customer_name: customerName || undefined,
                    source,
                    status,
                    expected_value,
                    currency: get(raw, 'currency').toUpperCase() || undefined,
                    delivery_expectation:
                        get(raw, 'delivery_expectation') || undefined,
                    follow_up_date:
                        get(raw, 'follow_up_date').slice(0, 10) || undefined,
                    notes: get(raw, 'notes') || undefined,
                },
                lines: docLines,
                status: docStatus,
                errors,
                warnings,
            });
        }

        const summary = {
            total: docs.length,
            valid_new: docs.filter((d) => d.status === 'valid_new').length,
            valid_update: docs.filter((d) => d.status === 'valid_update').length,
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
        updated: number;
        skipped: number;
        errors: { row: number; message: string }[];
    }> {
        let created = 0;
        let updated = 0;
        let skipped = 0;
        const errors: { row: number; message: string }[] = [];

        const mapLine = (l: LeadImportLine) => ({
            product_id: l.product_id,
            hs_code: l.hs_code,
            part_no: l.part_no,
            unit: l.unit,
            qty: l.qty,
            customer_reference: l.customer_reference,
            description: l.description,
        });

        for (const doc of docs) {
            if (doc.status === 'skip') {
                skipped++;
                continue;
            }
            // Existing lead → UPDATE it (header + merged line items). Mirrors the
            // Vendor import: the file is MERGED onto the lead's current lines
            // (matching products updated, new ones added, others kept) and the
            // COMPLETE list handed to update(), which replaces lines wholesale —
            // so nothing is deleted.
            if (doc.status === 'valid_update' && doc.existing_lead_id) {
                try {
                    const leadEntity = await this.leadRepository.findOneById(
                        doc.existing_lead_id
                    );
                    if (!leadEntity) {
                        errors.push({
                            row: doc.rowNums[0],
                            message: 'Lead no longer exists',
                        });
                        continue;
                    }
                    const existingRows =
                        (await this.leadLineRepository.findByLeadId(
                            doc.existing_lead_id
                        )) as any[];
                    const fileByPid = new Map(
                        doc.lines.map((l) => [l.product_id, l])
                    );
                    const seen = new Set<string>();
                    const merged: any[] = [];
                    for (const ex of existingRows) {
                        const pid = ex.product_id?.toString();
                        seen.add(pid);
                        const f = fileByPid.get(pid);
                        merged.push(
                            f
                                ? mapLine(f)
                                : {
                                      product_id: pid,
                                      qty: ex.qty,
                                      unit: ex.unit || undefined,
                                      hs_code: ex.hs_code || undefined,
                                      part_no: ex.part_no || undefined,
                                      customer_reference:
                                          ex.customer_reference || undefined,
                                      description: ex.description || undefined,
                                  }
                        );
                    }
                    for (const f of doc.lines)
                        if (!seen.has(f.product_id)) merged.push(mapLine(f));

                    await this.leadService.update(
                        leadEntity as any,
                        {
                            company_name: doc.header.company_name,
                            contact_name: doc.header.contact_name,
                            contact_email: doc.header.contact_email,
                            contact_phone: doc.header.contact_phone,
                            reference_no: doc.header.reference_no,
                            customer_id: doc.header.customer_id,
                            source: doc.header.source,
                            status: doc.header.status,
                            expected_value: doc.header.expected_value,
                            currency: doc.header.currency,
                            delivery_expectation:
                                doc.header.delivery_expectation,
                            follow_up_date: doc.header.follow_up_date,
                            description: doc.header.notes,
                            lines: merged,
                        } as any,
                        userId
                    );
                    updated++;
                } catch (err: any) {
                    this.logger.error(
                        `Lead update "${doc.header.company_name}" failed: ${err?.message}`
                    );
                    errors.push({
                        row: doc.rowNums[0],
                        message: err?.message || 'Update failed',
                    });
                }
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
                        reference_no: doc.header.reference_no,
                        customer_id: doc.header.customer_id,
                        source: doc.header.source,
                        status: doc.header.status,
                        expected_value: doc.header.expected_value,
                        currency: doc.header.currency,
                        delivery_expectation: doc.header.delivery_expectation,
                        follow_up_date: doc.header.follow_up_date,
                        description: doc.header.notes,
                        lines: doc.lines.map(mapLine),
                    } as any,
                    userId,
                    // Preserve the original number + status when one is given;
                    // a BLANK voucher_no auto-generates (a new lead). Silent
                    // relaxes email-uniqueness and suppresses notifications.
                    {
                        voucher_no: doc.voucher_no || undefined,
                        status: doc.header.status,
                        silent: true,
                    }
                );
                created++;
            } catch (err: any) {
                this.logger.error(
                    `Lead import "${doc.header.company_name}" failed: ${err?.message}`
                );
                errors.push({
                    row: doc.rowNums[0],
                    message: err?.message || 'Import failed',
                });
            }
        }
        return { created, updated, skipped, errors };
    }

    /** Export leads as two sheets: "Leads" (one row per lead) and "Requirement
     *  Items" (one row per line, linked by company_name). Round-trips the
     *  import template. */
    async exportLeads(companyId: string): Promise<Buffer> {
        const leads = (await this.leadRepository.findByCompanyId(
            companyId
        )) as any[];

        // product id → code, for item rows.
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

        const leadAoa: any[][] = [[...LEAD_HEADERS]];
        const itemAoa: any[][] = [[...ITEM_HEADERS]];

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
            const leadRow: Record<string, any> = {
                voucher_no: lead.voucher_no || '',
                reference_no: lead.reference_no || '',
                company_name: lead.company_name || '',
                contact_name: lead.contact_name || '',
                contact_email: lead.contact_email || '',
                contact_phone: lead.contact_phone || '',
                customer_name: linkedCustomer,
                source: lead.source || '',
                status: lead.status || '',
                expected_value: lead.expected_value ?? '',
                currency: lead.currency || '',
                delivery_expectation: lead.delivery_expectation || '',
                follow_up_date: (lead.follow_up_date || '').slice(0, 10),
                notes: lead.description || '',
            };
            leadAoa.push(LEAD_HEADERS.map((h) => leadRow[h] ?? ''));

            for (const ln of lines) {
                const itemRow: Record<string, any> = {
                    company_name: lead.company_name || '',
                    product_code:
                        codeById.get(ln.product_id?.toString()) || '',
                    hs_code: ln.hs_code || '',
                    part_no: ln.part_no || '',
                    unit: ln.unit || '',
                    qty: ln.qty ?? '',
                    customer_reference: ln.customer_reference || '',
                    description: ln.description || '',
                };
                itemAoa.push(ITEM_HEADERS.map((h) => itemRow[h] ?? ''));
            }
        }
        return this.fileService.writeExcelSheetsFromArray([
            { sheetName: LEAD_SHEET, rows: leadAoa },
            { sheetName: ITEMS_SHEET, rows: itemAoa },
        ]);
    }
}
