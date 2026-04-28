import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { VendorRepository } from '../repository/repositories/vendor.repository';
import { VendorContactRepository } from '../repository/repositories/vendor-contact.repository';
import { VendorCategoryRepository } from '../repository/repositories/vendor-category.repository';
import { VendorDoc } from '../repository/entities/vendor.entity';
import { VendorContactDoc } from '../repository/entities/vendor-contact.entity';
import { VendorCategoryDoc } from '../repository/entities/vendor-category.entity';
import { VendorCreateRequestDto, VendorContactRequestDto } from '../dtos/request/vendor.create.request.dto';
import { VendorUpdateRequestDto } from '../dtos/request/vendor.update.request.dto';
import {
    VendorGetResponseDto,
    VendorContactResponseDto,
} from '../dtos/response/vendor.get.response.dto';
import { VendorListResponseDto } from '../dtos/response/vendor.list.response.dto';
import { CategoryRepository } from '@modules/category/repository/repositories/category.repository';
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
export class VendorService {
    private readonly logger = new Logger(VendorService.name);

    constructor(
        private readonly vendorRepository: VendorRepository,
        private readonly contactRepository: VendorContactRepository,
        private readonly vendorCategoryRepository: VendorCategoryRepository,
        private readonly categoryRepository: CategoryRepository,
        private readonly userService: UserService,
        private readonly roleService: RoleService,
        private readonly authService: AuthService,
        private readonly configService: ConfigService,
        private readonly helperDateService: HelperDateService
    ) {}

    /**
     * Provision a `users` row with role = Vendor for the primary contact.
     * Uses the system DEFAULT_PASSWORD with the standard expiry so when login
     * is enabled for vendors later, they can sign in immediately and rotate
     * the password through normal flows. Login is currently blocked at the
     * AuthService layer (see isLoginAllowedForRole).
     */
    private async provisionVendorUser(
        companyId: string,
        contact: VendorContactRequestDto
    ): Promise<string> {
        const vendorRole = await this.roleService.findOneByName(
            ENUM_SYSTEM_ROLE.VENDOR
        );
        if (!vendorRole) {
            throw new BadRequestException(
                'Vendor role is not seeded; run seed:role first'
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
                role: String(vendorRole._id),
                name: fullName,
                first_name: firstName || fullName,
                last_name: rest.join(' ') || '',
                email: contact.email.trim().toLowerCase(),
                country_code: (contact.country_code as any) || undefined,
                mobile: contact.phone || '',
                gender: ENUM_USER_GENDER.MALE,
                companyId,
                status: ENUM_USER_STATUS.ACTIVE,
                roleLevel: vendorRole.level,
            } as any,
            passwordData,
            ENUM_USER_SIGN_UP_FROM.ADMIN
        );

        return String(user._id);
    }

    /**
     * Sync the linked Vendor user with the current primary contact's details.
     * If the linked user no longer exists, returns false so caller can re-create.
     */
    private async syncVendorUser(
        userId: string,
        contact: VendorContactRequestDto
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

    private async deactivateVendorUser(
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

    private async syncVendorUserStatus(
        userId: string,
        vendorIsActive: boolean
    ): Promise<void> {
        const user = await this.userService.findOneById(userId);
        if (!user) return;
        user.is_active = vendorIsActive;
        user.status = vendorIsActive
            ? ENUM_USER_STATUS.ACTIVE
            : ENUM_USER_STATUS.INACTIVE;
        await this.userService.save(user);
    }

    /**
     * Reject if the primary contact's email is already attached to another
     * user in the users table. The same vendor's existing primary user is
     * exempt (it will be re-synced rather than re-created).
     */
    private async assertPrimaryEmailAvailable(
        email: string,
        vendorId?: string
    ): Promise<void> {
        const normalized = email.trim().toLowerCase();
        const existingUser = await this.userService.findOneByEmail(normalized);
        if (!existingUser || (existingUser as any).deleted) return;

        if (vendorId) {
            const ownContact = await this.contactRepository.findOne({
                user_id: String(existingUser._id),
                vendor_id: vendorId,
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
        data: VendorCreateRequestDto,
        createdBy: string
    ): Promise<VendorDoc> {
        const name = data.company_name.trim();

        const exists = await this.vendorRepository.isCompanyNameExists(companyId, name);
        if (exists) {
            throw new BadRequestException(
                `Vendor '${name}' already exists for this company`
            );
        }

        await this.assertCategoriesValid(companyId, data.category_ids);
        this.assertContactsValid(data.contacts);
        await this.assertContactEmailsUnique(companyId, data.contacts);

        const { contacts, category_ids, ...vendorFields } = data;
        const primaryContact = contacts.find((c) => c.is_primary) || contacts[0];

        // Pre-flight: primary email must be free in the users table BEFORE any writes
        await this.assertPrimaryEmailAvailable(primaryContact.email);

        // Provision the user FIRST so a failure here doesn't leave an orphan vendor
        const primaryUserId = await this.provisionVendorUser(
            companyId,
            primaryContact
        );

        const vendor = await this.vendorRepository.create({
            ...vendorFields,
            company_name: name,
            company_id: companyId,
            created_by: createdBy,
        } as any);

        await this.replaceVendorCategories(
            vendor._id.toString(),
            companyId,
            category_ids
        );

        for (const c of contacts) {
            await this.contactRepository.create({
                ...c,
                email: c.email.trim().toLowerCase(),
                vendor_id: vendor._id.toString(),
                company_id: companyId,
                user_id: c === primaryContact ? primaryUserId : undefined,
            } as any);
        }

        this.logger.log(
            `Vendor created: ${vendor._id} for company: ${companyId} (vendor user: ${primaryUserId})`
        );
        return vendor;
    }

    async findOneById(
        vendorId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<VendorDoc> {
        const vendor = await this.vendorRepository.findOneById(vendorId, options);
        if (!vendor) {
            throw new NotFoundException('Vendor not found');
        }
        return vendor;
    }

    async findAll(
        companyId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<VendorDoc[]> {
        return this.vendorRepository.findByCompanyId(companyId, options);
    }

    async update(
        vendor: VendorDoc,
        data: VendorUpdateRequestDto
    ): Promise<VendorDoc> {
        const companyId = vendor.company_id.toString();

        if (data.company_name && data.company_name.trim() !== vendor.company_name) {
            const exists = await this.vendorRepository.isCompanyNameExists(
                companyId,
                data.company_name.trim(),
                vendor._id.toString()
            );
            if (exists) {
                throw new BadRequestException(
                    `Vendor '${data.company_name.trim()}' already exists for this company`
                );
            }
            data.company_name = data.company_name.trim();
        }

        if (data.category_ids) {
            await this.assertCategoriesValid(companyId, data.category_ids);
        }

        let nextContacts: VendorContactRequestDto[] | undefined;
        if (data.contacts) {
            this.assertContactsValid(data.contacts);
            await this.assertContactEmailsUnique(
                companyId,
                data.contacts,
                vendor._id.toString()
            );
            nextContacts = data.contacts;
        }

        const nextCategoryIds = data.category_ids;
        const wasActive = !!vendor.is_active;

        // Strip relations from the body before assigning scalar fields
        const { contacts: _c, category_ids: _ci, ...scalarFields } = data;
        Object.assign(vendor, scalarFields);
        const updated = await this.vendorRepository.save(vendor);

        if (wasActive !== !!vendor.is_active) {
            const existingPrimary = await this.contactRepository.findOne({
                vendor_id: vendor._id.toString(),
                is_primary: true,
                soft_delete: false,
            } as any);
            if (existingPrimary?.user_id) {
                await this.syncVendorUserStatus(
                    existingPrimary.user_id.toString(),
                    !!vendor.is_active
                );
            }
        }

        if (nextCategoryIds) {
            await this.replaceVendorCategories(
                vendor._id.toString(),
                companyId,
                nextCategoryIds
            );
        }

        if (nextContacts) {
            const nextPrimary = nextContacts.find((c) => c.is_primary) || nextContacts[0];

            // Pre-flight: validate the new primary email against the users
            // table BEFORE we soft-delete contacts or touch any rows. The
            // current vendor's existing primary user is exempt.
            await this.assertPrimaryEmailAvailable(
                nextPrimary.email,
                vendor._id.toString()
            );

            // Capture the existing primary's user_id so we can sync vs re-create.
            const existingContacts = await this.contactRepository.findByVendorId(
                vendor._id.toString()
            );
            const existingPrimary = existingContacts.find((c) => c.is_primary);
            const existingUserId = existingPrimary?.user_id?.toString();

            // Resolve / sync / provision user BEFORE wiping old contacts
            let primaryUserId = existingUserId;
            if (primaryUserId) {
                const synced = await this.syncVendorUser(primaryUserId, nextPrimary);
                if (!synced) {
                    primaryUserId = await this.provisionVendorUser(
                        companyId,
                        nextPrimary
                    );
                }
            } else {
                primaryUserId = await this.provisionVendorUser(
                    companyId,
                    nextPrimary
                );
            }

            await this.contactRepository.softDeleteByVendorId(
                vendor._id.toString()
            );

            for (const c of nextContacts) {
                await this.contactRepository.create({
                    name: c.name,
                    designation: c.designation,
                    email: c.email.trim().toLowerCase(),
                    phone: c.phone,
                    country_code: c.country_code,
                    is_primary: !!c.is_primary,
                    vendor_id: vendor._id.toString(),
                    company_id: companyId,
                    user_id: c === nextPrimary ? primaryUserId : undefined,
                } as any);
            }
        }

        this.logger.log(`Vendor updated: ${vendor._id}`);
        return updated;
    }

    async softDelete(vendor: VendorDoc, deletedBy?: string): Promise<VendorDoc> {
        // Deactivate linked vendor user(s) before wiping the contact rows.
        const existingContacts = await this.contactRepository.findByVendorId(
            vendor._id.toString()
        );
        for (const c of existingContacts) {
            if (c.user_id) {
                await this.deactivateVendorUser(c.user_id.toString(), deletedBy);
            }
        }

        vendor.soft_delete = true;
        vendor.is_active = false;
        (vendor as any).deleted = true;
        (vendor as any).deletedAt = new Date();
        if (deletedBy) (vendor as any).deletedBy = deletedBy;
        const updated = await this.vendorRepository.save(vendor);
        await this.contactRepository.softDeleteByVendorId(vendor._id.toString());
        await this.vendorCategoryRepository.deleteByVendorId(vendor._id.toString());

        this.logger.log(`Vendor soft deleted: ${vendor._id}`);
        return updated;
    }

    async findVendorIdsByCategoryId(
        companyId: string,
        categoryId: string
    ): Promise<string[]> {
        return this.vendorCategoryRepository.findVendorIdsByCategoryId(
            companyId,
            categoryId
        );
    }

    private async replaceVendorCategories(
        vendorId: string,
        companyId: string,
        categoryIds: string[]
    ): Promise<void> {
        await this.vendorCategoryRepository.deleteByVendorId(vendorId);
        const unique = Array.from(new Set(categoryIds));
        for (const cid of unique) {
            await this.vendorCategoryRepository.create({
                vendor_id: vendorId,
                category_id: cid,
                company_id: companyId,
            } as any);
        }
    }

    private async assertCategoriesValid(
        companyId: string,
        categoryIds: string[]
    ): Promise<void> {
        if (!categoryIds || categoryIds.length === 0) {
            throw new BadRequestException('At least one category is required');
        }
        const unique = Array.from(new Set(categoryIds));
        const found = await this.categoryRepository.findAll({
            _id: { $in: unique },
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (found.length !== unique.length) {
            throw new BadRequestException('One or more categories are invalid');
        }
    }

    private assertContactsValid(contacts: VendorContactRequestDto[]): void {
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
        contacts: VendorContactRequestDto[],
        excludeVendorId?: string
    ): Promise<void> {
        for (const c of contacts) {
            const email = c.email.trim().toLowerCase();
            const exists = await this.contactRepository.isEmailExists(companyId, email);
            if (exists) {
                if (!excludeVendorId) {
                    throw new BadRequestException(
                        `Contact email '${email}' is already in use`
                    );
                }
                const existing = await this.contactRepository.findOne({
                    company_id: companyId,
                    email,
                    soft_delete: false,
                });
                if (existing && existing.vendor_id.toString() !== excludeVendorId) {
                    throw new BadRequestException(
                        `Contact email '${email}' is already in use by another vendor`
                    );
                }
            }
        }
    }

    private async buildCategoryNameMap(
        categoryIds: string[]
    ): Promise<Record<string, string>> {
        if (categoryIds.length === 0) return {};
        const cats = await this.categoryRepository.findAll({
            _id: { $in: categoryIds },
            soft_delete: false,
        } as any);
        const map: Record<string, string> = {};
        for (const c of cats) map[c._id.toString()] = c.name;
        return map;
    }

    private hydrateWithContacts(
        dto: VendorGetResponseDto,
        contacts: VendorContactDoc[]
    ): VendorGetResponseDto {
        dto.contacts = contacts.map((c) =>
            plainToInstance(VendorContactResponseDto, c)
        );
        const primary = contacts.find((c) => c.is_primary);
        if (primary) {
            dto.primary_contact_name = primary.name;
            dto.primary_contact_email = primary.email;
            dto.primary_contact_phone = primary.phone;
        }
        return dto;
    }

    async mapGetWithRelations(vendor: VendorDoc): Promise<VendorGetResponseDto> {
        const dto = plainToInstance(VendorGetResponseDto, vendor);

        const links = await this.vendorCategoryRepository.findByVendorId(
            vendor._id.toString()
        );
        const catIds = links.map((l) => l.category_id.toString());
        const catMap = await this.buildCategoryNameMap(catIds);
        dto.categories = catIds
            .filter((id) => catMap[id])
            .map((id) => ({ _id: id, name: catMap[id] }));

        const contacts = await this.contactRepository.findByVendorId(
            vendor._id.toString()
        );
        return this.hydrateWithContacts(dto, contacts);
    }

    async mapListWithRelations(
        vendors: VendorDoc[]
    ): Promise<VendorListResponseDto[]> {
        const vendorIds = vendors.map((v) => v._id.toString());

        // Pull all category links + contacts in two queries
        const [allLinks, allContacts] = await Promise.all([
            this.vendorCategoryRepository.findByVendorIds(vendorIds),
            vendorIds.length
                ? this.contactRepository.findAll({
                      vendor_id: { $in: vendorIds },
                      soft_delete: false,
                  } as any)
                : Promise.resolve([] as VendorContactDoc[]),
        ]);

        const allCategoryIds = Array.from(
            new Set(allLinks.map((l) => l.category_id.toString()))
        );
        const catMap = await this.buildCategoryNameMap(allCategoryIds);

        const linksByVendor: Record<string, VendorCategoryDoc[]> = {};
        for (const l of allLinks) {
            const vid = l.vendor_id.toString();
            (linksByVendor[vid] ||= []).push(l);
        }
        const contactsByVendor: Record<string, VendorContactDoc[]> = {};
        for (const c of allContacts) {
            const vid = c.vendor_id.toString();
            (contactsByVendor[vid] ||= []).push(c);
        }

        return vendors.map((v) => {
            const dto = plainToInstance(VendorListResponseDto, v);
            const vid = v._id.toString();
            dto.categories = (linksByVendor[vid] || [])
                .map((l) => l.category_id.toString())
                .filter((cid) => catMap[cid])
                .map((cid) => ({ _id: cid, name: catMap[cid] }));
            return this.hydrateWithContacts(dto, contactsByVendor[vid] || []);
        });
    }
}
