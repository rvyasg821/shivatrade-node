import { Injectable, Logger } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import {
    cellReader,
    readNamedSheets,
    sheetRows,
} from '@common/import/master-import.helper';
import { VendorService } from './vendor.service';
import { VendorRepository } from '../repository/repositories/vendor.repository';
import { VendorAddressRepository } from '../repository/repositories/vendor-address.repository';
import { VendorBankAccountRepository } from '../repository/repositories/vendor-bank-account.repository';
import { VendorContactRepository } from '../repository/repositories/vendor-contact.repository';
import { VendorCategoryRepository } from '../repository/repositories/vendor-category.repository';
import { CurrencyRepository } from '@modules/currency/repository/repositories/currency.repository';
import { VendorCategoryMasterRepository } from '@modules/vendor-category/repository/repositories/vendor-category.repository';
import { CategoryRepository } from '@modules/category/repository/repositories/category.repository';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import {
    ENUM_VENDOR_ADDRESS_TYPE,
    ENUM_VENDOR_STATUS,
} from '../enums/vendor.enum';

/**
 * Vendor import/export — TWO sheets.
 *
 * Sheet 1 `Vendors` is one row per vendor: its own fields plus its main contact
 * and main bank account inline.
 *
 * Sheet 2 `Addresses` holds EVERY address, keyed by `company_name` — which the
 * operator already knows and can copy, so there is no invented handle and no
 * ids anywhere in the workbook. Addresses live in exactly one place: a vendor
 * genuinely has several (a bill-from and two ship-from plants is ordinary), and
 * splitting "the first one" onto sheet 1 made it ambiguous where to look.
 *
 * A vendor with more than one bank account or contact adds those in the UI.
 * That is a deliberate trade: those are rare, they are safer edited one at a
 * time, and carrying them here would put two more tabs in front of every
 * client for a case most of them never hit.
 *
 * Import NEVER deletes. `VendorService.update` replaces children wholesale, so
 * this service merges the file onto what the vendor already has and hands over
 * the COMPLETE list — otherwise importing a vendor with one address would wipe
 * its other three.
 */

const SHEET_VENDORS = 'Vendors';
const SHEET_ADDRESSES = 'Addresses';

const VENDOR_HEADERS = [
    'company_name',
    'vendor_code',
    'gstin',
    'pan',
    'website',
    'payment_terms',
    'incoterms',
    'categories',
    'product_categories',
    'status',
    // Main contact — optional. When an email is supplied the primary contact
    // provisions the vendor's login; with no email the vendor has no login.
    'contact_name',
    'contact_email',
    'contact_phone',
    // Dial/country code for the phone, e.g. "+91". Optional; blank defaults to
    // +91 (India). The flag shown in the UI is derived from this dial code.
    'contact_phone_code',
    'contact_designation',
    // Main bank account.
    'bank_name',
    'account_number',
    'ifsc',
    'swift_code',
    'currency',
];

// Headers for the downloadable SAMPLE template. Same as VENDOR_HEADERS but
// WITHOUT `vendor_code` — the code is auto-generated on create, so it must not
// appear as a fillable column in the blank template. (The EXPORT still includes
// vendor_code for reference / round-tripping existing vendors.)
const VENDOR_SAMPLE_HEADERS = VENDOR_HEADERS.filter(
    (h) => h !== 'vendor_code'
);

const ADDRESS_HEADERS = [
    'company_name',
    'type',
    'label',
    'address_line1',
    'address_line2',
    'city',
    'state',
    'country',
    'postcode',
    'gstin',
    'is_default',
];

/** Preview hands every row back to the browser. */
const MAX_ROWS_PER_SHEET = 5000;

const YES = new Set(['yes', 'y', 'true', '1']);
const NO = new Set(['no', 'n', 'false', '0']);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Dial code (without the leading +) → ISO-2 country, used only to render the
// right flag in the phone widget on import. The digits and the dial code are
// stored verbatim regardless, so an unmapped dial code still imports correctly
// (the widget just falls back to its default flag). Ambiguous shared codes
// (+1, +7) resolve to the most common country; edit the vendor to correct the
// flag in that rare case.
const DIAL_TO_ISO: Record<string, string> = {
    '91': 'IN', '1': 'US', '44': 'GB', '86': 'CN', '81': 'JP', '49': 'DE',
    '33': 'FR', '39': 'IT', '34': 'ES', '7': 'RU', '971': 'AE', '966': 'SA',
    '974': 'QA', '973': 'BH', '968': 'OM', '965': 'KW', '65': 'SG', '60': 'MY',
    '62': 'ID', '66': 'TH', '84': 'VN', '63': 'PH', '880': 'BD', '94': 'LK',
    '92': 'PK', '977': 'NP', '95': 'MM', '852': 'HK', '886': 'TW', '82': 'KR',
    '61': 'AU', '64': 'NZ', '27': 'ZA', '234': 'NG', '254': 'KE', '20': 'EG',
    '212': 'MA', '90': 'TR', '98': 'IR', '972': 'IL', '31': 'NL', '32': 'BE',
    '41': 'CH', '43': 'AT', '46': 'SE', '47': 'NO', '45': 'DK', '358': 'FI',
    '351': 'PT', '30': 'GR', '48': 'PL', '420': 'CZ', '36': 'HU', '40': 'RO',
    '380': 'UA', '55': 'BR', '52': 'MX', '54': 'AR', '56': 'CL', '57': 'CO',
    '51': 'PE', '598': 'UY',
};

/** "+91" / "91" / " 0091 " → "+91", or "" when nothing usable. */
function normaliseDial(raw: string): string {
    const digits = (raw || '').replace(/[^\d]/g, '').replace(/^0+/, '');
    return digits ? `+${digits}` : '';
}

/**
 * Build the Vendor-contact `country_code` object (the app's "Option A" shape:
 * { dial_code, phone, formatted, country_iso }) from an imported dial code and
 * the raw phone digits. Returns undefined when there is nothing to store.
 */
function buildContactCountryCode(
    dialRaw: string,
    phone: string
): any | undefined {
    const dial = normaliseDial(dialRaw);
    if (!dial && !phone) return undefined;
    const effectiveDial = dial || '+91';
    const iso = DIAL_TO_ISO[effectiveDial.replace('+', '')] || 'IN';
    return {
        dial_code: effectiveDial,
        phone: phone || '',
        formatted: phone ? `${effectiveDial} ${phone}` : effectiveDial,
        country_iso: iso,
    };
}

const ADDRESS_FIELDS = [
    'address_line1',
    'address_line2',
    'city',
    'state',
    'country',
    'postcode',
    'gstin',
    'label',
];

export type RowStatus = 'valid_new' | 'valid_update' | 'error';

export interface VendorSheetRow<T> {
    rowNum: number;
    data: T;
    status: RowStatus;
    errors: string[];
}

export interface SheetCounts {
    total: number;
    valid_new: number;
    valid_update: number;
    errors: number;
}

export interface VendorImportPreview {
    summary: {
        total: number;
        valid_new: number;
        valid_update: number;
        errors: number;
        sheets: Record<string, SheetCounts>;
    };
    vendors: VendorSheetRow<any>[];
    addresses: VendorSheetRow<any>[];
}

@Injectable()
export class VendorImportExportService {
    private readonly logger = new Logger(VendorImportExportService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly vendorService: VendorService,
        private readonly vendorRepository: VendorRepository,
        private readonly addressRepository: VendorAddressRepository,
        private readonly bankAccountRepository: VendorBankAccountRepository,
        private readonly contactRepository: VendorContactRepository,
        private readonly vendorCategoryRepository: VendorCategoryRepository,
        private readonly currencyRepository: CurrencyRepository,
        private readonly categoryRepository: VendorCategoryMasterRepository,
        private readonly productCategoryRepository: CategoryRepository,
        private readonly companySettingsService: CompanySettingsService
    ) {}

    // ── Sample ──────────────────────────────────────────────────────────

    generateSampleExcel(): Buffer {
        return this.fileService.writeExcelSheetsFromArray([
            {
                sheetName: SHEET_VENDORS,
                rows: [
                    VENDOR_SAMPLE_HEADERS,
                    [
                        'Acme Steel Pvt Ltd',
                        // vendor_code column removed — auto-generated on create.
                        '24AAACA1234A1Z5',
                        'AAACA1234A',
                        'https://acmesteel.example.com',
                        '30 days',
                        'FOB',
                        // Comma-separated names from the Vendor Category master.
                        // They must already exist — import never creates one.
                        'Chemicals, BEARINGS',
                        // Comma-separated names from the (product) Category
                        // master. Must already exist — import never creates one.
                        'Steel, Fasteners',
                        'active',
                        'Ravi Sharma',
                        'ravi@acmesteel.example.com',
                        '9876543210',
                        '+91',
                        'Sales Manager',
                        'HDFC Bank',
                        '50100012345678',
                        'HDFC0001234',
                        '',
                        'INR',
                    ],
                    [
                        'Topaz Multi-Industries',
                        '27BBBCB5678B1Z3',
                        'BBBCB5678B',
                        '',
                        'Advance',
                        'CIF',
                        '',
                        '',
                        'active',
                        'Imran Qureshi',
                        'imran@topaz.example.com',
                        '9820011223',
                        '+91',
                        'Director',
                        '',
                        '',
                        '',
                        '',
                        '',
                    ],
                ],
            },
            {
                sheetName: SHEET_ADDRESSES,
                rows: [
                    ADDRESS_HEADERS,
                    // EVERY address goes here — one row per address, with the
                    // vendor's company name repeated. Mark one is_default per
                    // type.
                    [
                        'Acme Steel Pvt Ltd',
                        'bill_from',
                        'Head Office',
                        'Plot 12, GIDC Industrial Estate',
                        'Phase II',
                        'Vadodara',
                        'Gujarat',
                        'India',
                        '390010',
                        '24AAACA1234A1Z5',
                        'yes',
                    ],
                    [
                        'Acme Steel Pvt Ltd',
                        'ship_from',
                        'Plant 2',
                        'Survey 88, Hazira Road',
                        '',
                        'Surat',
                        'Gujarat',
                        'India',
                        '394270',
                        '',
                        'no',
                    ],
                    [
                        'Topaz Multi-Industries',
                        'bill_from',
                        'Registered Office',
                        '4th Floor, Nariman Point',
                        '',
                        'Mumbai',
                        'Maharashtra',
                        'India',
                        '400021',
                        '',
                        'yes',
                    ],
                ],
            },
        ]);
    }

    // ── Export ──────────────────────────────────────────────────────────

    /**
     * Every vendor, unfiltered (inactive included) so a round trip cannot look
     * like a purge. The main contact / address / bank go inline on sheet 1; any
     * REMAINING addresses go on sheet 2, so the file reads the way it is meant
     * to be filled in.
     *
     * Extra bank accounts and contacts are not in the file. They are also never
     * touched by an import, so nothing is lost by their absence — but this
     * export is not a full backup of them, and that is deliberate.
     */
    async exportVendors(companyId: string): Promise<Buffer> {
        const vendors = ((await this.vendorRepository.findByCompanyId(
            companyId
        )) as any[]).sort((a, b) =>
            String(a.company_name || '').localeCompare(
                String(b.company_name || '')
            )
        );
        const vendorIds = vendors.map((v) => v._id.toString());

        const [
            addresses,
            banks,
            contactLists,
            vendorCategories,
            allCategories,
            allProductCategories,
            currencies,
        ] = await Promise.all([
            vendorIds.length
                ? this.addressRepository.findByVendorIds(vendorIds)
                : Promise.resolve([] as any[]),
            vendorIds.length
                ? this.bankAccountRepository.findByVendorIds(vendorIds)
                : Promise.resolve([] as any[]),
            Promise.all(
                vendorIds.map((id) => this.contactRepository.findByVendorId(id))
            ),
            vendorIds.length
                ? this.vendorCategoryRepository.findByVendorIds(vendorIds)
                : Promise.resolve([] as any[]),
            this.categoryRepository.findByCompanyId(companyId),
            this.productCategoryRepository.findByCompanyId(companyId),
            this.currencyRepository.findAll({
                company_id: companyId,
                soft_delete: false,
            } as any),
        ]);
        const contacts = contactLists.flat();

        const groupBy = <T extends { vendor_id?: any }>(rows: T[]) => {
            const m = new Map<string, T[]>();
            for (const r of rows) {
                const k = r.vendor_id?.toString();
                if (!k) continue;
                m.set(k, [...(m.get(k) || []), r]);
            }
            return m;
        };
        const addrByVendor = groupBy(addresses as any[]);
        const bankByVendor = groupBy(banks as any[]);
        const contactByVendor = groupBy(contacts as any[]);

        const categoryNameById = new Map<string, string>(
            (allCategories as any[]).map((c) => [c._id.toString(), c.name])
        );
        const productCategoryNameById = new Map<string, string>(
            (allProductCategories as any[]).map((c) => [
                c._id.toString(),
                c.name,
            ])
        );
        // Split each vendor's category links by discriminator: vendor-category
        // names resolve against the vendor master, product-category names
        // against the product master.
        const categoriesByVendor = new Map<string, string[]>();
        const productCategoriesByVendor = new Map<string, string[]>();
        for (const vc of vendorCategories as any[]) {
            const vid = vc.vendor_id?.toString();
            if (!vid) continue;
            if (vc.category_type === 'product') {
                const name = productCategoryNameById.get(
                    vc.category_id?.toString()
                );
                if (!name) continue;
                productCategoriesByVendor.set(vid, [
                    ...(productCategoriesByVendor.get(vid) || []),
                    name,
                ]);
            } else {
                const name = categoryNameById.get(vc.category_id?.toString());
                if (!name) continue;
                categoriesByVendor.set(vid, [
                    ...(categoriesByVendor.get(vid) || []),
                    name,
                ]);
            }
        }
        const currencyCodeById = new Map<string, string>(
            (currencies as any[]).map((c) => [c._id.toString(), c.code])
        );

        const vendorRows: any[][] = [];
        const addressRows: any[][] = [];

        for (const v of vendors) {
            const vid = v._id.toString();
            const vAddresses = addrByVendor.get(vid) || [];
            const vBanks = bankByVendor.get(vid) || [];
            const vContacts = contactByVendor.get(vid) || [];

            // "Main" = the one the app itself treats as default/primary, so the
            // exported row matches what the vendor's screens show.
            const mainBank =
                vBanks.find((b: any) => b.is_default) || vBanks[0];
            const mainContact =
                vContacts.find((c: any) => c.is_primary) || vContacts[0];

            vendorRows.push([
                v.company_name || '',
                v.vendor_code || '',
                v.gstin || '',
                v.pan || '',
                v.website || '',
                v.payment_terms || '',
                v.incoterms || '',
                (categoriesByVendor.get(vid) || []).join(', '),
                (productCategoriesByVendor.get(vid) || []).join(', '),
                v.status || ENUM_VENDOR_STATUS.ACTIVE,
                mainContact?.name || '',
                mainContact?.email || '',
                mainContact?.phone || '',
                mainContact?.country_code?.dial_code ||
                    mainContact?.country_code?.dialCode ||
                    '',
                mainContact?.designation || '',
                mainBank?.bank_name || '',
                mainBank?.account_number || '',
                mainBank?.ifsc || '',
                mainBank?.swift_code || '',
                currencyCodeById.get(mainBank?.currency_id?.toString()) || '',
            ]);

            for (const a of vAddresses) {
                addressRows.push([
                    v.company_name || '',
                    a.type || '',
                    a.label || '',
                    a.address_line1 || '',
                    a.address_line2 || '',
                    a.city || '',
                    a.state || '',
                    a.country || '',
                    a.postcode || '',
                    a.gstin || '',
                    a.is_default ? 'yes' : 'no',
                ]);
            }
        }

        return this.fileService.writeExcelSheetsFromArray([
            { sheetName: SHEET_VENDORS, rows: [VENDOR_HEADERS, ...vendorRows] },
            {
                sheetName: SHEET_ADDRESSES,
                rows: [ADDRESS_HEADERS, ...addressRows],
            },
        ]);
    }

    // ── Parse + validate ────────────────────────────────────────────────

    async parseAndValidate(
        fileBuffer: Buffer,
        companyId: string
    ): Promise<VendorImportPreview> {
        const sheets = readNamedSheets(this.fileService, fileBuffer, {
            maxRowsPerSheet: MAX_ROWS_PER_SHEET,
        });
        const rawVendors = sheetRows(sheets, SHEET_VENDORS, 'vendor');
        const rawAddresses = sheetRows(sheets, SHEET_ADDRESSES, 'address');

        const existing = (await this.vendorRepository.findByCompanyId(
            companyId
        )) as any[];
        const byCode = new Map<string, any[]>();
        const byName = new Map<string, any[]>();
        for (const v of existing) {
            const code = String(v.vendor_code || '').trim().toLowerCase();
            const name = String(v.company_name || '').trim().toLowerCase();
            if (code) byCode.set(code, [...(byCode.get(code) || []), v]);
            if (name) byName.set(name, [...(byName.get(name) || []), v]);
        }

        // Scoped exactly like `VendorService.assertBankAccountsValid`, which
        // re-checks the resolved ids against company_id + soft_delete. An
        // unscoped lookup could resolve 'INR' to a row validation then rejects.
        const currencies = (await this.currencyRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const currencyByCode = new Map<string, any>(
            currencies.map((c) => [String(c.code || '').toUpperCase(), c])
        );

        const categoryList = (await this.categoryRepository.findByCompanyId(
            companyId
        )) as any[];
        const categoryIdByName = new Map<string, string>(
            categoryList.map((c) => [
                String(c.name || '').trim().toLowerCase(),
                c._id.toString(),
            ])
        );

        const productCategoryList =
            (await this.productCategoryRepository.findByCompanyId(
                companyId
            )) as any[];
        const productCategoryIdByName = new Map<string, string>(
            productCategoryList.map((c) => [
                String(c.name || '').trim().toLowerCase(),
                c._id.toString(),
            ])
        );

        const vendors: VendorSheetRow<any>[] = [];
        const rowByName = new Map<string, VendorSheetRow<any>>();

        for (let i = 0; i < rawVendors.length; i++) {
            const get = cellReader(rawVendors[i]);
            const errors: string[] = [];
            const companyName = get('company_name');
            const nameKey = companyName.toLowerCase();

            if (!companyName) errors.push('company_name is required');
            else if (companyName.length > 200) {
                errors.push('company_name must not exceed 200 characters');
            }
            if (companyName && rowByName.has(nameKey)) {
                errors.push('Duplicate company name in file');
            }

            const statusRaw = get('status').toLowerCase();
            let status = ENUM_VENDOR_STATUS.ACTIVE;
            if (statusRaw) {
                if (statusRaw === 'active' || statusRaw === 'inactive') {
                    status = statusRaw as ENUM_VENDOR_STATUS;
                } else {
                    errors.push("status must be 'active' or 'inactive'");
                }
            }

            const vendorCode = get('vendor_code');
            const match = this.resolveVendor(
                vendorCode,
                companyName,
                byCode,
                byName
            );
            if (match.error) errors.push(match.error);
            const isNew = !match.id;

            // Categories: comma-separated NAMES. Blank = leave alone, because
            // `category_ids` is a replace list on the service.
            const categoriesRaw = get('categories');
            let categoryIds: string[] | undefined;
            if (categoriesRaw) {
                const unknown: string[] = [];
                const ids: string[] = [];
                for (const nm of categoriesRaw
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)) {
                    const id = categoryIdByName.get(nm.toLowerCase());
                    if (id) ids.push(id);
                    else unknown.push(nm);
                }
                if (unknown.length) {
                    errors.push(
                        `Unknown categor${
                            unknown.length > 1 ? 'ies' : 'y'
                        }: ${unknown.join(', ')} — add them to the Vendor Category master first`
                    );
                }
                categoryIds = Array.from(new Set(ids));
            }

            // Product categories: comma-separated NAMES resolved against the
            // (product) Category master. Blank = leave alone (replace list).
            const productCategoriesRaw = get('product_categories');
            let productCategoryIds: string[] | undefined;
            if (productCategoriesRaw) {
                const unknown: string[] = [];
                const ids: string[] = [];
                for (const nm of productCategoriesRaw
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)) {
                    const id = productCategoryIdByName.get(nm.toLowerCase());
                    if (id) ids.push(id);
                    else unknown.push(nm);
                }
                if (unknown.length) {
                    errors.push(
                        `Unknown product categor${
                            unknown.length > 1 ? 'ies' : 'y'
                        }: ${unknown.join(', ')} — add them to the Category master first`
                    );
                }
                productCategoryIds = Array.from(new Set(ids));
            }

            // GSTIN is optional — company_name is the only required field.
            const gstin = get('gstin');

            // ── Inline contact ── name and email are both optional. When an
            // email is supplied it must be a valid address; a vendor with no
            // contact email simply gets no portal login.
            const contactName = get('contact_name');
            const contactEmail = get('contact_email');
            if (contactEmail && !EMAIL_RE.test(contactEmail)) {
                errors.push('contact_email is not a valid email address');
            }
            const contactPhone = get('contact_phone');
            const contactPhoneCode = get('contact_phone_code');
            const contactCountryCode = buildContactCountryCode(
                contactPhoneCode,
                contactPhone
            );
            const contact = contactEmail
                ? {
                      name: contactName || contactEmail,
                      email: contactEmail,
                      phone: contactPhone || undefined,
                      country_code: contactCountryCode,
                      designation: get('contact_designation') || undefined,
                      is_primary: true,
                  }
                : undefined;

            // ── Inline bank ──
            const bankName = get('bank_name');
            const accountNumber = get('account_number');
            let bank: any;
            if (bankName || accountNumber) {
                if (!bankName) errors.push('bank_name is required when an account number is given');
                if (!accountNumber) {
                    errors.push('account_number is required when a bank name is given');
                }
                const currencyCode = get('currency').toUpperCase();
                let currencyId: string | undefined;
                if (!currencyCode) {
                    errors.push('currency is required for a bank account (e.g. INR)');
                } else {
                    const cur = currencyByCode.get(currencyCode);
                    if (!cur) {
                        errors.push(
                            `Currency '${currencyCode}' is not in the Currency master`
                        );
                    } else currencyId = cur._id.toString();
                }
                bank = {
                    bank_name: bankName || undefined,
                    account_number: accountNumber || undefined,
                    ifsc: get('ifsc') || undefined,
                    swift_code: get('swift_code') || undefined,
                    currency_id: currencyId,
                    is_default: true,
                    is_active: true,
                };
            }

            const row: VendorSheetRow<any> = {
                rowNum: i + 2,
                data: {
                    company_name: companyName,
                    vendor_code: vendorCode || undefined,
                    gstin: gstin || undefined,
                    pan: get('pan') || undefined,
                    website: get('website') || undefined,
                    payment_terms: get('payment_terms') || undefined,
                    incoterms: get('incoterms') || undefined,
                    category_ids: categoryIds,
                    product_category_ids: productCategoryIds,
                    status,
                    _existingId: match.id,
                    _contact: contact,
                    _bank: bank,
                },
                status: errors.length
                    ? 'error'
                    : isNew
                      ? 'valid_new'
                      : 'valid_update',
                errors,
            };
            vendors.push(row);
            if (companyName) rowByName.set(nameKey, row);
        }

        // ── Addresses sheet — extra addresses only ──
        const addresses: VendorSheetRow<any>[] = rawAddresses.map((raw, i) => {
            const get = cellReader(raw);
            const errors: string[] = [];
            const companyName = get('company_name');
            const nameKey = companyName.toLowerCase();

            let targetVendorId: string | undefined;
            if (!companyName) {
                errors.push('company_name is required');
            } else {
                const inFile = rowByName.get(nameKey);
                if (inFile) {
                    targetVendorId = inFile.data._existingId;
                    if (inFile.status === 'error') {
                        errors.push(
                            `Its vendor '${companyName}' has errors on the Vendors sheet`
                        );
                    }
                } else {
                    const match = this.resolveVendor(
                        '',
                        companyName,
                        byCode,
                        byName
                    );
                    if (match.error) errors.push(match.error);
                    else if (!match.id) {
                        errors.push(
                            `'${companyName}' is not on the Vendors sheet and is not an existing vendor`
                        );
                    } else targetVendorId = match.id;
                }
            }

            const typeRaw = (get('type') || 'bill_from').toLowerCase();
            const validTypes = Object.values(
                ENUM_VENDOR_ADDRESS_TYPE
            ) as string[];
            if (!validTypes.includes(typeRaw)) {
                errors.push(`type must be one of: ${validTypes.join(', ')}`);
            }
            // NOT "address_line1 is required" — it is nullable on the entity and
            // vendors created in the UI routinely have a city-only address.
            // Requiring it would make our own export un-importable.
            if (!ADDRESS_FIELDS.some((f) => !!get(f))) {
                errors.push(
                    'The address row is empty — fill at least one of address_line1, city, state, country or postcode'
                );
            }

            return {
                rowNum: i + 2,
                data: {
                    // Carried for the preview's error table only — stripped
                    // before the payload reaches the service.
                    company_name: companyName,
                    type: typeRaw,
                    label: get('label') || '',
                    address_line1: get('address_line1') || undefined,
                    address_line2: get('address_line2') || undefined,
                    city: get('city') || undefined,
                    state: get('state') || undefined,
                    country: get('country') || undefined,
                    postcode: get('postcode') || undefined,
                    gstin: get('gstin') || undefined,
                    is_default: this.parseBool(
                        get('is_default'),
                        false,
                        'is_default',
                        errors
                    ),
                    _nameKey: nameKey,
                    _targetVendorId: targetVendorId,
                },
                status: errors.length ? 'error' : 'valid_new',
                errors,
            };
        });

        await this.markAddressStatuses(addresses);

        const count = (rows: VendorSheetRow<any>[]): SheetCounts => ({
            total: rows.length,
            valid_new: rows.filter((r) => r.status === 'valid_new').length,
            valid_update: rows.filter((r) => r.status === 'valid_update').length,
            errors: rows.filter((r) => r.status === 'error').length,
        });
        const vendorCounts = count(vendors);

        return {
            summary: {
                ...vendorCounts,
                sheets: {
                    vendors: vendorCounts,
                    addresses: count(addresses),
                },
            },
            vendors,
            addresses,
        };
    }

    /**
     * New-vs-update for the Addresses sheet, using the SAME natural key the
     * commit merges on. Without this a round trip reports every address as
     * "New", which reads as though the import is about to duplicate them all.
     */
    private async markAddressStatuses(
        addresses: VendorSheetRow<any>[]
    ): Promise<void> {
        const vendorIds = Array.from(
            new Set(
                addresses
                    .filter((r) => r.status !== 'error')
                    .map((r) => r.data._targetVendorId)
                    .filter(Boolean) as string[]
            )
        );
        if (!vendorIds.length) return;

        const existing = await this.addressRepository.findByVendorIds(
            vendorIds
        );
        const index = new Map<string, Set<string>>();
        for (const a of existing as any[]) {
            const vid = a.vendor_id?.toString();
            if (!vid) continue;
            if (!index.has(vid)) index.set(vid, new Set());
            index.get(vid).add(this.addressKey(a));
        }

        for (const r of addresses) {
            if (r.status === 'error') continue;
            const vid = r.data._targetVendorId;
            r.status =
                vid && index.get(vid)?.has(this.addressKey(r.data))
                    ? 'valid_update'
                    : 'valid_new';
        }
    }

    /**
     * type + label + line 1. Label alone is too weak — the inline address has
     * no label, and placeholder data often has none either, so two unrelated
     * addresses would collide on `bill_from::`.
     */
    private addressKey(a: any): string {
        return [
            String(a.type || '').toLowerCase(),
            String(a.label || '').trim().toLowerCase(),
            String(a.address_line1 || '').trim().toLowerCase(),
        ].join('::');
    }

    /** vendor_code first (stable), then exact company name. */
    private resolveVendor(
        vendorCode: string,
        companyName: string,
        byCode: Map<string, any[]>,
        byName: Map<string, any[]>
    ): { id?: string; error?: string } {
        const tries: Array<[string, Map<string, any[]>]> = [];
        if (vendorCode) tries.push([vendorCode.trim().toLowerCase(), byCode]);
        if (companyName) {
            tries.push([companyName.trim().toLowerCase(), byName]);
            tries.push([companyName.trim().toLowerCase(), byCode]);
        }

        for (const [key, index] of tries) {
            const hits = index.get(key);
            if (!hits?.length) continue;
            if (hits.length > 1) {
                // Company-name uniqueness is a service-level check, not a DB
                // index, so a legacy duplicate is possible. Refuse rather than
                // pick one at random.
                return {
                    error: `'${key}' matches more than one existing vendor — clean up the vendor master first`,
                };
            }
            return { id: hits[0]._id.toString() };
        }
        return {};
    }

    private parseBool(
        raw: string,
        fallback: boolean,
        label: string,
        errors: string[]
    ): boolean {
        const v = String(raw || '').trim().toLowerCase();
        if (!v) return fallback;
        if (YES.has(v)) return true;
        if (NO.has(v)) return false;
        errors.push(`${label} must be 'yes' or 'no'`);
        return fallback;
    }

    // ── Commit ──────────────────────────────────────────────────────────

    /**
     * Persist the workbook. One bad vendor never aborts the batch.
     *
     * Children are MERGED onto whatever the vendor already has — addresses by
     * type + label + line 1, banks by account number, contacts by email — and
     * the COMPLETE merged list is handed to the service, whose update path
     * replaces children wholesale. Nothing on record is ever dropped.
     */
    async importVendors(
        preview: VendorImportPreview,
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

        // ── Pre-assign vendor codes in ONE batch. ──
        // vendorService.create() otherwise scans the whole vendor table per row
        // to auto-generate a code (O(n²) → import timeout on big uploads). By
        // handing each new row a code up-front, create() takes the cheap
        // "supplied code" branch (a single existence check) instead. Rows that
        // already carry a code, and update rows, are untouched.
        const autoCodeRows = preview.vendors.filter(
            (v) =>
                v.status !== 'error' &&
                !v.data._existingId &&
                !String(v.data.vendor_code || '').trim()
        );
        if (autoCodeRows.length) {
            const existingVendors =
                (await this.vendorRepository.findByCompanyId(companyId)) as any[];
            const existingCodes = existingVendors
                .map((v) => v.vendor_code)
                .filter(Boolean) as string[];
            const codes = await this.companySettingsService.generateVendorCodes(
                companyId,
                existingCodes,
                autoCodeRows.length
            );
            autoCodeRows.forEach((v, i) => {
                v.data.vendor_code = codes[i];
            });
        }

        const okAddresses = preview.addresses.filter(
            (r) => r.status !== 'error'
        );
        const strip = (d: any) => {
            const { _nameKey, _targetVendorId, company_name, ...clean } = d;
            return clean;
        };

        // Vendors that only appear on the Addresses sheet — "add a second
        // address to a vendor already in the system".
        const addressOnlyVendorIds = new Set<string>(
            okAddresses
                .map((r) => r.data._targetVendorId)
                .filter(Boolean) as string[]
        );

        for (const v of preview.vendors) {
            if (v.status === 'error') continue;
            const nameKey = String(v.data.company_name || '').toLowerCase();
            const existingId = v.data._existingId as string | undefined;
            if (existingId) addressOnlyVendorIds.delete(existingId);

            const { _existingId, _contact, _bank, ...scalar } = v.data;

            // Addresses come only from the Addresses sheet — there is no inline
            // address on the Vendors row, so there is exactly one place a
            // vendor's addresses can come from.
            const incomingAddresses = okAddresses
                .filter((r) => r.data._nameKey === nameKey)
                .map((r) => strip(r.data));
            const incomingBanks = _bank ? [_bank] : [];
            const incomingContacts = _contact ? [_contact] : [];

            try {
                if (existingId) {
                    const vendor =
                        await this.vendorService.findOneById(existingId);
                    await this.vendorService.update(vendor, {
                        ...scalar,
                        ...(await this.mergedChildren(
                            existingId,
                            incomingAddresses,
                            incomingBanks,
                            incomingContacts
                        )),
                    } as any);
                    updated++;
                } else {
                    // Same normalisation as the update path — a new vendor is
                    // just as capable of arriving with two ticked defaults.
                    this.normaliseAddressDefaults(incomingAddresses);
                    this.normaliseBankDefaults(incomingBanks);
                    this.normaliseContactPrimary(incomingContacts);
                    await this.vendorService.create(
                        companyId,
                        {
                            ...scalar,
                            contacts: incomingContacts,
                            addresses: incomingAddresses,
                            bank_accounts: incomingBanks,
                        } as any,
                        userId
                    );
                    created++;
                }
            } catch (err) {
                this.logger.error(
                    `Vendor import row ${v.rowNum} failed: ${err.message}`
                );
                errors.push({ row: v.rowNum, message: err.message });
            }
        }

        for (const vendorId of addressOnlyVendorIds) {
            try {
                const vendor = await this.vendorService.findOneById(vendorId);
                const mine = okAddresses
                    .filter((r) => r.data._targetVendorId === vendorId)
                    .map((r) => strip(r.data));
                await this.vendorService.update(vendor, {
                    ...(await this.mergedChildren(vendorId, mine, [], [])),
                } as any);
                updated++;
            } catch (err) {
                this.logger.error(
                    `Vendor ${vendorId} address import failed: ${err.message}`
                );
                errors.push({ row: 0, message: err.message });
            }
        }

        return { created, updated, errors };
    }

    /**
     * "Last one wins" for a flag that must be unique.
     *
     * These run on BOTH the create and the update path. The service enforces
     * the same rules by THROWING (`Only one default address allowed per type`),
     * so without normalising here a spreadsheet with two ticked boxes would
     * fail the whole vendor — including its contact and bank — over something
     * we can resolve. Iterating backwards means the later row keeps the flag,
     * which is what an operator editing a sheet top-to-bottom expects.
     */
    private normaliseAddressDefaults(list: any[]): void {
        const seen = new Set<string>();
        for (const a of (list || []).slice().reverse()) {
            if (!a.is_default) continue;
            const type = a.type || ENUM_VENDOR_ADDRESS_TYPE.BILL_FROM;
            if (seen.has(type)) a.is_default = false;
            else seen.add(type);
        }
    }

    /** One default per currency — the service rejects more. */
    private normaliseBankDefaults(list: any[]): void {
        const seen = new Set<string>();
        for (const b of (list || []).slice().reverse()) {
            if (!b.is_default) continue;
            if (seen.has(b.currency_id)) b.is_default = false;
            else seen.add(b.currency_id);
        }
    }

    /** Exactly one primary — the vendor's login hangs off it. */
    private normaliseContactPrimary(list: any[]): void {
        const rows = list || [];
        let kept = false;
        for (const c of rows) {
            if (!c.is_primary) continue;
            if (!kept) kept = true;
            else c.is_primary = false;
        }
        if (rows.length && !kept) rows[0].is_primary = true;
    }

    /**
     * A grain with NO incoming rows is left out of the payload entirely — the
     * service only touches an array it is given, so a Vendors-only import
     * cannot disturb a vendor's other addresses, banks or contacts.
     */
    private async mergedChildren(
        vendorId: string,
        addresses: any[],
        banks: any[],
        contacts: any[]
    ): Promise<Record<string, any>> {
        const out: Record<string, any> = {};

        if (addresses.length) {
            out.addresses = this.mergeByKey(
                await this.addressRepository.findByVendorId(vendorId),
                addresses,
                (a) => this.addressKey(a),
                [
                    'type',
                    'label',
                    'address_line1',
                    'address_line2',
                    'city',
                    'state',
                    'country',
                    'postcode',
                    'gstin',
                    'is_default',
                ]
            );
            this.normaliseAddressDefaults(out.addresses);
        }

        if (banks.length) {
            out.bank_accounts = this.mergeByKey(
                await this.bankAccountRepository.findByVendorId(vendorId),
                banks,
                (b) => String(b.account_number || '').trim().toLowerCase(),
                [
                    'bank_name',
                    'account_holder_name',
                    'account_number',
                    'account_type',
                    'ifsc',
                    'swift_code',
                    'iban',
                    'currency_id',
                    'branch_name',
                    'branch_address',
                    'is_default',
                    'is_active',
                    'notes',
                ]
            );
            this.normaliseBankDefaults(out.bank_accounts);
        }

        if (contacts.length) {
            out.contacts = this.mergeByKey(
                await this.contactRepository.findByVendorId(vendorId),
                contacts,
                (c) => String(c.email || '').trim().toLowerCase(),
                [
                    'name',
                    'designation',
                    'email',
                    'phone',
                    'country_code',
                    'is_primary',
                ]
            );
            this.normaliseContactPrimary(out.contacts);
        }

        return out;
    }

    /**
     * Existing rows first, patched in place by the incoming ones; genuinely new
     * rows appended. Never removes an existing row — that is the whole point.
     * A blank incoming cell leaves the stored value alone.
     */
    private mergeByKey(
        existingRows: any[],
        incoming: any[],
        keyOf: (row: any) => string,
        fields: string[]
    ): any[] {
        const merged = existingRows.map((e) => {
            const plain: any = {};
            for (const f of fields) plain[f] = (e as any)[f];
            return plain;
        });
        const index = new Map<string, any>(merged.map((m) => [keyOf(m), m]));

        for (const inc of incoming) {
            const hit = index.get(keyOf(inc));
            if (hit) {
                for (const f of fields) {
                    const v = inc[f];
                    // `false` is a value, not a blank — booleans always apply.
                    if (typeof v === 'boolean') hit[f] = v;
                    else if (v !== undefined && v !== '') hit[f] = v;
                }
            } else {
                const fresh: any = {};
                for (const f of fields) fresh[f] = inc[f];
                merged.push(fresh);
                index.set(keyOf(fresh), fresh);
            }
        }
        return merged;
    }
}
