import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { LeadRepository } from '../repository/repositories/lead.repository';
import { LeadDoc } from '../repository/entities/lead.entity';
import { LeadCreateRequestDto } from '../dtos/request/lead.create.request.dto';
import { LeadUpdateRequestDto } from '../dtos/request/lead.update.request.dto';
import { LeadGetResponseDto } from '../dtos/response/lead.get.response.dto';
import { LeadListResponseDto } from '../dtos/response/lead.list.response.dto';
import { ENUM_LEAD_STATUS } from '../enums/lead.enum';
import { ENUM_LEAD_ACTIVITY_TYPE } from '../enums/lead-activity.enum';
import { LeadActivityService } from './lead-activity.service';
import { CustomerService } from '@modules/customer/services/customer.service';
import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { CustomerContactRepository } from '@modules/customer/repository/repositories/customer-contact.repository';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { CategoryRepository } from '@modules/category/repository/repositories/category.repository';
import { QuotationRepository } from '@modules/quotation/repository/repositories/quotation.repository';
import { ILike } from 'typeorm';
import {
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
} from '@common/database/interfaces/database.interface';

@Injectable()
export class LeadService {
    private readonly logger = new Logger(LeadService.name);

    constructor(
        private readonly leadRepository: LeadRepository,
        private readonly customerRepository: CustomerRepository,
        private readonly customerContactRepository: CustomerContactRepository,
        private readonly customerService: CustomerService,
        private readonly userRepository: UserRepository,
        private readonly productRepository: ProductRepository,
        private readonly categoryRepository: CategoryRepository,
        private readonly quotationRepository: QuotationRepository,
        private readonly activityService: LeadActivityService
    ) {}

    async create(
        companyId: string,
        data: LeadCreateRequestDto,
        createdBy: string
    ): Promise<LeadDoc> {
        if (data.customer_id) {
            await this.assertCustomerInCompany(companyId, data.customer_id);
        }
        await this.assertCategoriesInCompany(companyId, data.interested_categories);
        await this.assertProductsInCategories(
            companyId,
            data.interested_products,
            data.interested_categories
        );

        const lead = await this.leadRepository.create({
            ...data,
            company_name: data.company_name.trim(),
            contact_email: data.contact_email.trim().toLowerCase(),
            company_id: companyId,
            created_by: createdBy,
        } as any);

        this.logger.log(`Lead created: ${lead._id} for company: ${companyId}`);
        return lead;
    }

    async findOneById(
        leadId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<LeadDoc> {
        const lead = await this.leadRepository.findOneById(leadId, options);
        if (!lead) throw new NotFoundException('Lead not found');
        return lead;
    }

    async findAll(
        companyId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<LeadDoc[]> {
        return this.leadRepository.findByCompanyId(companyId, options);
    }

    async update(
        lead: LeadDoc,
        data: LeadUpdateRequestDto,
        userId?: string
    ): Promise<LeadDoc> {
        const companyId = lead.company_id.toString();

        if (data.customer_id !== undefined && data.customer_id !== null && data.customer_id !== '') {
            await this.assertCustomerInCompany(companyId, data.customer_id);
        }
        if (data.contact_email) {
            data.contact_email = data.contact_email.trim().toLowerCase();
        }
        if (data.company_name) {
            data.company_name = data.company_name.trim();
        }

        const nextCategories =
            data.interested_categories ?? lead.interested_categories ?? [];
        const nextProducts =
            data.interested_products ?? lead.interested_products ?? [];
        if (data.interested_categories !== undefined) {
            await this.assertCategoriesInCompany(companyId, nextCategories);
        }
        if (
            data.interested_products !== undefined ||
            data.interested_categories !== undefined
        ) {
            await this.assertProductsInCategories(
                companyId,
                nextProducts,
                nextCategories
            );
        }

        const wasWon = lead.status === ENUM_LEAD_STATUS.WON;
        const willBeWon = data.status === ENUM_LEAD_STATUS.WON;
        const prevStatus = lead.status;

        Object.assign(lead, data);
        let updated = await this.leadRepository.save(lead);
        this.logger.log(`Lead updated: ${lead._id}`);

        // Status change → timeline entry. Fire-and-forget; failure here
        // should not roll back the save itself.
        if (data.status && data.status !== prevStatus) {
            this.activityService
                .addSystem(
                    companyId,
                    updated._id.toString(),
                    ENUM_LEAD_ACTIVITY_TYPE.STATUS_CHANGE,
                    {
                        metadata: { from: prevStatus, to: data.status },
                        createdBy: userId,
                    }
                )
                .catch((err) =>
                    this.logger.warn(
                        `Failed to log status_change activity: ${err.message}`
                    )
                );
        }

        // Auto-convert when status flips to Won and not already linked.
        if (!wasWon && willBeWon && !updated.converted_customer_id) {
            const result = await this.convertToCustomer(updated, userId || '');
            updated = result.lead;
        }
        return updated;
    }

    async softDelete(lead: LeadDoc, deletedBy?: string): Promise<LeadDoc> {
        lead.soft_delete = true;
        lead.is_active = false;
        (lead as any).deleted = true;
        (lead as any).deletedAt = new Date();
        if (deletedBy) (lead as any).deletedBy = deletedBy;
        const updated = await this.leadRepository.save(lead);
        this.logger.log(`Lead soft deleted: ${lead._id}`);
        return updated;
    }

    /**
     * Convert a lead to a Customer record. Idempotent — calling on an
     * already-converted lead returns the existing link.
     *
     * Resolution order:
     *  1. lead.converted_customer_id (already converted → no-op).
     *  2. lead.customer_id (explicit link from the form).
     *  3. Existing customer found via primary contact email match.
     *  4. Create a new customer.
     */
    async convertToCustomer(
        lead: LeadDoc,
        userId: string
    ): Promise<{ lead: LeadDoc; customerId: string }> {
        const companyId = lead.company_id.toString();

        if (lead.converted_customer_id) {
            return {
                lead,
                customerId: lead.converted_customer_id.toString(),
            };
        }

        let customerId: string | undefined;
        if (lead.customer_id) {
            customerId = lead.customer_id.toString();
        } else {
            const matched = await this.findCustomerByEmail(
                companyId,
                lead.contact_email
            );
            if (matched) customerId = matched;
        }

        if (!customerId) {
            const hasAddress =
                !!(
                    lead.address_line1 ||
                    lead.address_line2 ||
                    lead.city ||
                    lead.state ||
                    lead.country ||
                    lead.postcode
                );
            const customer = await this.customerService.create(
                companyId,
                {
                    company_name: lead.company_name,
                    contacts: [
                        {
                            name: lead.contact_name,
                            email: lead.contact_email,
                            phone: lead.contact_phone,
                            country_code: lead.country_code,
                            is_primary: true,
                        },
                    ],
                    addresses: hasAddress
                        ? [
                              {
                                  type: 'bill_to' as any,
                                  address_line1: lead.address_line1,
                                  address_line2: lead.address_line2,
                                  city: lead.city,
                                  state: lead.state,
                                  country: lead.country,
                                  postcode: lead.postcode,
                                  is_default: true,
                              },
                          ]
                        : [],
                } as any,
                userId
            );
            customerId = customer._id.toString();
        }

        lead.status = ENUM_LEAD_STATUS.WON;
        lead.converted_customer_id = customerId;
        lead.converted_at = new Date();
        const updated = await this.leadRepository.save(lead);
        this.logger.log(
            `Lead ${lead._id} converted to customer ${customerId}`
        );
        this.activityService
            .addSystem(
                companyId,
                updated._id.toString(),
                ENUM_LEAD_ACTIVITY_TYPE.CONVERSION,
                {
                    metadata: { customer_id: customerId, won: true },
                    createdBy: userId,
                }
            )
            .catch((err) =>
                this.logger.warn(
                    `Failed to log Won conversion activity: ${err.message}`
                )
            );
        return { lead: updated, customerId };
    }

    /**
     * Idempotent — flip a lead to WON. Used as a side-effect when an
     * approved Quotation references this lead. No-ops when the lead is
     * already WON or doesn't exist.
     */
    /**
     * Idempotent helper called when an upstream document (Quotation/PFI)
     * is approved. Sets status=WON and, if a customer_id is provided AND
     * the lead isn't already converted, stamps the conversion link so the
     * Lead points at the customer that was used on the approving doc.
     *
     * Does NOT create a new customer — the upstream doc already required
     * one to exist.
     */
    /**
     * Idempotent — flip a lead to PROPOSAL_SENT when an upstream Quotation
     * or PFI moves into the SENT state. Skipped if the lead is already
     * past that point in the pipeline (proposal_sent / won / lost).
     */
    async markProposalSent(leadId: string): Promise<void> {
        if (!leadId) return;
        const lead = await this.leadRepository.findOneById(leadId);
        if (!lead) return;
        const skip = [
            ENUM_LEAD_STATUS.PROPOSAL_SENT,
            ENUM_LEAD_STATUS.WON,
            ENUM_LEAD_STATUS.LOST,
        ];
        if (skip.includes(lead.status)) return;
        lead.status = ENUM_LEAD_STATUS.PROPOSAL_SENT;
        await this.leadRepository.save(lead);
        this.logger.log(`Lead ${leadId} marked PROPOSAL_SENT`);
    }

    /**
     * Resolve a customer for a lead WITHOUT advancing lead status.
     * Used by Quotation/PFI create when a lead_id is provided but no
     * customer_id yet — we need a real customer record so the doc has
     * something to reference.
     *
     *  1. lead.converted_customer_id — already linked, return it.
     *  2. lead.customer_id — explicit form link, use it.
     *  3. Match by primary-contact email — reuse existing customer.
     *  4. Create a new customer from lead fields.
     *
     * Stamps lead.customer_id (not converted_customer_id — that's
     * reserved for the Won transition).
     */
    async linkOrCreateCustomerForLead(
        leadId: string,
        userId: string
    ): Promise<string> {
        const lead = await this.leadRepository.findOneById(leadId);
        if (!lead) throw new NotFoundException('Lead not found');
        const companyId = lead.company_id.toString();

        if (lead.converted_customer_id) {
            return lead.converted_customer_id.toString();
        }
        if (lead.customer_id) {
            return lead.customer_id.toString();
        }

        const matched = await this.findCustomerByEmail(
            companyId,
            lead.contact_email
        );
        if (matched) {
            lead.customer_id = matched;
            await this.leadRepository.save(lead);
            this.activityService
                .addSystem(
                    companyId,
                    lead._id.toString(),
                    ENUM_LEAD_ACTIVITY_TYPE.CONVERSION,
                    {
                        metadata: { customer_id: matched, reused: true },
                        createdBy: userId,
                    }
                )
                .catch((err) =>
                    this.logger.warn(
                        `Failed to log conversion activity: ${err.message}`
                    )
                );
            return matched;
        }

        const hasAddress = !!(
            lead.address_line1 ||
            lead.address_line2 ||
            lead.city ||
            lead.state ||
            lead.country ||
            lead.postcode
        );
        const customer = await this.customerService.create(
            companyId,
            {
                company_name: lead.company_name,
                contacts: [
                    {
                        name: lead.contact_name,
                        email: lead.contact_email,
                        phone: lead.contact_phone,
                        country_code: lead.country_code,
                        is_primary: true,
                    },
                ],
                addresses: hasAddress
                    ? [
                          {
                              type: 'bill_to' as any,
                              address_line1: lead.address_line1,
                              address_line2: lead.address_line2,
                              city: lead.city,
                              state: lead.state,
                              country: lead.country,
                              postcode: lead.postcode,
                              is_default: true,
                          },
                      ]
                    : [],
            } as any,
            userId
        );
        lead.customer_id = customer._id.toString();
        await this.leadRepository.save(lead);
        this.logger.log(
            `Lead ${lead._id} linked to new customer ${customer._id} (no status change)`
        );
        this.activityService
            .addSystem(
                companyId,
                lead._id.toString(),
                ENUM_LEAD_ACTIVITY_TYPE.CONVERSION,
                {
                    metadata: {
                        customer_id: customer._id.toString(),
                        reused: false,
                    },
                    createdBy: userId,
                }
            )
            .catch((err) =>
                this.logger.warn(
                    `Failed to log conversion activity: ${err.message}`
                )
            );
        return customer._id.toString();
    }

    async markWon(leadId: string, customerId?: string): Promise<void> {
        if (!leadId) return;
        const lead = await this.leadRepository.findOneById(leadId);
        if (!lead) return;

        let dirty = false;
        if (lead.status !== ENUM_LEAD_STATUS.WON) {
            lead.status = ENUM_LEAD_STATUS.WON;
            dirty = true;
        }
        if (customerId && !lead.converted_customer_id) {
            lead.converted_customer_id = customerId;
            lead.converted_at = new Date();
            dirty = true;
        }
        if (!dirty) return;

        await this.leadRepository.save(lead);
        this.logger.log(
            `Lead ${leadId} marked WON${
                customerId ? ` and linked to customer ${customerId}` : ''
            }`
        );
    }

    /**
     * Look up an existing (non-deleted) customer in the same company that has
     * a contact with the given email. Returns the customer _id or undefined.
     */
    private async findCustomerByEmail(
        companyId: string,
        email: string
    ): Promise<string | undefined> {
        if (!email) return undefined;
        const normalized = email.trim().toLowerCase();
        const contact = await this.customerContactRepository.findOne({
            company_id: companyId,
            email: ILike(normalized),
            soft_delete: false,
        } as any);
        if (!contact) return undefined;

        const customer = await this.customerRepository.findOneById(
            contact.customer_id.toString()
        );
        if (!customer || (customer as any).soft_delete) return undefined;
        return customer._id.toString();
    }

    private async assertCategoriesInCompany(
        companyId: string,
        categoryIds: string[] | undefined
    ): Promise<void> {
        if (!categoryIds || !categoryIds.length) return;
        const categories = await this.categoryRepository.findAll({
            _id: { $in: categoryIds },
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (categories.length !== categoryIds.length) {
            throw new BadRequestException(
                'One or more selected categories are invalid'
            );
        }
    }

    private async assertProductsInCategories(
        companyId: string,
        productIds: string[] | undefined,
        categoryIds: string[] | undefined
    ): Promise<void> {
        if (!productIds || !productIds.length) return;
        const products = await this.productRepository.findAll({
            _id: { $in: productIds },
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (products.length !== productIds.length) {
            throw new BadRequestException(
                'One or more selected products are invalid'
            );
        }
        const allowed = new Set((categoryIds || []).map(String));
        const stray = products.find(
            (p) => !allowed.has(p.category_id?.toString())
        );
        if (stray) {
            throw new BadRequestException(
                `Product '${stray.name}' is not in any of the selected categories`
            );
        }
    }

    private async assertCustomerInCompany(
        companyId: string,
        customerId: string
    ): Promise<void> {
        const customer = await this.customerRepository.findOneById(customerId);
        if (
            !customer ||
            customer.company_id.toString() !== companyId ||
            (customer as any).soft_delete
        ) {
            throw new BadRequestException(
                'Selected customer does not exist for this company'
            );
        }
    }

    async mapGetWithRelations(lead: LeadDoc): Promise<LeadGetResponseDto> {
        const dto = plainToInstance(LeadGetResponseDto, lead);
        await this.attachRelationsToOne(dto, lead);
        const count = await this.quotationRepository.getTotal({
            lead_id: lead._id.toString(),
            soft_delete: false,
        } as any);
        (dto as any).quotations_count = count;
        return dto;
    }

    async mapListWithRelations(
        leads: LeadDoc[]
    ): Promise<LeadListResponseDto[]> {
        const dtos = leads.map((l) =>
            plainToInstance(LeadListResponseDto, l)
        );

        const customerIds = Array.from(
            new Set(
                leads
                    .map((l) => l.customer_id?.toString())
                    .filter(Boolean) as string[]
            )
        );
        const userIds = Array.from(
            new Set(
                leads
                    .map((l) => l.assigned_to?.toString())
                    .filter(Boolean) as string[]
            )
        );
        const leadIds = leads.map((l) => l._id.toString());

        const customerMap = new Map<string, string>();
        if (customerIds.length) {
            const customers = await this.customerRepository.findAll({
                _id: { $in: customerIds },
            } as any);
            customers.forEach((c) =>
                customerMap.set(c._id.toString(), c.company_name)
            );
        }

        const userMap = new Map<string, string>();
        if (userIds.length) {
            const users = await this.userRepository.findAll({
                _id: { $in: userIds },
            } as any);
            users.forEach((u) =>
                userMap.set(u._id.toString(), (u as any).name || '')
            );
        }

        // Count quotations per lead (excluding soft-deleted) so the FE can
        // surface "X quotations already created" without an extra round trip.
        const quotationCounts = new Map<string, number>();
        if (leadIds.length) {
            const quotations = await this.quotationRepository.findAll({
                lead_id: { $in: leadIds },
                soft_delete: false,
            } as any);
            for (const q of quotations as any[]) {
                const lid = q.lead_id?.toString();
                if (!lid) continue;
                quotationCounts.set(lid, (quotationCounts.get(lid) || 0) + 1);
            }
        }

        leads.forEach((l, i) => {
            if (l.customer_id) {
                dtos[i].customer_name = customerMap.get(l.customer_id.toString());
            }
            if (l.assigned_to) {
                dtos[i].assigned_to_name = userMap.get(l.assigned_to.toString());
            }
            (dtos[i] as any).quotations_count =
                quotationCounts.get(l._id.toString()) || 0;
        });
        return dtos;
    }

    private async attachRelationsToOne(
        dto: LeadGetResponseDto,
        lead: LeadDoc
    ): Promise<void> {
        if (lead.customer_id) {
            const c = await this.customerRepository.findOneById(
                lead.customer_id.toString()
            );
            if (c) dto.customer_name = c.company_name;
        }
        if (lead.assigned_to) {
            const u = await this.userRepository.findOneById(
                lead.assigned_to.toString()
            );
            if (u) dto.assigned_to_name = (u as any).name || '';
        }
    }
}
