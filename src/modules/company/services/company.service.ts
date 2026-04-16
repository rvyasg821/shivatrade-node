import { Injectable, Logger } from '@nestjs/common';
import {
    IDatabaseCreateOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseSaveOptions,
} from '@common/database/interfaces/database.interface';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import {
    CompanyDoc,
    CompanyEntity,
} from '@modules/company/repository/entities/company.entity';
import { CompanyListResponseDto } from '@modules/company/dtos/response/company.list.response.dto';
import { CompanyGetResponseDto } from '@modules/company/dtos/response/company.get.response.dto';
import { plainToInstance } from 'class-transformer';
import { ENUM_COMPANY_STATUS } from '../enums/company.enum';
import { SubscriptionCleanupService } from '@modules/subscription/services/subscription-cleanup.service';

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
}

@Injectable()
export class CompanyService {
    private readonly logger = new Logger(CompanyService.name);

    constructor(
        private readonly companyRepository: CompanyRepository,
        private readonly subscriptionCleanupService: SubscriptionCleanupService
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

        return this.companyRepository.save(repository, options);
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
                paye_reference: company.paye_reference || undefined,
                pension_provider: company.pension_provider || undefined,
                is_sponsor_licence: company.is_sponsor_licence || false,
                selected_country: company.selected_country || undefined,
                timezone: company.timezone || undefined,
                currency: company.currency || undefined,
                tenantId: company.tenantId || undefined,
                user: undefined,
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
