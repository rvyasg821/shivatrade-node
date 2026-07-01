import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
    IDatabaseCreateOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseSaveOptions,
} from '@common/database/interfaces/database.interface';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { CompanyBankAccountRepository } from '@modules/company/repository/repositories/company-bank-account.repository';
import {
    CompanyDoc,
    CompanyEntity,
} from '@modules/company/repository/entities/company.entity';
import {
    CompanyAddressDoc,
} from '@modules/company/repository/entities/company-address.entity';
import {
    CompanyBankAccountDoc,
} from '@modules/company/repository/entities/company-bank-account.entity';
import { CompanyListResponseDto } from '@modules/company/dtos/response/company.list.response.dto';
import {
    CompanyGetResponseDto,
    CompanyAddressResponseDto,
    CompanyBankAccountResponseDto,
} from '@modules/company/dtos/response/company.get.response.dto';
import {
    CompanyAddressRequestDto,
    CompanyBankAccountRequestDto,
} from '@modules/company/dtos/request/company.update.request.dto';
import { plainToInstance } from 'class-transformer';
import {
    ENUM_COMPANY_ADDRESS_TYPE,
    ENUM_COMPANY_STATUS,
} from '../enums/company.enum';
import { SubscriptionCleanupService } from '@modules/subscription/services/subscription-cleanup.service';
import { CurrencyRepository } from '@modules/currency/repository/repositories/currency.repository';

export interface ICompanyCreate {
    user_id: string;
    company_name: string;
    contact_name: string;
    contact_first_name?: string;
    contact_middle_name?: string;
    contact_last_name?: string;
    email: string;
    mobile?: string;
    country_code?: any;
    website?: string;
    company_code?: string;
    license_number?: string;
    tax_number?: string;
    pan?: string;
    paye_reference?: string;
    pension_provider?: string;
    is_sponsor_licence?: boolean;
    selected_country?: string;
    timezone?: string;
    currency?: string;
    tenantId?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    country?: string;
    zipcode?: string;
    status?: ENUM_COMPANY_STATUS;
    referal_code?: string;
    agent_id?: string;
    agent_commission?: number;
    iec?: string;
    lut_no?: string;
    lut_date?: string;
    cin?: string;
    default_port_of_loading?: string;
    default_port_of_loading_id?: string;
    default_port_of_loading_snapshot?: any;
    default_declaration_text?: string;
    default_terms?: string;
    default_remarks?: string;
    pov_default_remarks?: string;
    authorised_signatory_name?: string;
    footer_address?: string;
}

@Injectable()
export class CompanyService {
    private readonly logger = new Logger(CompanyService.name);

    constructor(
        private readonly companyRepository: CompanyRepository,
        private readonly subscriptionCleanupService: SubscriptionCleanupService,
        private readonly addressRepository: CompanyAddressRepository,
        private readonly bankAccountRepository: CompanyBankAccountRepository,
        private readonly currencyRepository: CurrencyRepository
    ) { }

    convertToObjectId(id: string) {
        return id;
    }

    async findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<CompanyDoc[]> {
        return this.companyRepository.findAll<CompanyDoc>(find, options);
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return this.companyRepository.getTotal(find, options);
    }

    async findOneById(
        _id: any,
        options?: IDatabaseFindOneOptions
    ): Promise<CompanyDoc> {
        return this.companyRepository.findOneById<CompanyDoc>(_id, options);
    }

    async findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<CompanyDoc> {
        return this.companyRepository.findOne<CompanyDoc>(find, options);
    }

    async findOneByUserId(
        user_id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<CompanyDoc> {
        return this.companyRepository.findOne<CompanyDoc>({ user_id }, options);
    }

    async findOneWithTenantId(
        tenantId: string,
    ): Promise<CompanyDoc> {
        return this.companyRepository.findOne<CompanyDoc>({ tenantId });
    }

    async save(entity: CompanyDoc): Promise<CompanyDoc> {
        return this.companyRepository.save(entity);
    }

    async create(
        data: ICompanyCreate,
        options?: IDatabaseCreateOptions
    ): Promise<CompanyDoc> {
        const create: CompanyEntity = new CompanyEntity();
        create.user_id = data.user_id;
        create.company_name = data.company_name;
        create.contact_name = data.contact_name;
        create.contact_first_name = data.contact_first_name;
        create.contact_middle_name = data.contact_middle_name;
        create.contact_last_name = data.contact_last_name;
        create.country_code = data.country_code;
        create.email = data.email;
        create.mobile = data.mobile || '';
        create.website = data.website;
        create.company_code = data.company_code;
        create.license_number = data.license_number;
        create.tax_number = data.tax_number;
        create.pan = data.pan;
        create.paye_reference = data.paye_reference;
        create.pension_provider = data.pension_provider;
        create.is_sponsor_licence = data.is_sponsor_licence || false;
        create.selected_country = data.selected_country;
        create.timezone = data.timezone;
        create.currency = data.currency;
        create.tenantId = data.tenantId;
        if (data.referal_code) create.referal_code = data.referal_code;
        if (data.agent_id) create.agent_id = data.agent_id;
        if (data.agent_commission) create.agent_commission = data.agent_commission ?? 0;
        if (data.address_1 || data.address_1 == '') create.address_1 = data.address_1;
        if (data.address_2 || data.address_2 == '') create.address_2 = data.address_2;
        if (data.city || data.city == '') create.city = data.city;
        if (data.state || data.state == '') create.state = data.state;

        if (data.country || data.country == '') {
            create.country = data.country;
        } else if (data.country_code?.name) {
            create.country = data.country_code.name;
        }

        if (data.zipcode || data.zipcode == '') create.zipcode = data.zipcode;

        return this.companyRepository.create<CompanyEntity>(create, options);
    }

    async updateCompanyEmail(
        user_id: string,
        email: string,
    ): Promise<CompanyDoc> {
        return this.companyRepository.findOneAndUpdate<CompanyDoc>(
            user_id,
            { email }
        )
    }

    async update(
        repository: CompanyDoc,
        data: Partial<ICompanyCreate>,
        options?: IDatabaseSaveOptions
    ): Promise<CompanyDoc> {
        if (data.company_name) repository.company_name = data.company_name;
        if (data.contact_name) repository.contact_name = data.contact_name;
        if (data.contact_first_name !== undefined) repository.contact_first_name = data.contact_first_name;
        if (data.contact_middle_name !== undefined) repository.contact_middle_name = data.contact_middle_name;
        if (data.contact_last_name !== undefined) repository.contact_last_name = data.contact_last_name;
        if (data.email) repository.email = data.email;
        if (data.mobile !== undefined) repository.mobile = data.mobile;
        if (data.country_code !== undefined) repository.country_code = data.country_code;
        if (data.website !== undefined) repository.website = data.website;
        if (data.company_code !== undefined) repository.company_code = data.company_code;
        if (data.license_number !== undefined) repository.license_number = data.license_number;
        if (data.tax_number !== undefined) repository.tax_number = data.tax_number;
        if (data.pan !== undefined) repository.pan = data.pan;
        if (data.paye_reference !== undefined) repository.paye_reference = data.paye_reference;
        if (data.pension_provider !== undefined) repository.pension_provider = data.pension_provider;
        if (data.is_sponsor_licence !== undefined) repository.is_sponsor_licence = data.is_sponsor_licence;
        if (data.selected_country !== undefined) repository.selected_country = data.selected_country;
        if (data.timezone !== undefined) repository.timezone = data.timezone;
        if (data.currency !== undefined) repository.currency = data.currency;
        if (data.tenantId !== undefined) repository.tenantId = data.tenantId;

        // Auto-build contact_name from first + last
        repository.contact_name = `${repository.contact_first_name || ''} ${repository.contact_last_name || ''}`.trim();

        if (data.address_1 !== undefined) repository.address_1 = data.address_1;
        if (data.address_2 !== undefined) repository.address_2 = data.address_2;
        if (data.city !== undefined) repository.city = data.city;
        if (data.state !== undefined) repository.state = data.state;

        if (data.country !== undefined) {
            repository.country = data.country;
        } else if (data.country_code?.name && !repository.country) {
            repository.country = data.country_code.name;
        }

        if (data.zipcode !== undefined) repository.zipcode = data.zipcode;
        if (data.status !== undefined) repository.status = data.status;

        if (data.iec !== undefined) repository.iec = data.iec;
        if (data.lut_no !== undefined) repository.lut_no = data.lut_no;
        if (data.lut_date !== undefined) repository.lut_date = data.lut_date;
        if (data.cin !== undefined) repository.cin = data.cin;
        if (data.default_port_of_loading !== undefined)
            repository.default_port_of_loading = data.default_port_of_loading;
        if (data.default_port_of_loading_id !== undefined)
            (repository as any).default_port_of_loading_id =
                data.default_port_of_loading_id || null;
        if (data.default_port_of_loading_snapshot !== undefined)
            (repository as any).default_port_of_loading_snapshot =
                data.default_port_of_loading_snapshot || null;
        if (data.default_declaration_text !== undefined)
            repository.default_declaration_text = data.default_declaration_text;
        if (data.default_terms !== undefined)
            repository.default_terms = data.default_terms;
        if (data.default_remarks !== undefined)
            repository.default_remarks = data.default_remarks;
        if (data.pov_default_remarks !== undefined)
            repository.pov_default_remarks = data.pov_default_remarks;
        if (data.authorised_signatory_name !== undefined)
            repository.authorised_signatory_name = data.authorised_signatory_name;
        if (data.footer_address !== undefined)
            repository.footer_address = data.footer_address;

        return this.companyRepository.save(repository, options);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Multi-address & multi-bank: validate, replace, hydrate
    // ─────────────────────────────────────────────────────────────────────

    private assertAddressesValid(
        addresses: CompanyAddressRequestDto[] | undefined
    ): void {
        if (!addresses || addresses.length === 0) return;
        const seenDefault: Record<string, boolean> = {};
        for (const a of addresses) {
            if (!a.is_default) continue;
            const t = (a.type || ENUM_COMPANY_ADDRESS_TYPE.CORPORATE) as string;
            if (seenDefault[t]) {
                throw new BadRequestException(
                    `Only one default address allowed per type (${t})`
                );
            }
            seenDefault[t] = true;
        }
    }

    async replaceAddresses(
        companyId: string,
        addresses: CompanyAddressRequestDto[] | undefined
    ): Promise<void> {
        this.assertAddressesValid(addresses);
        await this.addressRepository.softDeleteByCompanyId(companyId);
        if (!addresses || addresses.length === 0) return;
        for (const a of addresses) {
            await this.addressRepository.create({
                company_id: companyId,
                type: a.type || ENUM_COMPANY_ADDRESS_TYPE.CORPORATE,
                label: a.label,
                address_line1: a.address_line1,
                address_line2: a.address_line2,
                city: a.city,
                state: a.state,
                country: a.country,
                postcode: a.postcode,
                gstin: a.gstin,
                is_default: !!a.is_default,
            } as any);
        }

        // Sync the registered address back to the company's legacy scalar
        // address columns so PDF templates / payroll / other modules that
        // still read address_1 / city / etc. keep working. Pick:
        //   1) the default Corporate address, else
        //   2) the first Corporate address, else
        //   3) the first address of any type.
        const corporates = addresses.filter(
            (a) => (a.type || ENUM_COMPANY_ADDRESS_TYPE.CORPORATE) ===
                ENUM_COMPANY_ADDRESS_TYPE.CORPORATE
        );
        const primary =
            corporates.find((a) => a.is_default) ||
            corporates[0] ||
            addresses[0];
        if (primary) {
            const company = await this.companyRepository.findOneById<CompanyDoc>(
                companyId
            );
            if (company) {
                company.address_1 = primary.address_line1 || '';
                company.address_2 = primary.address_line2 || '';
                company.city = primary.city || '';
                company.state = primary.state || '';
                company.country = primary.country || company.country || '';
                company.zipcode = primary.postcode || '';
                await this.companyRepository.save(company);
            }
        }
    }

    private async assertBankAccountsValid(
        accounts: CompanyBankAccountRequestDto[] | undefined
    ): Promise<void> {
        if (!accounts || accounts.length === 0) return;

        const seenDefault: Record<string, boolean> = {};
        for (const a of accounts) {
            if (!a.is_default) continue;
            const k = a.currency_id;
            if (seenDefault[k]) {
                throw new BadRequestException(
                    'Only one default bank account allowed per currency'
                );
            }
            seenDefault[k] = true;
        }

        const ids = Array.from(new Set(accounts.map((a) => a.currency_id)));
        const found = await this.currencyRepository.findAll({
            _id: { $in: ids },
            soft_delete: false,
        } as any);
        if (found.length !== ids.length) {
            throw new BadRequestException(
                'One or more bank-account currencies are invalid'
            );
        }
    }

    async replaceBankAccounts(
        companyId: string,
        accounts: CompanyBankAccountRequestDto[] | undefined
    ): Promise<void> {
        await this.assertBankAccountsValid(accounts);
        await this.bankAccountRepository.softDeleteByCompanyId(companyId);
        if (!accounts || accounts.length === 0) return;
        for (const a of accounts) {
            await this.bankAccountRepository.create({
                company_id: companyId,
                bank_name: a.bank_name,
                account_holder_name: a.account_holder_name,
                account_number: a.account_number,
                ifsc: a.ifsc,
                swift_code: a.swift_code,
                iban: a.iban,
                ad_code: a.ad_code,
                currency_id: a.currency_id,
                branch_name: a.branch_name,
                branch_address: a.branch_address,
                account_type: a.account_type,
                is_default: !!a.is_default,
                notes: a.notes,
                is_active: a.is_active !== undefined ? a.is_active : true,
            } as any);
        }
    }

    async findAddressesByCompanyId(companyId: string): Promise<CompanyAddressDoc[]> {
        return this.addressRepository.findByCompanyId(companyId);
    }

    async findBankAccountsByCompanyId(
        companyId: string
    ): Promise<CompanyBankAccountDoc[]> {
        return this.bankAccountRepository.findByCompanyId(companyId);
    }

    async hydrateRelationsOnto(
        companyId: string,
        target: any
    ): Promise<void> {
        const [addresses, banks] = await Promise.all([
            this.findAddressesByCompanyId(companyId),
            this.findBankAccountsByCompanyId(companyId),
        ]);

        target.addresses = addresses.map((a) =>
            plainToInstance(CompanyAddressResponseDto, a)
        );

        const currencyIds = Array.from(
            new Set(banks.map((b) => b.currency_id.toString()))
        );
        const currencyCodeMap: Record<string, string> = {};
        if (currencyIds.length) {
            const rows = await this.currencyRepository.findAll({
                _id: { $in: currencyIds },
            } as any);
            for (const r of rows) currencyCodeMap[r._id.toString()] = r.code;
        }
        target.bank_accounts = banks.map((b) => {
            const r = plainToInstance(CompanyBankAccountResponseDto, b);
            r.currency_code = currencyCodeMap[b.currency_id.toString()];
            return r;
        });
    }

    async delete(
        repository: CompanyDoc,
        options?: IDatabaseSaveOptions
    ): Promise<CompanyDoc> {
        return this.companyRepository.softDelete(repository, options);
    }

    async findAllWithUser(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<CompanyDoc[]> {
        return this.companyRepository.findAllWithUser<CompanyDoc>(
            find,
            options
        );
    }

    async findAllWithUserByFilteringPlanIdFromSubscriptionObject(
        planId: string,
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<CompanyDoc[]> {
        return this.companyRepository.findAllWithUserByFilteringPlanIdFromSubscription<CompanyDoc>(
            planId,
            find,
            options
        );
    }

    async getTotalWithUserByFilteringPlanIdFromSubscriptionObject(
        planId: string,
        find?: Record<string, any>
    ): Promise<number> {
        return this.companyRepository.getTotalWithUserByFilteringPlanIdFromSubscription(
            planId,
            find
        );
    }

    async suspendCompanyAdmin(
        companyId: string,
        options?: IDatabaseSaveOptions
    ): Promise<{
        company: CompanyDoc;
        userId?: string;
        subscriptionId?: string;
        tenantUsersUpdated: number;
    }> {
        // Find the company
        const company = await this.findOneById(companyId);
        if (!company) {
            throw new Error('Company not found');
        }

        // 1. Update company status to INACTIVE
        const updatedCompany = await this.update(
            company,
            {
                status: ENUM_COMPANY_STATUS.INACTIVE,
            },
            options
        );

        // 2. Clear subscription fields from company and prepare return data
        let subscriptionId: string | undefined;
        if (company.subscription_id) {
            subscriptionId = company.subscription_id.toString();
        }

        await this.companyRepository.updateRaw(
            { _id: company._id },
            {
                is_subscribe: false,
                subscription_id: null,
            }
        );

        // Check and execute cleanup if both conditions are met
        if (subscriptionId) {
            try {
                const cleanupResult = await this.subscriptionCleanupService.checkAndExecuteCleanupWithMetrics(
                    subscriptionId,
                    company._id.toString(),
                    'company_suspend'
                );
                this.logger.log(`Cleanup check completed for company suspension ${company._id}: ${cleanupResult.message}`);
            } catch (error) {
                this.logger.error(`Failed to execute cleanup check for company suspension ${company._id}: ${error.message}`);
                // Continue with company suspension even if cleanup fails
            }
        }

        return {
            company: updatedCompany,
            userId: company.user_id ? company.user_id.toString() : undefined,
            subscriptionId,
            tenantUsersUpdated: 0, // Will be handled by the controller
        };
    }

    async updateSubscriptionStatus(
        companyId: string,
        isSubscribe: boolean,
        subscriptionId?: string,
        options?: IDatabaseSaveOptions
    ): Promise<CompanyDoc> {
        const company = await this.findOneById(companyId);
        if (!company) {
            throw new Error('Company not found');
        }

        // Update company subscription status
        await this.companyRepository.updateRaw(
            { _id: company._id },
            {
                is_subscribe: isSubscribe,
                subscription_id: subscriptionId || null,
            }
        );

        // Check and execute cleanup if is_subscribe is set to false
        if (!isSubscribe && subscriptionId) {
            try {
                const cleanupResult = await this.subscriptionCleanupService.checkAndExecuteCleanupWithMetrics(
                    subscriptionId,
                    company._id.toString(),
                    'company_suspend'
                );
                this.logger.log(`Cleanup check completed for company ${company._id}: ${cleanupResult.message}`);
            } catch (error) {
                this.logger.error(`Failed to execute cleanup check for company ${company._id}: ${error.message}`);
                // Continue with update even if cleanup fails
            }
        }

        // Return updated company
        return this.findOneById(companyId);
    }

    async reactivateCompanyAdmin(
        companyId: string,
        options?: IDatabaseSaveOptions
    ): Promise<{
        company: CompanyDoc;
        userId?: string;
    }> {
        // Find the company
        const company = await this.findOneById(companyId);
        if (!company) {
            throw new Error('Company not found');
        }

        // 1. Update company status to ACTIVE
        const updatedCompany = await this.update(
            company,
            {
                status: ENUM_COMPANY_STATUS.ACTIVE,
            },
            options
        );

        return {
            company: updatedCompany,
            userId: company.user_id ? company.user_id.toString() : undefined,
        };
    }

    async getTotalWithUser(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return this.companyRepository.getTotalWithUser(find, options);
    }

    async existByEmail(email: string): Promise<boolean> {
        return this.companyRepository.existByEmail(email);
    }

    async existByEmailExcludingId(
        email: string,
        excludeId: string
    ): Promise<boolean> {
        return this.companyRepository.existByEmailExcludingId(email, excludeId);
    }

    async findOneWithUser(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<CompanyDoc> {
        return this.companyRepository.findOneWithUser<CompanyDoc>(_id, options);
    }

    async softDelete(
        repository: CompanyDoc,
        options?: IDatabaseSaveOptions
    ): Promise<CompanyDoc> {
        repository.soft_delete = true;
        return this.companyRepository.save(repository, options);
    }

    mapList(companies: CompanyDoc[]): CompanyListResponseDto[] {
        try {
            if (!companies || !Array.isArray(companies)) {
                console.warn('Invalid companies data provided to mapList');
                return [];
            }

            return companies.map(company => {
                try {
                    return this.mapListItem(company);
                } catch (error) {
                    console.error(
                        'Error mapping individual company item:',
                        error
                    );
                    // Return a minimal company object as fallback
                    return {
                        _id: String(company._id || ''),
                        company_name: company.company_name || 'Unknown Company',
                        contact_name: company.contact_name || '',
                        contact_first_name:
                            company.contact_first_name || undefined,
                        contact_last_name:
                            company.contact_last_name || undefined,
                        email: company.email || '',
                        mobile: company.mobile || '',
                        website: company.website || undefined,
                        tenantId: company.tenantId || undefined,
                        user: undefined,
                        country_code: company.country_code || undefined,
                        createdAt: company.createdAt || new Date(),
                        updatedAt: company.updatedAt || new Date(),
                        status: company?.status || ENUM_COMPANY_STATUS.ACTIVE,
                    } as unknown as CompanyListResponseDto;
                }
            });
        } catch (error) {
            console.error('Critical error in mapList:', error);
            return [];
        }
    }

    mapListItem(company: CompanyDoc): CompanyListResponseDto {
        try {
            // Safely extract user data from populated field
            let userData = undefined;
            const populatedUser = (company as any).user_id;

            if (
                populatedUser &&
                typeof populatedUser === 'object' &&
                populatedUser._id
            ) {
                // Only extract necessary fields to prevent circular references
                userData = {
                    _id: String(populatedUser._id),
                    name: populatedUser.name || '',
                    first_name: populatedUser.first_name || undefined,
                    last_name: populatedUser.last_name || undefined,
                    email: populatedUser.email || '',
                    country_code: populatedUser.country_code || undefined,
                    photo: populatedUser.photo || undefined,
                };
            }

            const mapped = {
                _id: String(company._id),
                company_name: company.company_name || '',
                contact_name: company.contact_name || '',
                contact_first_name: company.contact_first_name || undefined,
                contact_last_name: company.contact_last_name || undefined,
                email: company.email || '',
                mobile: company.mobile || '',
                website: company.website || undefined,
                tenantId: company.tenantId || undefined,
                user: userData,
                country_code: company.country_code || undefined,
                createdAt: company.createdAt,
                updatedAt: company.updatedAt,
                status: company?.status || ENUM_COMPANY_STATUS.ACTIVE,
            } as unknown as CompanyListResponseDto;

            return mapped;
        } catch (error) {
            // Log error for debugging but provide fallback
            console.error('Error mapping company list item:', error);

            // Return basic company data without user information as fallback
            return {
                _id: String(company._id),
                company_name: company.company_name || '',
                contact_name: company.contact_name || '',
                contact_first_name: company.contact_first_name || undefined,
                contact_last_name: company.contact_last_name || undefined,
                email: company.email || '',
                mobile: company.mobile || '',
                website: company.website || undefined,
                tenantId: company.tenantId || undefined,
                user: undefined,
                createdAt: company.createdAt,
                updatedAt: company.updatedAt,
            } as unknown as CompanyListResponseDto;
        }
    }

    mapGet(company: CompanyDoc): CompanyGetResponseDto {
        try {
            // Safely extract user data from populated field
            let userData = undefined;
            const populatedUser = (company as any).user_id;

            if (populatedUser && typeof populatedUser === 'object' && populatedUser._id) {
                // join populated the user object (e.g. MongoDB $lookup)
                userData = {
                    _id: String(populatedUser._id),
                    name: populatedUser.name || '',
                    first_name: populatedUser.first_name || undefined,
                    last_name: populatedUser.last_name || undefined,
                    email: populatedUser.email || '',
                    mobile: populatedUser.mobile || '',
                    country_code: populatedUser.country_code || undefined,
                    photo: populatedUser.photo || undefined,
                };
            } else if (company.user_id && typeof company.user_id === 'string') {
                // user_id is a plain UUID string (PostgreSQL / no join) — still expose _id
                // so the frontend can use companyItem.user._id to identify the company admin
                userData = { _id: String(company.user_id), name: '', email: '' };
            }

            return plainToInstance(CompanyGetResponseDto, {
                _id: String(company._id),
                user_id: String(company.user_id),
                company_name: company.company_name || '',
                contact_name: company.contact_name || '',
                contact_first_name: company.contact_first_name || undefined,
                contact_middle_name: company.contact_middle_name || undefined,
                contact_last_name: company.contact_last_name || undefined,
                email: company.email || '',
                mobile: company.mobile || '',
                country_code: company.country_code || undefined,
                website: company.website || undefined,
                company_code: company.company_code || undefined,
                license_number: company.license_number || undefined,
                tax_number: company.tax_number || undefined,
                pan: company.pan || undefined,
                paye_reference: company.paye_reference || undefined,
                pension_provider: company.pension_provider || undefined,
                is_sponsor_licence: company.is_sponsor_licence || false,
                selected_country: company.selected_country || undefined,
                timezone: company.timezone || undefined,
                currency: company.currency || undefined,
                tenantId: company.tenantId || undefined,
                user: userData,
                address_1: company?.address_1 ?? '',
                address_2: company?.address_2 ?? '',
                state: company?.state ?? '',
                city: company?.city ?? '',
                country: company?.country ?? '',
                zipcode: company?.zipcode ?? '',
                iec: (company as any)?.iec || undefined,
                lut_no: (company as any)?.lut_no || undefined,
                lut_date: (company as any)?.lut_date || undefined,
                cin: (company as any)?.cin || undefined,
                default_port_of_loading:
                    (company as any)?.default_port_of_loading || undefined,
                default_port_of_loading_id:
                    (company as any)?.default_port_of_loading_id || undefined,
                default_port_of_loading_snapshot:
                    (company as any)?.default_port_of_loading_snapshot ||
                    undefined,
                default_declaration_text:
                    (company as any)?.default_declaration_text || undefined,
                default_terms:
                    (company as any)?.default_terms || undefined,
                default_remarks:
                    (company as any)?.default_remarks || undefined,
                pov_default_remarks:
                    (company as any)?.pov_default_remarks || undefined,
                authorised_signatory_name:
                    (company as any)?.authorised_signatory_name || undefined,
                footer_address:
                    (company as any)?.footer_address || undefined,
                createdAt: company.createdAt,
                updatedAt: company.updatedAt,
                deletedAt: company.deletedAt,
                status: company?.status || ENUM_COMPANY_STATUS.ACTIVE,
            });
        } catch (error) {
            // Log error for debugging but provide fallback
            console.error('Error mapping company get data:', error);

            // Return basic company data without user information as fallback
            return plainToInstance(CompanyGetResponseDto, {
                _id: String(company._id),
                user_id: String(company.user_id),
                company_name: company.company_name || '',
                contact_name: company.contact_name || '',
                contact_first_name: company.contact_first_name || undefined,
                contact_middle_name: company.contact_middle_name || undefined,
                contact_last_name: company.contact_last_name || undefined,
                email: company.email || '',
                mobile: company.mobile || '',
                country_code: company.country_code || undefined,
                website: company.website || undefined,
                company_code: company.company_code || undefined,
                license_number: company.license_number || undefined,
                tax_number: company.tax_number || undefined,
                pan: company.pan || undefined,
                paye_reference: company.paye_reference || undefined,
                pension_provider: company.pension_provider || undefined,
                is_sponsor_licence: company.is_sponsor_licence || false,
                selected_country: company.selected_country || undefined,
                timezone: company.timezone || undefined,
                currency: company.currency || undefined,
                tenantId: company.tenantId || undefined,
                user: undefined,
                iec: (company as any)?.iec || undefined,
                lut_no: (company as any)?.lut_no || undefined,
                lut_date: (company as any)?.lut_date || undefined,
                cin: (company as any)?.cin || undefined,
                default_port_of_loading:
                    (company as any)?.default_port_of_loading || undefined,
                default_port_of_loading_id:
                    (company as any)?.default_port_of_loading_id || undefined,
                default_port_of_loading_snapshot:
                    (company as any)?.default_port_of_loading_snapshot ||
                    undefined,
                default_declaration_text:
                    (company as any)?.default_declaration_text || undefined,
                default_terms:
                    (company as any)?.default_terms || undefined,
                default_remarks:
                    (company as any)?.default_remarks || undefined,
                pov_default_remarks:
                    (company as any)?.pov_default_remarks || undefined,
                authorised_signatory_name:
                    (company as any)?.authorised_signatory_name || undefined,
                footer_address:
                    (company as any)?.footer_address || undefined,
                createdAt: company.createdAt,
                updatedAt: company.updatedAt,
                deletedAt: company.deletedAt,
                status: company?.status || ENUM_COMPANY_STATUS.ACTIVE,
            });
        }
    }

    mapProfile(company: CompanyDoc): CompanyGetResponseDto {
        return this.mapGet(company);
    }

    async hardDelete(_id: string): Promise<boolean> {
        return this.companyRepository.hardDelete(_id);
    }
}
