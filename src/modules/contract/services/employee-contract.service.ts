import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmployeeContractRepository } from '../repository/repositories/employee-contract.repository';
import { ContractFieldValueRepository } from '../repository/repositories/contract-field-value.repository';
import { EmployeeContractEntity } from '../repository/entities/employee-contract.entity';
import { ContractFieldValueEntity } from '../repository/entities/contract-field-value.entity';
import { ContractTemplateService } from './contract-template.service';
import { ContractPlaceholderService } from './contract-placeholder.service';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import { ENUM_CONTRACT_STATUS } from '../enums/contract.enum';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

/** Maps auto_populate_from keys to user entity fields */
const AUTO_POPULATE_MAP: Record<string, (user: any, company?: any, location?: any) => string> = {
    firstName: (u) => u.first_name || '',
    lastName: (u) => u.last_name || '',
    fullName: (u) => `${u.first_name || ''} ${u.last_name || ''}`.trim(),
    email: (u) => u.email || '',
    phone: (u) => u.mobile || u.phone || '',
    designation: (u) => u.designation || '',
    department: (u) => u.department || '',
    startDate: (u) => {
        const d = u.date_of_joining || u.start_date;
        return d ? new Date(d).toLocaleDateString('en-GB') : '';
    },
    salary: (u) => (u.annual_salary || u.salary || '').toString(),
    employeeCode: (u) => u.employee_code || '',
    locationName: (_u, _c, l) => l?.location_name || '',
    companyName: (_u, c) => c?.company_name || c?.name || '',
};

@Injectable()
export class EmployeeContractService {
    private readonly logger = new Logger(EmployeeContractService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly contractRepository: EmployeeContractRepository,
        private readonly fieldValueRepository: ContractFieldValueRepository,
        private readonly templateService: ContractTemplateService,
        private readonly placeholderService: ContractPlaceholderService,
        private readonly companySettingsService: CompanySettingsService,
    ) {}

    async issueContract(
        companyId: string,
        userId: string,
        templateId: string,
        issuedBy: string,
        effectiveDate?: string,
        endDate?: string,
        notes?: string,
        user?: any,
        company?: any,
        location?: any
    ): Promise<EmployeeContractEntity> {
        const { template, sections } = await this.templateService.getTemplateWithSections(templateId);

        // Derive location_id from the employee being issued the contract
        const locationId = user?.location_id?._id || user?.location_id || null;

        // Build placeholder data from employee/company/location
        // We need a temporary ID to pass — we'll create the contract first then update with rendered HTML
        const contractMeta = { effectiveDate, endDate };
        const tempData = this.placeholderService.buildData('__CONTRACT_ID__', user, company, location, contractMeta);

        // Render HTML body (sections with placeholders replaced)
        const renderedSections = this.placeholderService.renderSections(sections, tempData);

        // Build footer text for PDF
        const companyName = company?.company_name || company?.name || '';
        const footerParts = [
            (company?.license_number || company?.registration_number) ? `Reg: ${company.license_number || company.registration_number}` : '',
            (company?.tax_number || company?.vat_number) ? `VAT: ${company.tax_number || company.vat_number}` : '',
        ].filter(Boolean).join(' | ');

        // Fetch company branding from settings
        const branding = await this.resolveContractBranding(companyId);

        const fullHtml = this.placeholderService.buildHtmlDocument(renderedSections, companyName, footerParts, branding);

        // Create employee_contracts record
        const contract = await this.contractRepository.create({
            company_id: companyId,
            user_id: userId,
            location_id: locationId,
            contract_template_id: templateId,
            template_version: template.version,
            status: ENUM_CONTRACT_STATUS.ISSUED,
            issued_by: issuedBy,
            issued_at: new Date(),
            effective_date: effectiveDate || null,
            end_date: endDate || null,
            notes: notes || null,
            rendered_html: fullHtml.replace('__CONTRACT_ID__', ''), // final ID not available pre-insert
            soft_delete: false,
        });

        // Update the rendered HTML with the actual contract _id
        const finalData = this.placeholderService.buildData(contract._id, user, company, location, contractMeta);
        const finalSections = this.placeholderService.renderSections(sections, finalData);
        const finalHtml = this.placeholderService.buildHtmlDocument(finalSections, companyName, footerParts, branding);
        await this.contractRepository.update(contract, { rendered_html: finalHtml });

        // Also store field values for backward compatibility (legacy field-based contracts)
        for (const section of sections) {
            for (const field of section.fields) {
                let value = '';
                let isAutoPopulated = false;

                if (field.auto_populate_from && user) {
                    const mapper = AUTO_POPULATE_MAP[field.auto_populate_from];
                    if (mapper) {
                        value = mapper(user, company, location) || field.default_value || '';
                        isAutoPopulated = true;
                    }
                } else if (field.default_value) {
                    value = field.default_value;
                }

                if (field._id) {
                    await this.fieldValueRepository.create({
                        employee_contract_id: contract._id,
                        contract_field_id: field._id,
                        value,
                        is_auto_populated: isAutoPopulated,
                    });
                }
            }
        }

        return contract;
    }

    async findAll(companyId: string, limit = 20, offset = 0, filters: any = {}): Promise<EmployeeContractEntity[]> {
        const find: any = { company_id: companyId, soft_delete: false, ...filters };
        return this.contractRepository.findAll(find, {
            paging: { limit, offset },
            order: { createdAt: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC },
        }) as Promise<EmployeeContractEntity[]>;
    }

    async getTotal(companyId: string, filters: any = {}): Promise<number> {
        const find: any = { company_id: companyId, soft_delete: false, ...filters };
        return this.contractRepository.getTotal(find);
    }

    async findOneById(id: string): Promise<EmployeeContractEntity> {
        const item = await this.contractRepository.findOne({ _id: id, soft_delete: false });
        if (!item) throw new NotFoundException('Contract not found');
        return item as EmployeeContractEntity;
    }

    async findByUser(userId: string): Promise<EmployeeContractEntity[]> {
        return this.contractRepository.findAll(
            { user_id: userId, soft_delete: false },
            { order: { createdAt: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC } }
        ) as Promise<EmployeeContractEntity[]>;
    }

    async getContractWithValues(contractId: string): Promise<{
        contract: EmployeeContractEntity;
        fieldValues: ContractFieldValueEntity[];
    }> {
        const contract = await this.findOneById(contractId);
        const fieldValues = await this.fieldValueRepository.findAll(
            { employee_contract_id: contractId },
            {}
        ) as ContractFieldValueEntity[];
        return { contract, fieldValues };
    }

    async updateFieldValues(contractId: string, updates: Array<{ field_id: string; value: string }>): Promise<void> {
        for (const update of updates) {
            const fv = await this.fieldValueRepository.findOne({
                employee_contract_id: contractId,
                contract_field_id: update.field_id,
            });
            if (fv) {
                await this.fieldValueRepository.update(fv as ContractFieldValueEntity, { value: update.value });
            }
        }
    }

    /**
     * The exact HTML string that buildData() emits for employeeSignature when unsigned.
     * Must match ContractPlaceholderService.buildData() exactly.
     * On sign we replace this with the signed <img> block so rendered_html stays up-to-date.
     */
    private static readonly SIGNATURE_PLACEHOLDER_HTML =
        '<div class="signature-placeholder" style="margin-top:20px;padding:16px;border:1px solid #ddd;background:#fafafa;">' +
        '<strong>Employee Signature:</strong><br/>' +
        '<div class="signature-box" style="border-bottom:1px solid #333;width:300px;height:60px;margin-top:8px;">&nbsp;</div>' +
        '</div>';

    async sign(contractId: string, signatureData: string, signatureIp: string): Promise<EmployeeContractEntity> {
        const contract = await this.findOneById(contractId);
        if (![ENUM_CONTRACT_STATUS.ISSUED, ENUM_CONTRACT_STATUS.PENDING_SIGNATURE].includes(contract.status as any)) {
            throw new BadRequestException('Contract cannot be signed in its current status');
        }

        const signedAt = new Date();

        // Save signature as file instead of embedding huge base64 in HTML
        let signatureUrl = signatureData; // fallback: keep base64 if file save fails
        if (signatureData && signatureData.startsWith('data:image/')) {
            try {
                const fs = require('fs');
                const path = require('path');
                const sigDir = path.join(process.cwd(), 'public', 'signatures');
                if (!fs.existsSync(sigDir)) fs.mkdirSync(sigDir, { recursive: true });

                const ext = signatureData.includes('image/png') ? '.png' : '.jpg';
                const fileName = `sig_${contractId.slice(0, 8)}_${Date.now()}${ext}`;
                const filePath = path.join(sigDir, fileName);

                // Extract base64 data after the comma
                const base64Data = signatureData.split(',')[1];
                fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

                signatureUrl = `/assets/signatures/${fileName}`;
                this.logger.log(`Signature saved to file: ${signatureUrl}`);
            } catch (err) {
                this.logger.warn(`Failed to save signature file, using base64 inline: ${err?.message}`);
                signatureUrl = signatureData; // fallback to base64
            }
        }

        // Build the full URL for the signature image
        // For HTML rendering: use relative path (works in browser via static serve)
        // For PDF: the inlineLocalImages method will convert to base64
        const host = this.configService.get<string>('app.http.host') || 'localhost';
        const port = this.configService.get<number>('app.http.port') || 3001;
        const backendUrl = host === '0.0.0.0' ? `http://localhost:${port}` : `http://${host}:${port}`;
        const imgSrc = signatureUrl.startsWith('/assets/')
            ? `${backendUrl}${signatureUrl}`
            : signatureUrl;

        // Embed the signature image at the placeholder position in rendered_html
        let updatedHtml = contract.rendered_html || '';
        if (updatedHtml && signatureData) {
            const signedHtml =
                '<div class="signature-signed" style="margin-top:20px;padding:16px;border:1px solid #ddd;background:#fafafa;">' +
                '<strong>Employee Signature:</strong><br/>' +
                `<img src="${imgSrc}" style="max-width:300px;border:1px solid #eee;border-radius:4px;background:#fff;margin-top:8px;" alt="Signature" />` +
                `<p style="color:#555;font-size:11px;margin-top:6px;">Signed on: ${signedAt.toLocaleDateString('en-GB')}</p>` +
                '</div>';

            // Try exact match first, then fuzzy match for edited contracts
            if (updatedHtml.includes(EmployeeContractService.SIGNATURE_PLACEHOLDER_HTML)) {
                updatedHtml = updatedHtml.replace(
                    EmployeeContractService.SIGNATURE_PLACEHOLDER_HTML,
                    signedHtml,
                );
            } else {
                // Fuzzy match: find signature-placeholder div even if whitespace/attributes changed
                updatedHtml = updatedHtml.replace(
                    /<div class="signature-placeholder"[^>]*>[\s\S]*?<\/div>\s*<\/div>/i,
                    signedHtml,
                );
            }
        }

        return this.contractRepository.update(contract, {
            status: ENUM_CONTRACT_STATUS.SIGNED,
            signed_at: signedAt,
            signature_data: signatureUrl, // store file path instead of huge base64
            signature_ip: signatureIp,
            rendered_html: updatedHtml,
        }) as Promise<EmployeeContractEntity>;
    }

    /**
     * Revert a signed contract back to issued — clears signature, restores placeholder in HTML.
     */
    async revertToIssued(contractId: string): Promise<EmployeeContractEntity> {
        const contract = await this.findOneById(contractId);

        // Restore signature placeholder in rendered_html
        let updatedHtml = contract.rendered_html || '';
        if (updatedHtml) {
            // Replace signature-signed div (with img) back to placeholder
            updatedHtml = updatedHtml.replace(
                /<div class="signature-signed"[^>]*>[\s\S]*?<\/div>/i,
                EmployeeContractService.SIGNATURE_PLACEHOLDER_HTML,
            );
        }

        return this.contractRepository.update(contract, {
            status: ENUM_CONTRACT_STATUS.ISSUED,
            signed_at: null,
            signature_data: null,
            signature_ip: null,
            rendered_html: updatedHtml,
        }) as Promise<EmployeeContractEntity>;
    }

    /**
     * Change contract status (admin action).
     */
    async changeStatus(contractId: string, newStatus: string): Promise<EmployeeContractEntity> {
        const contract = await this.findOneById(contractId);
        return this.contractRepository.update(contract, {
            status: newStatus,
        }) as Promise<EmployeeContractEntity>;
    }

    async update(id: string, data: Partial<EmployeeContractEntity>): Promise<EmployeeContractEntity> {
        const item = await this.findOneById(id);
        return this.contractRepository.update(item, data) as Promise<EmployeeContractEntity>;
    }

    async softDelete(id: string): Promise<void> {
        const item = await this.findOneById(id);
        await this.contractRepository.update(item, { soft_delete: true });
    }

    async updateRenderedHtml(id: string, renderedHtml: string, editedBy: string): Promise<EmployeeContractEntity> {
        const item = await this.findOneById(id);
        return this.contractRepository.update(item, {
            rendered_html: renderedHtml,
            is_customised: true,
            last_edited_at: new Date(),
            last_edited_by: editedBy,
        } as any) as Promise<EmployeeContractEntity>;
    }

    mapGet(contract: EmployeeContractEntity) {
        return {
            _id: contract._id,
            company_id: contract.company_id,
            user_id: contract.user_id,
            location_id: contract.location_id,
            contract_template_id: contract.contract_template_id,
            template_version: contract.template_version,
            status: contract.status,
            issued_by: contract.issued_by,
            issued_at: contract.issued_at,
            signed_at: contract.signed_at,
            signature_data: contract.signature_data,
            effective_date: contract.effective_date,
            end_date: contract.end_date,
            pdf_path: contract.pdf_path,
            document_id: contract.document_id,
            notes: contract.notes,
            rendered_html: contract.rendered_html,
            is_customised: contract.is_customised,
            last_edited_at: contract.last_edited_at,
            last_edited_by: contract.last_edited_by,
            createdAt: contract.createdAt,
            updatedAt: contract.updatedAt,
        };
    }

    mapList(contract: EmployeeContractEntity) {
        return {
            _id: contract._id,
            user_id: contract.user_id,
            contract_template_id: contract.contract_template_id,
            status: contract.status,
            issued_at: contract.issued_at,
            signed_at: contract.signed_at,
            effective_date: contract.effective_date,
            end_date: contract.end_date,
            createdAt: contract.createdAt,
        };
    }

    /**
     * Fetch company branding (logo, footer) from company settings for contract rendering.
     */
    private async resolveContractBranding(companyId: string): Promise<{
        logoUrl?: string;
        companyDisplayName?: string;
        footerAddress?: string;
        footerContact?: string;
        footerExtra?: string;
    } | undefined> {
        try {
            const settings = await this.companySettingsService.getCompanyDefaults(companyId);
            const mapped = this.companySettingsService.mapGet(settings);
            const host = this.configService.get<string>('app.http.host') || 'localhost';
            const port = this.configService.get<number>('app.http.port') || 3001;
            const backendUrl = host === '0.0.0.0' ? `http://localhost:${port}` : `http://${host}:${port}`;
            const logoUrl = mapped.logo_url
                ? (mapped.logo_url.startsWith('http') ? mapped.logo_url : `${backendUrl}/${mapped.logo_url.replace(/^\/+/, '')}`)
                : undefined;
            return {
                logoUrl,
                companyDisplayName: mapped.company_display_name || undefined,
                footerAddress: mapped.footer_address || undefined,
                footerContact: mapped.footer_contact || undefined,
                footerExtra: mapped.footer_extra || undefined,
            };
        } catch (error) {
            this.logger.warn(`Failed to resolve contract branding for company ${companyId}: ${error.message}`);
            return undefined;
        }
    }
}
