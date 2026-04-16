import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    HttpStatus,
    HttpCode,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { ToolAccessGuard } from '@modules/subscription/guards/tool-access.guard';
import { RequireToolAccess } from '@modules/subscription/decorators/tool-access.decorator';

import { ContractTemplateService } from '../services/contract-template.service';
import { ContractSectionService } from '../services/contract-section.service';
import { ContractFieldService } from '../services/contract-field.service';
import { EmployeeContractService } from '../services/employee-contract.service';
import { ContractPdfService } from '../services/contract-pdf.service';
import { ContractNotificationService } from '../services/contract-notification.service';
import { UserService } from '@modules/user/services/user.service';
import { CompanyService } from '@modules/company/services/company.service';
import { LocationService } from '@modules/location/services/location.service';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

import { ContractTemplateCreateRequestDto } from '../dtos/request/contract-template.create.request.dto';
import { ContractTemplateUpdateRequestDto } from '../dtos/request/contract-template.update.request.dto';
import { ContractSectionCreateRequestDto } from '../dtos/request/contract-section.create.request.dto';
import { ContractSectionUpdateRequestDto } from '../dtos/request/contract-section.update.request.dto';
import { ContractFieldCreateRequestDto } from '../dtos/request/contract-field.create.request.dto';
import { ContractFieldUpdateRequestDto } from '../dtos/request/contract-field.update.request.dto';
import { ContractIssueRequestDto } from '../dtos/request/contract-issue.request.dto';
import { ContractReorderRequestDto } from '../dtos/request/contract-reorder.request.dto';
import { ContractFieldValuesUpdateRequestDto } from '../dtos/request/contract-field-values.update.request.dto';
import { ENUM_CONTRACT_TEMPLATE_STATUS } from '../enums/contract.enum';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';

@ApiTags('admin.contract')
@UseGuards(ToolAccessGuard)
@RequireToolAccess(['hrm-contracts'])
@Controller({
    version: '1',
    path: '/contract',
})
export class ContractAdminController {
    constructor(
        private readonly templateService: ContractTemplateService,
        private readonly sectionService: ContractSectionService,
        private readonly fieldService: ContractFieldService,
        private readonly contractService: EmployeeContractService,
        private readonly pdfService: ContractPdfService,
        private readonly contractNotificationService: ContractNotificationService,
        private readonly userService: UserService,
        private readonly companyService: CompanyService,
        private readonly locationService: LocationService,
        private readonly companySettingsService: CompanySettingsService,
        private readonly configService: ConfigService,
    ) {}

    // ============ TEMPLATE ENDPOINTS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/template/create')
    async createTemplate(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: ContractTemplateCreateRequestDto
    ) {
        const item = await this.templateService.create(companyId, userId, {
            ...body,
            status: ENUM_CONTRACT_TEMPLATE_STATUS.DRAFT,
        });
        return { statusCode: 200, message: 'Template created', data: this.templateService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/template/list')
    async listTemplates(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('_limit') limit?: number,
        @Query('_offset') offset?: number,
        @Query('_search') search?: string,
    ) {
        const [items, total] = await Promise.all([
            this.templateService.findAll(companyId, limit ? +limit : 20, offset ? +offset : 0, search),
            this.templateService.getTotal(companyId, search),
        ]);
        return {
            statusCode: 200,
            message: 'Success',
            data: items.map(t => this.templateService.mapGet(t)),
            _metadata: { total, limit: limit ? +limit : 20, offset: offset ? +offset : 0 },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/template/get/:id')
    async getTemplate(@Param('id') id: string) {
        const { template, sections } = await this.templateService.getTemplateWithSections(id);
        return {
            statusCode: 200,
            message: 'Success',
            data: {
                ...this.templateService.mapGet(template),
                sections: sections.map(s => ({
                    ...this.sectionService.mapGet(s),
                    fields: s.fields.map(f => this.fieldService.mapGet(f)),
                })),
            },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/template/update/:id')
    async updateTemplate(
        @Param('id') id: string,
        @Body() body: ContractTemplateUpdateRequestDto
    ) {
        const item = await this.templateService.update(id, body);
        return { statusCode: 200, message: 'Template updated', data: this.templateService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/template/delete/:id')
    async deleteTemplate(@Param('id') id: string) {
        await this.templateService.softDelete(id);
        return { statusCode: 200, message: 'Template deleted' };
    }

    // ============ SECTION ENDPOINTS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/section/create')
    async createSection(@Body() body: ContractSectionCreateRequestDto) {
        const item = await this.sectionService.create(body.contract_template_id, body);
        return { statusCode: 200, message: 'Section created', data: this.sectionService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/section/update/:id')
    async updateSection(
        @Param('id') id: string,
        @Body() body: ContractSectionUpdateRequestDto
    ) {
        const item = await this.sectionService.update(id, body);
        return { statusCode: 200, message: 'Section updated', data: this.sectionService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/section/delete/:id')
    async deleteSection(@Param('id') id: string) {
        await this.sectionService.softDelete(id);
        return { statusCode: 200, message: 'Section deleted' };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/section/reorder')
    async reorderSections(
        @Query('template_id') templateId: string,
        @Body() body: ContractReorderRequestDto
    ) {
        await this.sectionService.reorder(templateId, body.ordered_ids);
        return { statusCode: 200, message: 'Sections reordered' };
    }

    // ============ FIELD ENDPOINTS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/field/create')
    async createField(@Body() body: ContractFieldCreateRequestDto) {
        const item = await this.fieldService.create(body.contract_section_id, body.contract_template_id, body);
        return { statusCode: 200, message: 'Field created', data: this.fieldService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/field/update/:id')
    async updateField(
        @Param('id') id: string,
        @Body() body: ContractFieldUpdateRequestDto
    ) {
        const item = await this.fieldService.update(id, body);
        return { statusCode: 200, message: 'Field updated', data: this.fieldService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/field/delete/:id')
    async deleteField(@Param('id') id: string) {
        await this.fieldService.softDelete(id);
        return { statusCode: 200, message: 'Field deleted' };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/field/reorder')
    async reorderFields(
        @Query('section_id') sectionId: string,
        @Body() body: ContractReorderRequestDto
    ) {
        await this.fieldService.reorder(sectionId, body.ordered_ids);
        return { statusCode: 200, message: 'Fields reordered' };
    }

    // ============ EMPLOYEE CONTRACT ENDPOINTS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/issue')
    async issueContract(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') issuedBy: string,
        @Body() body: ContractIssueRequestDto,
        @Req() req: Request
    ) {
        // Fetch user, company, location for auto-population
        const user = await this.userService.findOneById(body.user_id);
        const company = await this.companyService.findOneById(companyId);

        // Fetch location from employee's assigned location
        let location = null;
        const locationId = user?.location_id;
        if (locationId) {
            try {
                location = await this.locationService.findOneById(locationId);
            } catch {}
        }

        const contract = await this.contractService.issueContract(
            companyId,
            body.user_id,
            body.template_id,
            issuedBy,
            body.effective_date,
            body.end_date,
            body.notes,
            user,
            company,
            location
        );
        this.contractNotificationService.notifyContractIssued(contract).catch(() => {});
        return { statusCode: 200, message: 'Contract issued', data: this.contractService.mapGet(contract) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/list')
    async listContracts(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Query('_limit') limit?: number,
        @Query('_offset') offset?: number,
        @Query('_status') status?: string,
        @Query('_userId') userId?: string,
        @Query('_templateId') templateId?: string,
        @Query('_locationId') queryLocationId?: string,
    ) {
        const filters: any = {};
        if (status) filters.status = status;
        if (userId) filters.user_id = userId;
        if (templateId) filters.contract_template_id = templateId;

        // Location Admin: use selected location from navbar, fallback to JWT primary
        let effectiveLocationId = queryLocationId || null;
        if (roleName === 'Location Admin') {
            effectiveLocationId = queryLocationId || jwtLocationId;
        }

        // When location_id is provided: show contracts for that location OR unassigned (null)
        if (effectiveLocationId) {
            filters.$or = [
                { location_id: effectiveLocationId },
                { location_id: null },
            ];
        }

        const [items, total] = await Promise.all([
            this.contractService.findAll(companyId, limit ? +limit : 20, offset ? +offset : 0, filters),
            this.contractService.getTotal(companyId, filters),
        ]);

        // Batch-fetch employee names
        const userIds = [...new Set(items.map(c => c.user_id).filter(Boolean))];
        const userMap: Record<string, { name: string; email: string }> = {};
        if (userIds.length > 0) {
            const users = await this.userService.findAll(
                { _id: userIds },
                { paging: { limit: userIds.length, offset: 0 } }
            ) as any[];
            for (const u of users) {
                const first = (u as any).first_name || '';
                const last = (u as any).last_name || '';
                userMap[u._id] = { name: `${first} ${last}`.trim() || u.email, email: u.email || '' };
            }
        }

        // Batch-fetch template names
        const templateIds = [...new Set(items.map(c => c.contract_template_id).filter(Boolean))];
        const templateMap: Record<string, string> = {};
        if (templateIds.length > 0) {
            const templates = await this.templateService.findByIds(templateIds);
            for (const tmpl of templates) {
                templateMap[tmpl._id] = tmpl.name;
            }
        }

        return {
            statusCode: 200,
            message: 'Success',
            data: items.map(c => ({
                ...this.contractService.mapList(c),
                employee: c.user_id && userMap[c.user_id] ? userMap[c.user_id] : null,
                template_name: c.contract_template_id ? (templateMap[c.contract_template_id] || null) : null,
            })),
            _metadata: { total, limit: limit ? +limit : 20, offset: offset ? +offset : 0 },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/get/:id')
    async getContract(@Param('id') id: string) {
        const { contract, fieldValues } = await this.contractService.getContractWithValues(id);
        return {
            statusCode: 200,
            message: 'Success',
            data: { ...this.contractService.mapGet(contract), field_values: fieldValues },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/update/:id')
    async updateContract(
        @Param('id') id: string,
        @Body() body: any
    ) {
        const item = await this.contractService.update(id, body);
        return { statusCode: 200, message: 'Contract updated', data: this.contractService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/field-values/:id')
    async updateFieldValues(
        @Param('id') id: string,
        @Body() body: ContractFieldValuesUpdateRequestDto
    ) {
        await this.contractService.updateFieldValues(id, body.updates);
        return { statusCode: 200, message: 'Field values updated' };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/delete/:id')
    async deleteContract(@Param('id') id: string) {
        await this.contractService.softDelete(id);
        return { statusCode: 200, message: 'Contract deleted' };
    }

    // ============ CHANGE CONTRACT STATUS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/change-status/:id')
    async changeContractStatus(
        @Param('id') id: string,
        @Body() body: { status: string },
    ) {
        const contract = await this.contractService.findOneById(id);
        if (!contract) {
            return { statusCode: 404, message: 'Contract not found' };
        }

        const newStatus = body.status?.toLowerCase();
        let updated;

        if (newStatus === 'issued' && contract.status === 'signed') {
            // Revert signed → issued: clear signature, restore placeholder
            updated = await this.contractService.revertToIssued(id);
            // Re-send contract issued notification
            this.contractNotificationService.notifyContractIssued(updated).catch(() => {});
        } else if (['issued', 'terminated', 'expired', 'pending_signature'].includes(newStatus)) {
            updated = await this.contractService.changeStatus(id, newStatus);
        } else {
            return { statusCode: 400, message: 'Invalid status' };
        }

        return { statusCode: 200, message: `Contract status changed to ${newStatus}`, data: this.contractService.mapGet(updated) };
    }

    // ============ EDIT CONTRACT HTML ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/update-html/:id')
    async updateContractHtml(
        @Param('id') id: string,
        @AuthJwtPayload('user') adminId: string,
        @Body('rendered_html') renderedHtml: string,
    ) {
        const contract = await this.contractService.findOneById(id);
        if (!contract) {
            return { statusCode: 404, message: 'Contract not found' };
        }

        await this.contractService.updateRenderedHtml(id, renderedHtml, adminId);
        const updated = await this.contractService.findOneById(id);
        return { statusCode: 200, message: 'Contract updated', data: this.contractService.mapGet(updated) };
    }

    // ============ PDF DOWNLOAD ============

    @AuthJwtAccessProtected()
    @Get('/download-pdf/:id')
    async downloadPdf(
        @Param('id') id: string,
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: Response,
    ) {
        try {
            const contract = await this.contractService.findOneById(id);

            let html = contract?.rendered_html;

            if (!html) {
                return res.status(404).json({ statusCode: 404, message: 'No rendered content available for this contract' });
            }

            // Inject current company logo if the rendered HTML has an empty logo area
            try {
                if (companyId) {
                    html = await this.injectCurrentLogo(html, companyId);
                }
            } catch (logoErr) {
                // Non-fatal — continue without logo injection
            }

            const pdfBuffer = await this.pdfService.generatePdf(html);

            res.setHeader('Content-Encoding', 'identity');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="contract-${id}.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.end(pdfBuffer);
        } catch (err: any) {
            const message = err?.message || 'PDF generation failed';
            if (!res.headersSent) {
                res.status(500).json({ statusCode: 500, message });
            }
        }
    }

    // ============ TEMPLATE CLONE ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/template/clone/:id')
    async cloneTemplate(
        @Param('id') id: string,
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
    ) {
        const { template, sections } = await this.templateService.getTemplateWithSections(id);

        // Create a copy of the template for this company
        const newTemplate = await this.templateService.create(companyId, userId, {
            name: `${template.name} (copy)`,
            description: template.description,
            status: ENUM_CONTRACT_TEMPLATE_STATUS.DRAFT,
            version: 1,
            is_default: false,
            is_system: false,
            requires_signature: template.requires_signature,
        });

        // Clone all sections
        for (const section of sections) {
            await this.sectionService.create(newTemplate._id, {
                title: section.title,
                description: section.description,
                rich_text_body: section.rich_text_body,
                order: section.order,
                is_active: section.is_active,
            });
        }

        return { statusCode: 200, message: 'Template cloned', data: this.templateService.mapGet(newTemplate) };
    }

    /**
     * Inject the current company logo into contract HTML if the header-left is empty.
     * Uses base64 data URI so the PDF renders without network access.
     */
    private async injectCurrentLogo(html: string, companyId: string): Promise<string> {
        // If HTML already has an img in page-header-left, skip
        if (/page-header-left">\s*<img/i.test(html)) return html;

        try {
            const settings = await this.companySettingsService.getCompanyDefaults(companyId);
            const mapped = this.companySettingsService.mapGet(settings);
            if (!mapped.logo_url) return html;

            // Resolve logo to base64 from disk
            const relativePath = mapped.logo_url.replace(/^\/assets\//, '');
            const filePath = path.join(process.cwd(), 'public', relativePath);
            if (!fs.existsSync(filePath)) return html;

            const buffer = fs.readFileSync(filePath);
            const ext = path.extname(filePath).toLowerCase().replace('.', '');
            const mime = ext === 'svg' ? 'image/svg+xml'
                : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                : ext === 'webp' ? 'image/webp'
                : 'image/png';
            const dataUri = `data:${mime};base64,${buffer.toString('base64')}`;

            const displayName = mapped.company_display_name || '';
            const imgTag = `<img src="${dataUri}" alt="${displayName}" style="max-height: 60px;" />`;

            return html.replace(
                /<div class="page-header-left">\s*<\/div>/,
                `<div class="page-header-left">${imgTag}</div>`
            );
        } catch {
            return html;
        }
    }
}
