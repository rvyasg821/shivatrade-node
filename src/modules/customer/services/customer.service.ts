import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { CustomerRepository } from '../repository/repositories/customer.repository';
import { CustomerContactRepository } from '../repository/repositories/customer-contact.repository';
import { CustomerAddressRepository } from '../repository/repositories/customer-address.repository';
import { CustomerDoc } from '../repository/entities/customer.entity';
import { CustomerContactDoc } from '../repository/entities/customer-contact.entity';
import { CustomerAddressDoc } from '../repository/entities/customer-address.entity';
import {
    CustomerCreateRequestDto,
    CustomerContactRequestDto,
    CustomerAddressRequestDto,
} from '../dtos/request/customer.create.request.dto';
import { CustomerUpdateRequestDto } from '../dtos/request/customer.update.request.dto';
import {
    CustomerGetResponseDto,
    CustomerContactResponseDto,
    CustomerAddressResponseDto,
} from '../dtos/response/customer.get.response.dto';
import { CustomerListResponseDto } from '../dtos/response/customer.list.response.dto';
import { ENUM_CUSTOMER_ADDRESS_TYPE } from '../enums/customer.enum';
import { UserService } from '@modules/user/services/user.service';
import { RoleService } from '@modules/role/services/role.service';
import { AuthService } from '@modules/auth/services/auth.service';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { ENUM_USER_GENDER, ENUM_USER_SIGN_UP_FROM, ENUM_USER_STATUS } from '@modules/user/enums/user.enum';
import { HelperDateService } from '@common/helper/services/helper.date.service';
import { ImportContext } from '@common/import/import-context.interface';
import { DependencyCheckService } from '@modules/dependency-check/dependency-check.service';
import { CreatorScopeService } from '@modules/creator-scope/creator-scope.service';
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
        private readonly addressRepository: CustomerAddressRepository,
        private readonly userService: UserService,
        private readonly roleService: RoleService,
        private readonly authService: AuthService,
        private readonly configService: ConfigService,
        private readonly helperDateService: HelperDateService,
        private readonly dependencyCheckService: DependencyCheckService
    ) {}

    /**
     * Translate the simple { dial_code, phone, formatted, country_iso }
     * shape used on Vendor / Customer / Lead contacts into the richer
     * shape that the Users module's PhoneInput renders from. Missing
     * fields are filled with empty strings — they're cosmetic and the
     * PhoneInput will repopulate them when the user next edits the
     * profile.
     */
    private toUserCountryCode(simple: any): any {
        if (!simple || typeof simple !== 'object') return undefined;
        // Already in users' shape (camelCase) — pass through unchanged.
        if (simple.dialCode || simple.countryCode) return simple;
        const dialCode = simple.dial_code || '';
        const iso = simple.country_iso || '';
        const phone = simple.phone || '';
        return {
            dialCode,
            countryCode: iso,
            internationalNumber:
                simple.formatted || (dialCode ? `${dialCode}${phone}` : phone),
            nationalNumber: phone,
            number: phone,
            name: '',
            country_flag: '',
            format: '',
        };
    }

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

        // Harden against a missing name: fall back to the email local part so we
        // never call .trim() on undefined. Callers only reach here with an email.
        const fullName =
            (contact.name || '').trim() || (contact.email || '').trim();
        const [firstName, ...rest] = fullName.split(/\s+/);

        const user = await this.userService.create(
            {
                role: String(customerRole._id),
                name: fullName,
                first_name: firstName || fullName,
                last_name: rest.join(' ') || '',
                email: (contact.email || '').trim().toLowerCase(),
                country_code: this.toUserCountryCode(contact.country_code),
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

        // Harden against a missing name (see provisionCustomerUser).
        const fullName =
            (contact.name || '').trim() || (contact.email || '').trim();
        const [firstName, ...rest] = fullName.split(/\s+/);

        user.name = fullName;
        user.first_name = firstName || fullName;
        user.last_name = rest.join(' ') || '';
        user.email = (contact.email || '').trim().toLowerCase();
        user.mobile = contact.phone || '';
        if (contact.country_code) {
            user.country_code = this.toUserCountryCode(contact.country_code);
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
    /**
     * True when `email` can be used for a new customer primary contact (no
     * live user already owns it). Lets callers (e.g. auto-create-from-lead)
     * decide to drop a colliding email rather than hard-fail.
     */
    async isPrimaryEmailAvailable(email?: string): Promise<boolean> {
        if (!email || !email.trim()) return false;
        const existingUser = await this.userService.findOneByEmail(
            email.trim().toLowerCase()
        );
        // Available unless a genuinely ACTIVE user owns it. Soft-deleted or
        // inactive rows are revived by userService.create() (Users/Employee
        // /Agent recipe).
        return (
            !existingUser ||
            !!(existingUser as any).deleted ||
            existingUser.status !== ENUM_USER_STATUS.ACTIVE
        );
    }

    private async assertPrimaryEmailAvailable(
        email: string,
        customerId?: string
    ): Promise<void> {
        const normalized = email.trim().toLowerCase();
        const existingUser = await this.userService.findOneByEmail(normalized);
        // Only a genuinely ACTIVE user blocks re-use. Soft-deleted or inactive
        // rows are revived + overwritten by userService.create() (same recipe
        // as Users/Employee/Agent create flows).
        if (
            !existingUser ||
            (existingUser as any).deleted ||
            existingUser.status !== ENUM_USER_STATUS.ACTIVE
        ) {
            return;
        }

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
        createdBy: string,
        ctx?: ImportContext
    ): Promise<CustomerDoc> {
        const silent = !!ctx?.silent;
        const name = data.company_name.trim();

        this.assertContactsValid(data.contacts);
        this.assertAddressesValid(data.addresses);

        // Revive path — if any contact email matches a SOFT-DELETED customer
        // in this company, restore that record instead of creating a new one.
        // Preserves history (quotations / PFIs / POs that pointed at the
        // deleted customer become valid again, and the lead's
        // converted_customer_id linkage is naturally restored).
        const revived = await this.tryReviveDeletedCustomer(
            companyId,
            data,
            createdBy
        );
        if (revived) return revived;

        const exists = await this.customerRepository.isCompanyNameExists(companyId, name);
        if (exists) {
            throw new BadRequestException(
                `Customer '${name}' already exists for this company`
            );
        }

        await this.assertContactEmailsUnique(companyId, data.contacts);

        const { contacts: contactsRaw, addresses, ...customerFields } = data;
        const contacts = contactsRaw || [];
        const primaryContact = contacts.find((c) => c.is_primary) || contacts[0];
        const primaryHasEmail = !!(
            primaryContact &&
            primaryContact.email &&
            primaryContact.email.trim()
        );

        // Import mode (silent) backfills historical customers with no login:
        // skip the users-table email pre-flight and the login-user + welcome
        // email provisioning (§12.4). Live create (no ctx) is unaffected.
        //
        // A customer with no contact — or a contact with a blank email — simply
        // gets NO portal login (primaryUserId stays undefined).
        let primaryUserId: string | undefined;
        if (!silent && primaryHasEmail) {
            // Pre-flight: primary email must be free in users table BEFORE writes
            await this.assertPrimaryEmailAvailable(primaryContact.email);
            // Provision the user FIRST so a failure doesn't orphan the customer
            primaryUserId = await this.provisionCustomerUser(
                companyId,
                primaryContact
            );
        }

        if (ctx?.status) {
            (customerFields as any).status = ctx.status;
            (customerFields as any).is_active = ctx.status === 'active';
        }

        const customer = await this.customerRepository.create({
            ...customerFields,
            company_name: name,
            company_id: companyId,
            created_by: createdBy,
        } as any);

        for (const c of contacts) {
            await this.contactRepository.create({
                ...c,
                email: c.email ? c.email.trim().toLowerCase() : undefined,
                customer_id: customer._id.toString(),
                company_id: companyId,
                user_id: c === primaryContact ? primaryUserId : undefined,
            } as any);
        }

        await this.replaceAddresses(companyId, customer._id.toString(), addresses);

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

        if (data.addresses !== undefined) {
            this.assertAddressesValid(data.addresses);
        }

        const wasActive = !!customer.is_active;

        const { contacts: _c, addresses: _a, ...scalarFields } = data;
        Object.assign(customer, scalarFields);
        // Keep status and is_active consistent.
        if (data.status !== undefined) {
            customer.is_active = data.status === ('active' as any);
        } else if (data.is_active !== undefined) {
            customer.status = data.is_active
                ? ('active' as any)
                : ('inactive' as any);
        }
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
            const nextPrimary =
                nextContacts.find((c) => c.is_primary) || nextContacts[0];
            const nextPrimaryHasEmail = !!(
                nextPrimary &&
                nextPrimary.email &&
                nextPrimary.email.trim()
            );

            // Pre-flight: new primary email must be free in users table BEFORE
            // wiping contacts. The current customer's existing primary user is
            // exempt. Skip entirely when the new primary has no email.
            if (nextPrimaryHasEmail) {
                await this.assertPrimaryEmailAvailable(
                    nextPrimary.email,
                    customer._id.toString()
                );
            }

            const existingContacts = await this.contactRepository.findByCustomerId(
                customer._id.toString()
            );
            const existingPrimary = existingContacts.find((c) => c.is_primary);
            const existingUserId = existingPrimary?.user_id?.toString();

            // Resolve / sync / provision user BEFORE wiping old contacts. Only
            // touch login provisioning when the new primary actually has an
            // email; otherwise leave any existing user link as-is (no login is
            // created for an email-less contact).
            let primaryUserId = existingUserId;
            if (nextPrimaryHasEmail) {
                if (primaryUserId) {
                    const synced = await this.syncCustomerUser(
                        primaryUserId,
                        nextPrimary
                    );
                    if (!synced) {
                        primaryUserId = await this.provisionCustomerUser(
                            companyId,
                            nextPrimary
                        );
                    }
                } else {
                    primaryUserId = await this.provisionCustomerUser(
                        companyId,
                        nextPrimary
                    );
                }
            }

            await this.contactRepository.softDeleteByCustomerId(
                customer._id.toString()
            );

            for (const c of nextContacts) {
                await this.contactRepository.create({
                    name: c.name,
                    designation: c.designation,
                    email: c.email ? c.email.trim().toLowerCase() : undefined,
                    phone: c.phone,
                    country_code: c.country_code,
                    is_primary: !!c.is_primary,
                    customer_id: customer._id.toString(),
                    company_id: companyId,
                    user_id: c === nextPrimary ? primaryUserId : undefined,
                } as any);
            }
        }

        if (data.addresses !== undefined) {
            await this.replaceAddresses(
                companyId,
                customer._id.toString(),
                data.addresses
            );
        }

        this.logger.log(`Customer updated: ${customer._id}`);
        return updated;
    }

    async softDelete(customer: CustomerDoc, deletedBy?: string): Promise<CustomerDoc> {
        // Block deletion while the customer is still used by any live document
        // (Lead / Quotation / Sales Order / Invoice). Customer stays a
        // soft-delete master (revive recipe) — guarded, not hard-deleted.
        await this.dependencyCheckService.assertCustomerNotInUse(
            customer._id.toString()
        );

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
        await this.addressRepository.softDeleteByCustomerId(customer._id.toString());

        this.logger.log(`Customer soft deleted: ${customer._id}`);
        return updated;
    }

    /**
     * Bulk soft-delete. Loops the SAME guarded single-delete so a customer that
     * is still used by a live document (Lead / Quotation / Sales Order /
     * Invoice) is skipped, not force-deleted. Returns the ids actually deleted
     * and the ones skipped with a reason.
     */
    async deleteMany(
        ids: string[],
        deletedBy?: string
    ): Promise<{
        deleted: string[];
        skipped: Array<{ id: string; reason: string }>;
    }> {
        const deleted: string[] = [];
        const skipped: Array<{ id: string; reason: string }> = [];
        for (const id of ids) {
            try {
                const customer = await this.findOneById(id);
                await this.softDelete(customer, deletedBy);
                deleted.push(id);
            } catch (e: any) {
                skipped.push({ id, reason: e?.message || 'Cannot delete' });
            }
        }
        return { deleted, skipped };
    }

    private assertAddressesValid(
        addresses: CustomerAddressRequestDto[] | undefined
    ): void {
        if (!addresses || addresses.length === 0) return;
        // At most one default per type.
        const seenDefault: Record<string, boolean> = {};
        for (const a of addresses) {
            if (!a.is_default) continue;
            const t = (a.type || ENUM_CUSTOMER_ADDRESS_TYPE.BILL_TO) as string;
            if (seenDefault[t]) {
                throw new BadRequestException(
                    `Only one default address allowed per type (${t})`
                );
            }
            seenDefault[t] = true;
        }
    }

    private async replaceAddresses(
        companyId: string,
        customerId: string,
        addresses: CustomerAddressRequestDto[] | undefined
    ): Promise<void> {
        await this.addressRepository.softDeleteByCustomerId(customerId);
        if (!addresses || addresses.length === 0) return;
        for (const a of addresses) {
            await this.addressRepository.create({
                customer_id: customerId,
                company_id: companyId,
                type: a.type || ENUM_CUSTOMER_ADDRESS_TYPE.BILL_TO,
                label: a.label,
                address_line1: a.address_line1,
                address_line2: a.address_line2,
                city: a.city,
                state: a.state,
                country: a.country,
                postcode: a.postcode,
                gstin: a.gstin,
                iec: a.iec,
                is_default: !!a.is_default,
            } as any);
        }
    }

    private assertContactsValid(contacts: CustomerContactRequestDto[]): void {
        // A customer may now have no contact at all — only company_name is
        // required. When contacts are present we still guard consistency, but
        // nothing here is mandatory.
        if (!contacts || contacts.length === 0) return;
        const primaryCount = contacts.filter((c) => c.is_primary).length;
        if (primaryCount > 1) {
            throw new BadRequestException('Only one contact can be marked as primary');
        }
        // Duplicate-email guard only applies to contacts that actually carry an
        // email; blank emails are never a collision.
        const emails = contacts
            .filter((c) => c.email && c.email.trim())
            .map((c) => c.email.trim().toLowerCase());
        const dup = emails.find((e, i) => emails.indexOf(e) !== i);
        if (dup) {
            throw new BadRequestException(`Duplicate contact email: ${dup}`);
        }
    }

    // ── Revive flow ─────────────────────────────────────────────────────
    //
    // Looks up any soft-deleted customer in this company that owned an
    // email present in the new payload. If found, restores the customer
    // (and its contacts + addresses) with the new payload's data instead
    // of creating a fresh row. Returns null when no match.
    private async tryReviveDeletedCustomer(
        companyId: string,
        data: CustomerCreateRequestDto,
        updatedBy: string
    ): Promise<CustomerDoc | null> {
        // Look for the first email in the payload that maps to a
        // soft-deleted contact in this company. Contacts with no email can't
        // match anything — skip them (and safely no-op when there are none).
        const payloadContacts = data.contacts || [];
        let matchedCustomerId: string | null = null;
        for (const c of payloadContacts) {
            if (!c.email || !c.email.trim()) continue;
            const email = c.email.trim().toLowerCase();
            const stale = await this.contactRepository.findSoftDeletedByEmail(
                companyId,
                email
            );
            if (stale?.customer_id) {
                matchedCustomerId = stale.customer_id.toString();
                break;
            }
        }
        if (!matchedCustomerId) return null;

        // Pull the customer — it must be soft-deleted to qualify for revive.
        // Pass withDeleted=true so the base auto-filter (deleted=false) doesn't
        // hide it (softDelete sets BOTH soft_delete=true and deleted=true).
        const customer = await this.customerRepository.findOneById(
            matchedCustomerId,
            { withDeleted: true }
        );
        if (!customer || !(customer as any).soft_delete) return null;

        // Provision (or reuse) the primary user row up front. If this
        // fails we haven't touched any existing data yet. Only provision when
        // the primary contact actually carries an email; otherwise the revived
        // customer simply has no portal login.
        const primaryContact =
            payloadContacts.find((c) => c.is_primary) || payloadContacts[0];
        const primaryHasEmail = !!(
            primaryContact &&
            primaryContact.email &&
            primaryContact.email.trim()
        );
        let primaryUserId: string | undefined;
        if (primaryHasEmail) {
            await this.assertPrimaryEmailAvailable(primaryContact.email);
            primaryUserId = await this.provisionCustomerUser(
                companyId,
                primaryContact
            );
        }

        // Overwrite scalar fields with the new payload — same shape used
        // by the regular create path.
        const { contacts, addresses, ...customerFields } = data;
        Object.assign(customer, customerFields);
        (customer as any).company_name = data.company_name.trim();
        (customer as any).soft_delete = false;
        (customer as any).is_active = true;
        // Clear the base entity's deleted flag too — softDelete sets both
        // (see customer.service.ts line ~411). Without this, future
        // findOneById() calls (which auto-filter deleted=false) would
        // still treat the revived row as gone.
        (customer as any).deleted = false;
        (customer as any).deletedAt = null;
        (customer as any).deletedBy = null;
        (customer as any).updatedBy = updatedBy;
        await this.customerRepository.save(customer);

        // Replace contacts: soft-delete any lingering rows on this
        // customer (active or stale), then create fresh from payload.
        await this.contactRepository.softDeleteByCustomerId(
            customer._id.toString()
        );
        for (const c of contacts) {
            await this.contactRepository.create({
                ...c,
                email: c.email ? c.email.trim().toLowerCase() : undefined,
                customer_id: customer._id.toString(),
                company_id: companyId,
                user_id: c === primaryContact ? primaryUserId : undefined,
            } as any);
        }

        // replaceAddresses already soft-deletes existing + creates new.
        await this.replaceAddresses(
            companyId,
            customer._id.toString(),
            addresses
        );

        this.logger.log(
            `Customer revived: ${customer._id} for company: ${companyId}`
        );
        return customer;
    }

    private async assertContactEmailsUnique(
        companyId: string,
        contacts: CustomerContactRequestDto[],
        excludeCustomerId?: string
    ): Promise<void> {
        for (const c of contacts || []) {
            // Blank contact emails can't collide — skip them.
            if (!c.email || !c.email.trim()) continue;
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
            // Compose a usable country_code for listing display, including
            // fabricating one with India default for legacy records that have
            // no country_code saved at all.
            let cc: any = primary.country_code || null;
            if (!cc && primary.phone) {
                cc = { dial_code: '+91', phone: primary.phone };
            }
            if (cc && !cc.formatted) {
                const dial = cc.dial_code || cc.dialCode || '';
                const digits = cc.phone || primary.phone || '';
                if (dial || digits) {
                    cc.formatted = dial && digits
                        ? `${dial} ${digits}`
                        : dial || digits;
                }
            }
            (dto as any).primary_contact_country_code = cc;
        }
        return dto;
    }

    async mapGetWithRelations(customer: CustomerDoc): Promise<CustomerGetResponseDto> {
        const dto = plainToInstance(CustomerGetResponseDto, customer);
        const [contacts, addresses] = await Promise.all([
            this.contactRepository.findByCustomerId(customer._id.toString()),
            this.addressRepository.findByCustomerId(customer._id.toString()),
        ]);
        this.hydrateWithContacts(dto, contacts);
        dto.addresses = addresses.map((a) =>
            plainToInstance(CustomerAddressResponseDto, a)
        );
        return dto;
    }

    async mapListWithRelations(
        customers: CustomerDoc[]
    ): Promise<CustomerListResponseDto[]> {
        const customerIds = customers.map((c) => c._id.toString());
        const [allContacts, allAddresses] = await Promise.all([
            customerIds.length
                ? this.contactRepository.findAll({
                      customer_id: { $in: customerIds },
                      soft_delete: false,
                  } as any)
                : Promise.resolve([] as CustomerContactDoc[]),
            customerIds.length
                ? this.addressRepository.findByCustomerIds(customerIds)
                : Promise.resolve([] as CustomerAddressDoc[]),
        ]);
        const contactsByCustomer: Record<string, CustomerContactDoc[]> = {};
        for (const c of allContacts) {
            const cid = c.customer_id.toString();
            (contactsByCustomer[cid] ||= []).push(c);
        }
        const addressesByCustomer: Record<string, CustomerAddressDoc[]> = {};
        for (const a of allAddresses) {
            const cid = a.customer_id.toString();
            (addressesByCustomer[cid] ||= []).push(a);
        }

        return customers.map((c) => {
            const dto = plainToInstance(CustomerListResponseDto, c);
            this.hydrateWithContacts(dto, contactsByCustomer[c._id.toString()] || []);
            const addrs = addressesByCustomer[c._id.toString()] || [];
            dto.addresses = addrs.map((a) =>
                plainToInstance(CustomerAddressResponseDto, a)
            );
            // Surface a single country on the row for listing display —
            // default-or-first address wins.
            const addr = addrs.find((a) => a.is_default) || addrs[0];
            if (addr?.country) dto.country = addr.country;
            return dto;
        });
    }

    // ── KPI stats for the customer listing tile strip ────────────────────
    //
    // Counts over the SAME creator/search scope the listing uses, but NOT
    // filtered by the active/inactive tab — so the tiles always show the
    // true breakdown regardless of which status tab is selected. Four cheap
    // COUNT(*) queries (total / active / inactive / new-30d) run in parallel.
    async stats(
        companyId: string,
        filters: { search?: string; country?: string },
        // Ownership scope from CreatorScopeService: undefined = no filter,
        // string = one creator, string[] = a set (Location Admin "All").
        creator?: undefined | string | string[]
    ): Promise<{
        total: number;
        by_status: Record<string, number>;
        new_30d: number;
    }> {
        const base: any = { soft_delete: false };
        if (companyId) base.company_id = companyId;
        if (filters.country) base.country = filters.country;

        const search =
            typeof filters.search === 'string' ? filters.search.trim() : '';
        if (search) {
            // Mirror the /list search: only real CustomerEntity columns (city/
            // country are on the address table, not this entity).
            base.$or = [
                { company_name: { $regex: search, $options: 'i' } },
                { website: { $regex: search, $options: 'i' } },
                { gstin: { $regex: search, $options: 'i' } },
                { pan: { $regex: search, $options: 'i' } },
                { iec: { $regex: search, $options: 'i' } },
            ];
        }

        // Same ownership scope as /list so the tiles match the table.
        Object.assign(base, CreatorScopeService.toFind(creator));

        const now = this.helperDateService.create();
        const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const [total, active, inactive, new_30d] = await Promise.all([
            this.customerRepository.getTotal(base),
            this.customerRepository.getTotal({ ...base, is_active: true }),
            this.customerRepository.getTotal({ ...base, is_active: false }),
            this.customerRepository.getTotal({
                ...base,
                createdAt: { $gte: cutoff },
            }),
        ]);

        return {
            total,
            by_status: { ACTIVE: active, INACTIVE: inactive },
            new_30d,
        };
    }
}
