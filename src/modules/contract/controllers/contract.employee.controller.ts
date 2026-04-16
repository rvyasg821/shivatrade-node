import {
    Controller,
    Get,
    Post,
    Put,
    Body,
    Param,
    HttpStatus,
    HttpCode,
    Req,
    UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { ToolAccessGuard } from '@modules/subscription/guards/tool-access.guard';
import { RequireToolAccess } from '@modules/subscription/decorators/tool-access.decorator';

import { EmployeeContractService } from '../services/employee-contract.service';
import { ContractTemplateService } from '../services/contract-template.service';
import { ContractNotificationService } from '../services/contract-notification.service';
import { ContractSignRequestDto } from '../dtos/request/contract-sign.request.dto';
import { ContractFieldValuesUpdateRequestDto } from '../dtos/request/contract-field-values.update.request.dto';

@ApiTags('employee.contract')
@UseGuards(ToolAccessGuard)
@RequireToolAccess(['hrm-contracts'])
@Controller({
    version: '1',
    path: '/employee/contract',
})
export class ContractEmployeeController {
    constructor(
        private readonly contractService: EmployeeContractService,
        private readonly templateService: ContractTemplateService,
        private readonly contractNotificationService: ContractNotificationService,
    ) {}

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/my-contracts')
    async myContracts(@AuthJwtPayload('user') userId: string) {
        const items = await this.contractService.findByUser(userId);

        // Enrich with template names
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
                template_name: c.contract_template_id ? (templateMap[c.contract_template_id] || null) : null,
            })),
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/get/:id')
    async getContract(
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string
    ) {
        const { contract, fieldValues } = await this.contractService.getContractWithValues(id);
        // Ensure employee can only view their own contract
        if (contract.user_id !== userId) {
            return { statusCode: 403, message: 'Forbidden' };
        }
        return {
            statusCode: 200,
            message: 'Success',
            data: { ...this.contractService.mapGet(contract), field_values: fieldValues },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/field-values/:id')
    async updateFieldValues(
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string,
        @Body() body: ContractFieldValuesUpdateRequestDto
    ) {
        const contract = await this.contractService.findOneById(id);
        if (contract.user_id !== userId) {
            return { statusCode: 403, message: 'Forbidden' };
        }
        await this.contractService.updateFieldValues(id, body.updates);
        return { statusCode: 200, message: 'Field values updated' };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/sign/:id')
    async signContract(
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string,
        @Body() body: ContractSignRequestDto,
        @Req() req: Request
    ) {
        const contract = await this.contractService.findOneById(id);
        if (contract.user_id !== userId) {
            return { statusCode: 403, message: 'Forbidden' };
        }
        const ip = req.ip || req.connection?.remoteAddress || '';
        const signed = await this.contractService.sign(id, body.signature_data, ip);
        this.contractNotificationService.notifyContractSigned(signed).catch(() => {});
        return { statusCode: 200, message: 'Contract signed', data: this.contractService.mapGet(signed) };
    }
}
