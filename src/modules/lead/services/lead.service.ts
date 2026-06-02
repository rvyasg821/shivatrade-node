import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { LeadRepository } from '../repository/repositories/lead.repository';
import { LeadLineRepository } from '../repository/repositories/lead-line.repository';
import { LeadDoc } from '../repository/entities/lead.entity';
import { LeadLineRequestDto } from '../dtos/request/lead-line.request.dto';
import { LeadLineResponseDto } from '../dtos/response/lead-line.response.dto';
import { LeadCreateRequestDto } from '../dtos/request/lead.create.request.dto';
import { LeadUpdateRequestDto } from '../dtos/request/lead.update.request.dto';
import { LeadGetResponseDto } from '../dtos/response/lead.get.response.dto';
import { LeadListResponseDto } from '../dtos/response/lead.list.response.dto';
import { LeadStatsResponseDto } from '../dtos/response/lead.stats.response.dto';
import { ENUM_LEAD_STATUS } from '../enums/lead.enum';
import { ENUM_LEAD_ACTIVITY_TYPE } from '../enums/lead-activity.enum';
import { LeadActivityService } from './lead-activity.service';
import { LeadActivityRepository } from '../repository/repositories/lead-activity.repository';
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
        private readonly leadLineRepository: LeadLineRepository,
        private readonly customerRepository: CustomerRepository,
        private readonly customerContactRepository: CustomerContactRepository,
        private readonly customerService: CustomerService,
        private readonly userRepository: UserRepository,
        private readonly productRepository: ProductRepository,
        private readonly categoryRepository: CategoryRepository,
        private readonly quotationRepository: QuotationRepository,
        private readonly activityService: LeadActivityService,
        private readonly activityRepository: LeadActivityRepository
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

        // `lines` is a child table, not a lead column — keep it out of the write.
        const { lines, ...leadData } = data as any;
        const lead = await this.leadRepository.create({
            ...leadData,
            company_name: data.company_name.trim(),
            contact_email: data.contact_email.trim().toLowerCase(),
            company_id: companyId,
            created_by: createdBy,
        } as any);

        if (Array.isArray(lines)) {
            await this.writeLeadLines(companyId, lead._id.toString(), lines);
        }

        // Timeline anchor — every lead's activity feed opens with this entry.
        this.activityService
            .addSystem(
                companyId,
                lead._id.toString(),
                ENUM_LEAD_ACTIVITY_TYPE.LEAD_CREATED,
                { createdBy }
            )
            .catch((err) =>
                this.logger.warn(
                    `Failed to log lead_created activity for ${lead._id}: ${err}`
                )
            );

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

        // Pull lines out — they're a child table, not a lead column.
        const incomingLines: any = (data as any).lines;
        if ('lines' in (data as any)) delete (data as any).lines;

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

        // Replace requirement lines when the payload carries them.
        if (Array.isArray(incomingLines)) {
            await this.writeLeadLines(
                companyId,
                lead._id.toString(),
                incomingLines
            );
        }

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

        // Verify a customer id actually resolves to a non-deleted customer
        // row. Stale ids (left over from earlier failed / partial
        // conversions or hand-cleared data) must NOT short-circuit the
        // flow — fall through to email match / create instead.
        const customerExists = async (
            id?: string | null
        ): Promise<boolean> => {
            if (!id) return false;
            try {
                const c: any = await this.customerRepository.findOneById(
                    id.toString()
                );
                return !!c && !c.soft_delete;
            } catch {
                return false;
            }
        };

        if (
            lead.converted_customer_id &&
            (await customerExists(lead.converted_customer_id.toString()))
        ) {
            return {
                lead,
                customerId: lead.converted_customer_id.toString(),
            };
        }
        // Stale converted_customer_id — clear so we don't keep returning a
        // dangling pointer if the create below also fails.
        if (lead.converted_customer_id) {
            lead.converted_customer_id = null as any;
        }

        let customerId: string | undefined;
        if (
            lead.customer_id &&
            (await customerExists(lead.customer_id.toString()))
        ) {
            customerId = lead.customer_id.toString();
        } else {
            const matched = await this.findCustomerByEmail(
                companyId,
                lead.contact_email
            );
            if (matched) customerId = matched;
        }

        // Fallback: company_name match (case-insensitive). Avoids the
        // duplicate-name BadRequestException from customerService.create.
        if (!customerId) {
            const byName = await this.findCustomerByCompanyName(
                companyId,
                lead.company_name
            );
            if (byName) customerId = byName;
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
                    // Carry the lead's preferred currency forward so the new
                    // customer defaults to it on quotation / PFI / PO.
                    currency: lead.currency || undefined,
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

        // Verify a stamped customer id still resolves to a live customer
        // row. Stale ids (left over from an earlier failed flow or a
        // cleared customer) must NOT short-circuit — fall through to
        // email match / create instead.
        const customerExists = async (
            id?: string | null
        ): Promise<boolean> => {
            if (!id) return false;
            try {
                const c: any = await this.customerRepository.findOneById(
                    id.toString()
                );
                return !!c && !c.soft_delete;
            } catch {
                return false;
            }
        };

        if (
            lead.converted_customer_id &&
            (await customerExists(lead.converted_customer_id.toString()))
        ) {
            return lead.converted_customer_id.toString();
        }
        if (lead.converted_customer_id) {
            lead.converted_customer_id = null as any;
        }
        if (
            lead.customer_id &&
            (await customerExists(lead.customer_id.toString()))
        ) {
            return lead.customer_id.toString();
        }
        if (lead.customer_id) {
            lead.customer_id = null as any;
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

        // Fallback: match by company_name (case-insensitive). Avoids the
        // "Customer already exists" error when the lead's contact email
        // differs from the customer's stored primary email but the
        // company name is the same.
        const byName = await this.findCustomerByCompanyName(
            companyId,
            lead.company_name
        );
        if (byName) {
            lead.customer_id = byName;
            await this.leadRepository.save(lead);
            return byName;
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
                // Carry the lead's preferred currency forward so the new
                // customer defaults to it on quotation / PFI / PO.
                currency: lead.currency || undefined,
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

    /**
     * Look up an existing (non-deleted) customer in the same company by
     * company_name (case-insensitive). Used as a fallback when the lead's
     * contact email doesn't match any contact but a customer with the
     * same company name already exists — prevents the duplicate-name
     * BadRequestException from customerService.create.
     */
    private async findCustomerByCompanyName(
        companyId: string,
        companyName?: string
    ): Promise<string | undefined> {
        const name = (companyName || '').trim();
        if (!name) return undefined;
        const customer: any = await this.customerRepository.findOne({
            company_id: companyId,
            company_name: ILike(name),
            soft_delete: false,
        } as any);
        if (!customer) return undefined;
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
        // Drop stale customer pointers so FE prefills (quotation/PFI wizards)
        // don't try to GET a customer that no longer exists. Persists the
        // cleanup so subsequent reads are quick.
        await this.scrubStaleCustomerRefs(lead);
        const dto = plainToInstance(LeadGetResponseDto, lead);
        await this.attachRelationsToOne(dto, lead);
        const count = await this.quotationRepository.getTotal({
            lead_id: lead._id.toString(),
            soft_delete: false,
        } as any);
        (dto as any).quotations_count = count;
        dto.lines = await this.getLeadLines(lead._id.toString());
        return dto;
    }

    /** Requirement lines for a lead, enriched with product/category names. */
    private async getLeadLines(
        leadId: string
    ): Promise<LeadLineResponseDto[]> {
        const rows = await this.leadLineRepository.findByLeadId(leadId);
        if (!rows.length) return [];

        const productIds = Array.from(
            new Set(rows.map((r) => r.product_id).filter(Boolean) as string[])
        );
        const categoryIds = Array.from(
            new Set(rows.map((r) => r.category_id).filter(Boolean) as string[])
        );
        const [products, categories] = await Promise.all([
            productIds.length
                ? (this.productRepository.findAll({
                      _id: { $in: productIds },
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
            categoryIds.length
                ? (this.categoryRepository.findAll({
                      _id: { $in: categoryIds },
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
        ]);
        const productById = new Map<string, any>(
            products.map((p: any) => [p._id.toString(), p])
        );
        const categoryById = new Map<string, any>(
            categories.map((c: any) => [c._id.toString(), c])
        );

        return rows.map((r) => {
            const dto = plainToInstance(LeadLineResponseDto, r);
            const prod = r.product_id
                ? productById.get(r.product_id.toString())
                : null;
            const cat = r.category_id
                ? categoryById.get(r.category_id.toString())
                : null;
            dto.product_name = prod?.name;
            dto.product_code = prod?.code;
            dto.category_name = cat?.name;
            return dto;
        });
    }

    /** Replace a lead's requirement lines with the incoming set. */
    private async writeLeadLines(
        companyId: string,
        leadId: string,
        lines: LeadLineRequestDto[]
    ): Promise<void> {
        await this.leadLineRepository.deleteByLeadId(leadId);
        let seq = 0;
        for (const l of lines || []) {
            // Skip fully-empty rows.
            if (!l.product_id && !l.category_id && !(l.description || '').trim()) {
                continue;
            }
            seq += 1;
            await this.leadLineRepository.create({
                company_id: companyId,
                lead_id: leadId,
                product_id: l.product_id || null,
                category_id: l.category_id || null,
                description: l.description || null,
                qty:
                    l.qty != null && String(l.qty) !== ''
                        ? String(l.qty)
                        : null,
                unit: l.unit || null,
                target_price:
                    l.target_price != null && String(l.target_price) !== ''
                        ? String(l.target_price)
                        : null,
                customer_reference: l.customer_reference || null,
                notes: l.notes || null,
                seq: l.seq != null ? Number(l.seq) : seq,
                soft_delete: false,
            } as any);
        }
    }

    /** Clears `customer_id` / `converted_customer_id` on the lead when the
     *  pointed-at customer row no longer exists (or is soft-deleted).
     *  Saves the lead only if something actually changed. */
    private async scrubStaleCustomerRefs(lead: LeadDoc): Promise<void> {
        const customerExists = async (
            id?: string | null
        ): Promise<boolean> => {
            if (!id) return false;
            try {
                const c: any = await this.customerRepository.findOneById(
                    id.toString()
                );
                return !!c && !c.soft_delete;
            } catch {
                return false;
            }
        };
        let dirty = false;
        if (
            lead.converted_customer_id &&
            !(await customerExists(lead.converted_customer_id.toString()))
        ) {
            (lead as any).converted_customer_id = null;
            dirty = true;
        }
        if (
            lead.customer_id &&
            !(await customerExists(lead.customer_id.toString()))
        ) {
            (lead as any).customer_id = null;
            dirty = true;
        }
        if (dirty) {
            try {
                await this.leadRepository.save(lead);
            } catch {
                /* best effort — don't break the read on save failure */
            }
        }
    }

    async mapListWithRelations(
        leads: LeadDoc[]
    ): Promise<LeadListResponseDto[]> {
        // Drop stale customer pointers so the listing matches the detail
        // page — without this, deleting a converted customer would leave
        // converted_customer_id set on the lead, keeping the Convert-to-
        // Customer icon hidden on the row even though the detail page
        // (which already scrubs) shows it.
        await Promise.all(leads.map((l) => this.scrubStaleCustomerRefs(l)));

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

        const lastActivityMap = await this.activityRepository.findLastActivityMap(
            leadIds
        );

        leads.forEach((l, i) => {
            if (l.customer_id) {
                dtos[i].customer_name = customerMap.get(l.customer_id.toString());
            }
            if (l.assigned_to) {
                dtos[i].assigned_to_name = userMap.get(l.assigned_to.toString());
            }
            (dtos[i] as any).quotations_count =
                quotationCounts.get(l._id.toString()) || 0;
            (dtos[i] as any).last_activity_at =
                lastActivityMap.get(l._id.toString()) || null;
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

    // ── Listing filter helper ────────────────────────────────────────────
    //
    // Single source of truth for the `find` object used by BOTH the
    // `/list` endpoint and the `/stats` endpoint. Keeping the filter
    // logic centralized prevents the tile counts from drifting away
    // from the table they sit above (Docs/VOUCHER_STATS_PLAN.md §7).
    //
    // `status` accepts either a single value or an array — pass
    // `'won'` for a single status tile or `['new','contacted',...]`
    // for the "In Pipeline" multi-status tile. Arrays are translated
    // to SQL `IN (...)` by translateMongoFilter in the repo base.
    buildListFind(
        companyId: string,
        filters: {
            status?: string | string[];
            source?: string;
            assigned_to?: string;
            search?: string;
        }
    ): Record<string, any> {
        const find: any = { soft_delete: false };
        if (companyId) find.company_id = companyId;
        if (filters.status) find.status = filters.status;
        if (filters.source) find.source = filters.source;
        if (filters.assigned_to) find.assigned_to = filters.assigned_to;

        const searchTerm =
            typeof filters.search === 'string' ? filters.search.trim() : '';
        if (searchTerm) {
            find.$or = [
                { company_name: { $regex: searchTerm, $options: 'i' } },
                { contact_name: { $regex: searchTerm, $options: 'i' } },
                { contact_email: { $regex: searchTerm, $options: 'i' } },
            ];
        }
        return find;
    }

    // ── KPI stats for the lead listing tile strip ────────────────────────
    //
    // Returns counts per status + a SUM(expected_value) for the SAME
    // filtered set the listing is showing. One QueryBuilder GROUP BY
    // call — sub-millisecond at our row counts (Plan §4.4).
    async stats(
        companyId: string,
        filters: {
            status?: string | string[];
            source?: string;
            assigned_to?: string;
            search?: string;
        }
    ): Promise<LeadStatsResponseDto> {
        const find = this.buildListFind(companyId, filters);

        const rows = await this.leadRepository.aggregate<{
            status: string;
            count: string;
            expected_value: string;
        }>((qb) => {
            qb.andWhere('entity.soft_delete = :sd', { sd: false });
            if (find.company_id) {
                qb.andWhere('entity.company_id = :cid', {
                    cid: find.company_id,
                });
            }
            if (filters.status) {
                if (Array.isArray(filters.status)) {
                    qb.andWhere('entity.status IN (:...st)', {
                        st: filters.status,
                    });
                } else {
                    qb.andWhere('entity.status = :st', { st: filters.status });
                }
            }
            if (filters.source) {
                qb.andWhere('entity.source = :src', { src: filters.source });
            }
            if (filters.assigned_to) {
                qb.andWhere('entity.assigned_to = :at', {
                    at: filters.assigned_to,
                });
            }
            const searchTerm =
                typeof filters.search === 'string'
                    ? filters.search.trim()
                    : '';
            if (searchTerm) {
                qb.andWhere(
                    '(entity.company_name ILIKE :q OR entity.contact_name ILIKE :q OR entity.contact_email ILIKE :q)',
                    { q: `%${searchTerm}%` }
                );
            }
            return qb
                .select('entity.status', 'status')
                .addSelect('COUNT(*)::int', 'count')
                .addSelect(
                    'COALESCE(SUM(entity.expected_value), 0)::text',
                    'expected_value'
                )
                .groupBy('entity.status');
        });

        const by_status: Record<string, number> = {};
        let total = 0;
        let total_expected_value = 0;
        for (const r of rows) {
            const cnt = Number(r.count) || 0;
            by_status[r.status] = cnt;
            total += cnt;
            total_expected_value += Number(r.expected_value) || 0;
        }
        return {
            total,
            total_expected_value: total_expected_value.toFixed(2),
            by_status,
        };
    }
}
