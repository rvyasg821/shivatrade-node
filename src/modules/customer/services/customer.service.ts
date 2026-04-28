import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { CustomerRepository } from '../repository/repositories/customer.repository';
import { CustomerContactRepository } from '../repository/repositories/customer-contact.repository';
import { CustomerDoc } from '../repository/entities/customer.entity';
import { CustomerContactDoc } from '../repository/entities/customer-contact.entity';
import { CustomerCreateRequestDto, CustomerContactRequestDto } from '../dtos/request/customer.create.request.dto';
import { CustomerUpdateRequestDto } from '../dtos/request/customer.update.request.dto';
import {
    CustomerGetResponseDto,
    CustomerContactResponseDto,
} from '../dtos/response/customer.get.response.dto';
import { CustomerListResponseDto } from '../dtos/response/customer.list.response.dto';
import { UserService } from '@modules/user/services/user.service';
import { RoleService } from '@modules/role/services/role.service';
import { AuthService } from '@modules/auth/services/auth.service';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { ENUM_USER_GENDER, ENUM_USER_SIGN_UP_FROM, ENUM_USER_STATUS } from '@modules/user/enums/user.enum';
import { HelperDateService } from '@common/helper/services/helper.date.service';
import {
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
} from '@common/database/interfaces/database.interface';

@Injectable()
export class CustomerService {
    private readonly logger = new Logger(CustomerService.name);

    constructor(
        private readonly customerRepository: CustomerRepository,
        private readonly contactRepository: CustomerContactRepository,
        private readonly userService: UserService,
        private readonly roleService: RoleService,
        private readonly authService: AuthService,
        private readonly configService: ConfigService,
        private readonly helperDateService: HelperDateService
    ) {}

    private async provisionCustomerUser(
        companyId: string,
        contact: CustomerContactRequestDto
    ): Promise<string> {
        const customerRole = await this.roleService.findOneByName(
            ENUM_SYSTEM_ROLE.CUSTOMER
        );
        if (!customerRole) {
            throw new BadRequestException(
                'Customer role is not seeded; run seed:role first'
            );
        }

        const defaultPassword = this.configService.get<string>(
            'auth.password.defaultPassword'
        );
        const passwordData = this.authService.createPassword(defaultPassword);

        const fullName = contact.name.trim();
        const [firstName, ...rest] = fullName.split(/\s+/);

        const user = await this.userService.create(
            {
                role: String(customerRole._id),
                name: fullName,
                first_name: firstName || fullName,
                last_name: rest.join(' ') || '',
                email: contact.email.trim().toLowerCase(),
                country_code: (contact.country_code as any) || undefined,
                mobile: contact.phone || '',
                gender: ENUM_USER_GENDER.MALE,
                companyId,
                status: ENUM_USER_STATUS.ACTIVE,
                roleLevel: customerRole.level,
            } as any,
            passwordData,
            ENUM_USER_SIGN_UP_FROM.ADMIN
        );

        return String(user._id);
    }

    private async syncCustomerUser(
        userId: string,
        contact: CustomerContactRequestDto
    ): Promise<boolean> {
        const user = await this.userService.findOneById(userId);
        if (!user) return false;

        const fullName = contact.name.trim();
        const [firstName, ...rest] = fullName.split(/\s+/);

        user.name = fullName;
        user.first_name = firstName || fullName;
        user.last_name = rest.join(' ') || '';
        user.email = contact.email.trim().toLowerCase();
        user.mobile = contact.phone || '';
        if (contact.country_code) {
            user.country_code = contact.country_code as any;
        }
        await this.userService.save(user);
        return true;
    }

    private async deactivateCustomerUser(
        userId: string,
        deletedBy?: string
    ): Promise<void> {
        const user = await this.userService.findOneById(userId);
        if (!user) return;
        user.deleted = true;
        user.deletedAt = this.helperDateService.create();
        if (deletedBy) (user as any).deletedBy = deletedBy;
        user.status = ENUM_USER_STATUS.INACTIVE;
        await this.userService.save(user);
    }

    private async syncCustomerUserStatus(
        userId: string,
        customerIsActive: boolean
    ): Promise<void> {
        const user = await this.userService.findOneById(userId);
        if (!user) return;
        user.is_active = customerIsActive;
        user.status = customerIsActive
            ? ENUM_USER_STATUS.ACTIVE
            : ENUM_USER_STATUS.INACTIVE;
        await this.userService.save(user);
    }

    /**
     * Reject if the primary contact's email is already attached to another
     * user in the users table. The same customer's existing primary user is
     * exempt (it will be re-synced rather than re-created).
     */
    private async assertPrimaryEmailAvailable(
        email: string,
        customerId?: string
    ): Promise<void> {
        const normalized = email.trim().toLowerCase();
        const existingUser = await this.userService.findOneByEmail(normalized);
        if (!existingUser || (existingUser as any).deleted) return;

        if (customerId) {
            const ownContact = await this.contactRepository.findOne({
                user_id: String(existingUser._id),
                customer_id: customerId,
                is_primary: true,
                soft_delete: false,
            });
            if (ownContact) return;
        }

        throw new BadRequestException(
            `Email '${normalized}' is already in use`
        );
    }

    async create(
        companyId: string,
        data: CustomerCreateRequestDto,
        createdBy: string
    ): Promise<CustomerDoc> {
        const name = data.company_name.trim();

        const exists = await this.customerRepository.isCompanyNameExists(companyId, name);
        if (exists) {
            throw new BadRequestException(
                `Customer '${name}' already exists for this company`
            );
        }

        this.assertContactsValid(data.contacts);
        await this.assertContactEmailsUnique(companyId, data.contacts);

        const { contacts, ...customerFields } = data;
        const primaryContact = contacts.find((c) => c.is_primary) || contacts[0];

        // Pre-flight: primary email must be free in users table BEFORE any writes
        await this.assertPrimaryEmailAvailable(primaryContact.email);

        // Provision the user FIRST so a failure doesn't leave an orphan customer
        const primaryUserId = await this.provisionCustomerUser(companyId, primaryContact);

        const customer = await this.customerRepository.create({
            ...customerFields,
            company_name: name,
            company_id: companyId,
            created_by: createdBy,
        } as any);

        for (const c of contacts) {
            await this.contactRepository.create({
                ...c,
                email: c.email.trim().toLowerCase(),
                customer_id: customer._id.toString(),
                company_id: companyId,
                user_id: c === primaryContact ? primaryUserId : undefined,
            } as any);
        }

        this.logger.log(
            `Customer created: ${customer._id} for company: ${companyId} (customer user: ${primaryUserId})`
        );
        return customer;
    }

    async findOneById(
        customerId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<CustomerDoc> {
        const customer = await this.customerRepository.findOneById(customerId, options);
        if (!customer) {
            throw new NotFoundException('Customer not found');
        }
        return customer;
    }

    async findAll(
        companyId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<CustomerDoc[]> {
        return this.customerRepository.findByCompanyId(companyId, options);
    }

    async update(
        customer: CustomerDoc,
        data: CustomerUpdateRequestDto
    ): Promise<CustomerDoc> {
        const companyId = customer.company_id.toString();

        if (data.company_name && data.company_name.trim() !== customer.company_name) {
            const exists = await this.customerRepository.isCompanyNameExists(
                companyId,
                data.company_name.trim(),
                customer._id.toString()
            );
            if (exists) {
                throw new BadRequestException(
                    `Customer '${data.company_name.trim()}' already exists for this company`
                );
            }
            data.company_name = data.company_name.trim();
        }

        let nextContacts: CustomerContactRequestDto[] | undefined;
        if (data.contacts) {
            this.assertContactsValid(data.contacts);
            await this.assertContactEmailsUnique(
                companyId,
                data.contacts,
                customer._id.toString()
            );
            nextContacts = data.contacts;
        }

        const wasActive = !!customer.is_active;

        const { contacts: _c, ...scalarFields } = data;
        Object.assign(customer, scalarFields);
        const updated = await this.customerRepository.save(customer);

        if (wasActive !== !!customer.is_active) {
            const existingPrimary = await this.contactRepository.findOne({
                customer_id: customer._id.toString(),
                is_primary: true,
                soft_delete: false,
            } as any);
            if (existingPrimary?.user_id) {
                await this.syncCustomerUserStatus(
                    existingPrimary.user_id.toString(),
                    !!customer.is_active
                );
            }
        }

        if (nextContacts) {
            const nextPrimary = nextContacts.find((c) => c.is_primary) || nextContacts[0];

            // Pre-flight: new primary email must be free in users table BEFORE wiping contacts.
            // The current customer's existing primary user is exempt.
            await this.assertPrimaryEmailAvailable(
                nextPrimary.email,
                customer._id.toString()
            );

            const existingContacts = await this.contactRepository.findByCustomerId(
                customer._id.toString()
            );
            const existingPrimary = existingContacts.find((c) => c.is_primary);
            const existingUserId = existingPrimary?.user_id?.toString();

            // Resolve / sync / provision user BEFORE wiping old contacts
            let primaryUserId = existingUserId;
            if (primaryUserId) {
                const synced = await this.syncCustomerUser(primaryUserId, nextPrimary);
                if (!synced) {
                    primaryUserId = await this.provisionCustomerUser(companyId, nextPrimary);
                }
            } else {
                primaryUserId = await this.provisionCustomerUser(companyId, nextPrimary);
            }

            await this.contactRepository.softDeleteByCustomerId(
                customer._id.toString()
            );

            for (const c of nextContacts) {
                await this.contactRepository.create({
                    name: c.name,
                    designation: c.designation,
                    email: c.email.trim().toLowerCase(),
                    phone: c.phone,
                    country_code: c.country_code,
                    is_primary: !!c.is_primary,
                    customer_id: customer._id.toString(),
                    company_id: companyId,
                    user_id: c === nextPrimary ? primaryUserId : undefined,
                } as any);
            }
        }

        this.logger.log(`Customer updated: ${customer._id}`);
        return updated;
    }

    async softDelete(customer: CustomerDoc, deletedBy?: string): Promise<CustomerDoc> {
        const existingContacts = await this.contactRepository.findByCustomerId(
            customer._id.toString()
        );
        for (const c of existingContacts) {
            if (c.user_id) {
                await this.deactivateCustomerUser(c.user_id.toString(), deletedBy);
            }
        }

        customer.soft_delete = true;
        customer.is_active = false;
        (customer as any).deleted = true;
        (customer as any).deletedAt = new Date();
        if (deletedBy) (customer as any).deletedBy = deletedBy;
        const updated = await this.customerRepository.save(customer);
        await this.contactRepository.softDeleteByCustomerId(customer._id.toString());

        this.logger.log(`Customer soft deleted: ${customer._id}`);
        return updated;
    }

    private assertContactsValid(contacts: CustomerContactRequestDto[]): void {
        if (!contacts || contacts.length === 0) {
            throw new BadRequestException('At least one contact person is required');
        }
        const primaryCount = contacts.filter((c) => c.is_primary).length;
        if (primaryCount === 0) {
            throw new BadRequestException('One contact must be marked as primary');
        }
        if (primaryCount > 1) {
            throw new BadRequestException('Only one contact can be marked as primary');
        }
        const emails = contacts.map((c) => c.email.trim().toLowerCase());
        const dup = emails.find((e, i) => emails.indexOf(e) !== i);
        if (dup) {
            throw new BadRequestException(`Duplicate contact email: ${dup}`);
        }
    }

    private async assertContactEmailsUnique(
        companyId: string,
        contacts: CustomerContactRequestDto[],
        excludeCustomerId?: string
    ): Promise<void> {
        for (const c of contacts) {
            const email = c.email.trim().toLowerCase();
            const exists = await this.contactRepository.isEmailExists(companyId, email);
            if (exists) {
                if (!excludeCustomerId) {
                    throw new BadRequestException(
                        `Contact email '${email}' is already in use`
                    );
                }
                const existing = await this.contactRepository.findOne({
                    company_id: companyId,
                    email,
                    soft_delete: false,
                });
                if (existing && existing.customer_id.toString() !== excludeCustomerId) {
                    throw new BadRequestException(
                        `Contact email '${email}' is already in use by another customer`
                    );
                }
            }
        }
    }

    private hydrateWithContacts(
        dto: CustomerGetResponseDto,
        contacts: CustomerContactDoc[]
    ): CustomerGetResponseDto {
        dto.contacts = contacts.map((c) =>
            plainToInstance(CustomerContactResponseDto, c)
        );
        const primary = contacts.find((c) => c.is_primary);
        if (primary) {
            dto.primary_contact_name = primary.name;
            dto.primary_contact_email = primary.email;
            dto.primary_contact_phone = primary.phone;
        }
        return dto;
    }

    async mapGetWithRelations(customer: CustomerDoc): Promise<CustomerGetResponseDto> {
        const dto = plainToInstance(CustomerGetResponseDto, customer);
        const contacts = await this.contactRepository.findByCustomerId(
            customer._id.toString()
        );
        return this.hydrateWithContacts(dto, contacts);
    }

    async mapListWithRelations(
        customers: CustomerDoc[]
    ): Promise<CustomerListResponseDto[]> {
        const customerIds = customers.map((c) => c._id.toString());
        const allContacts = customerIds.length
            ? await this.contactRepository.findAll({
                  customer_id: { $in: customerIds },
                  soft_delete: false,
              } as any)
            : [];
        const contactsByCustomer: Record<string, CustomerContactDoc[]> = {};
        for (const c of allContacts) {
            const cid = c.customer_id.toString();
            (contactsByCustomer[cid] ||= []).push(c);
        }

        return customers.map((c) => {
            const dto = plainToInstance(CustomerListResponseDto, c);
            return this.hydrateWithContacts(dto, contactsByCustomer[c._id.toString()] || []);
        });
    }
}
