import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpException,
    HttpStatus,
    Param,
    Patch,
    Post,
    Put,
    Query,
    Res,
    UseGuards,
} from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import {
    ApiTags,
    ApiBearerAuth,
    ApiOperation,
    ApiQuery,
    ApiParam,
} from '@nestjs/swagger';
import { PaginationQuery } from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';
import { PaginationService } from '@common/pagination/services/pagination.service';
import { RequestRequiredPipe } from '@common/request/pipes/request.required.pipe';
import {
    Response,
    ResponsePaging,
} from '@common/response/decorators/response.decorator';
import {
    IResponse,
    IResponsePaging,
} from '@common/response/interfaces/response.interface';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';
import { NotFoundException } from '@nestjs/common';

import { PaymentService } from '../services/payment.service';
import { PaymentCreateRequestDto } from '../dtos/request/payment.create.request.dto';
import { PaymentListResponseDto } from '../dtos/response/payment.list.response.dto';
import {
    PaymentDoc,
    ENUM_PAYMENT_STATUS,
} from '../repository/entities/payment.entity';

import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { Permission } from '@modules/role/decorators/permission.decorator';
import { PermissionGuard } from '@modules/role/guards/permission.guard';
import { DocAuth } from '@common/doc/decorators/doc.decorator';
import { PAYMENT_DEFAULT_AVAILABLE_ORDER_BY } from '../constants/payment.list.constant';
import { CardService } from '@modules/card/services/card.service';
import { SubscriptionAdminAddToolsDoc } from '../docs/payment.admin.doc';
import { SubscriptionAddToolsRequestDto } from '../dtos/request/subscription.add-tools.request.dto';
import { SubscriptionAddToolsResponseDto } from '../dtos/response/subscription.add-tools.response.dto';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';

@ApiTags('modules.admin.payment')
@ApiBearerAuth()
@Controller({
    version: '1',
    path: '/payment',
})
export class PaymentAdminController {
    constructor(
        private readonly paginationService: PaginationService,
        private readonly paymentService: PaymentService,
        private readonly cardService: CardService,
        private readonly subscriptionService: SubscriptionService
    ) {}

    @ResponsePaging('payment.list')
    @Permission('payments', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @ApiOperation({
        summary: 'Get payments list (Admin)',
        description:
            'Retrieve a paginated list of all payments with advanced filtering options for admin users',
    })
    @ApiQuery({
        name: 'user_id',
        required: false,
        description: 'Filter payments by user ID',
        example: '507f1f77bcf86cd799439011',
    })
    @ApiQuery({
        name: 'status',
        required: false,
        description:
            'Filter payments by status (e.g., COMPLETED, PENDING, FAILED)',
        example: 'COMPLETED',
    })
    @ApiQuery({
        name: 'gateway',
        required: false,
        description: 'Filter payments by gateway (e.g., PAYPAL, STRIPE)',
        example: 'PAYPAL',
    })
    @ApiQuery({
        name: 'method',
        required: false,
        description: 'Filter payments by method (e.g., CARD, BANK_TRANSFER)',
        example: 'CARD',
    })
    @ApiQuery({
        name: 'company_id',
        required: false,
        description: 'Filter payments by company ID',
        example: '507f1f77bcf86cd799439011',
    })
    @ApiQuery({
        name: 'subscription_id',
        required: false,
        description: 'Filter payments by subscription ID',
        example: '507f1f77bcf86cd799439011',
    })
    @DocAuth({
        jwtAccessToken: true,
    })
    @Get('/list')
    async list(
        @PaginationQuery({
            availableOrderBy: PAYMENT_DEFAULT_AVAILABLE_ORDER_BY,
        })
        { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('user_id') userId?: string,
        @Query('status') status?: string,
        @Query('gateway') gateway?: string,
        @Query('method') method?: string,
        @Query('company_id') companyId?: string,
        @Query('subscription_id') subscriptionId?: string
    ): Promise<IResponsePaging<PaymentListResponseDto>> {
        const find: Record<string, any> = {
            ..._search,
        };

        if (userId) {
            find.user_id = userId;
        }

        if (status) {
            find.status = status;
        }

        if (gateway) {
            find.gateway = gateway;
        }

        if (method) {
            find.method = method;
        }

        if (companyId) {
            find['company_id'] = companyId;
        }

        if (subscriptionId) {
            find.subscription_id = subscriptionId;
        }

        const payments: PaymentDoc[] = await this.paymentService.findAll(find, {
            paging: {
                limit: _limit,
                offset: _offset,
            },
            order: _order,
        });

        const total: number = await this.paymentService.getTotal(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        const mapped: PaymentListResponseDto[] =
            await this.paymentService.mapList(payments);

        return {
            _pagination: { total, totalPage },
            data: mapped,
        };
    }

    @Response('payment.detail')
    @Permission('payments', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @ApiOperation({
        summary: 'Get payment detail with populated relations',
        description:
            'Retrieve a payment with full user, company, plan info and Stripe response details',
    })
    @ApiParam({
        name: 'id',
        description: 'Payment ID',
    })
    @Get('/detail/:id')
    async getDetail(
        @Param('id', RequestRequiredPipe) paymentId: string
    ): Promise<IResponse<any>> {
        const detail = await this.paymentService.getPaymentDetail(paymentId);

        if (!detail) {
            throw new NotFoundException('Payment not found');
        }

        return { data: detail };
    }

    @Permission('payments', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @ApiOperation({
        summary: 'Download invoice PDF',
        description: 'Download the invoice PDF for a specific payment',
    })
    @ApiParam({ name: 'id', description: 'Payment ID' })
    @Get('/download-invoice/:id')
    async downloadInvoice(
        @Param('id', RequestRequiredPipe) paymentId: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const payment = await this.paymentService.findOneById(paymentId);
        if (!payment) {
            throw new NotFoundException('Payment not found');
        }

        if (!payment.inv_path) {
            throw new HttpException('Invoice not available for this payment', HttpStatus.NOT_FOUND);
        }

        const filePath = path.join(process.cwd(), 'public', payment.inv_path);
        if (!fs.existsSync(filePath)) {
            throw new HttpException('Invoice file not found on server', HttpStatus.NOT_FOUND);
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${payment.full_inv_number || 'invoice'}.pdf"`);
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    }

    @Permission('payments', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @ApiOperation({
        summary: 'Send invoice email to company admin',
        description: 'Re-send the invoice email to the company admin for a specific payment',
    })
    @ApiParam({ name: 'id', description: 'Payment ID' })
    @Post('/send-invoice/:id')
    async sendInvoice(
        @Param('id', RequestRequiredPipe) paymentId: string
    ): Promise<IResponse<any>> {
        await this.paymentService.resendInvoiceEmail(paymentId);
        return { data: { message: 'Invoice sent successfully' } };
    }

    // NOTE: /:payment is a catch-all route — it MUST be defined AFTER all specific GET routes
    @Response('payment.get')
    @Permission('payments', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @ApiOperation({
        summary: 'Get payment by ID (Admin)',
        description: 'Retrieve a specific payment by its ID for admin users',
    })
    @ApiParam({
        name: 'payment',
        description: 'Payment ID',
        example: '507f1f77bcf86cd799439011',
    })
    @Get('/:payment')
    async get(
        @Param('payment', RequestRequiredPipe) paymentId: string
    ): Promise<IResponse<PaymentListResponseDto>> {
        const payment = await this.paymentService.findOneById(paymentId);

        if (!payment) {
            throw new NotFoundException('Payment not found');
        }

        const mapped: PaymentListResponseDto =
            this.paymentService.mapGet(payment);
        return { data: mapped };
    }

    @Response('payment.create')
    @Permission('payments', 'can_add')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @Body() body: PaymentCreateRequestDto
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const created: PaymentDoc = await this.paymentService.create(body);

        return {
            data: { _id: created._id.toString() },
        };
    }

    @Response('payment.updateStatus')
    @Permission('payments', 'can_update')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Patch('/:payment/status')
    async updateStatus(
        @Param('payment', RequestRequiredPipe) paymentId: string,
        @Body() body: { status: ENUM_PAYMENT_STATUS }
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const payment = await this.paymentService.findOneById(paymentId);

        if (!payment) {
            throw new NotFoundException('Payment not found');
        }

        const updated = await this.paymentService.updateStatus(
            payment,
            body.status
        );

        return {
            data: { _id: updated._id.toString() },
        };
    }

    @Response('payment.analytics')
    @Permission('payments', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Get('/analytics/overview')
    async analyticsOverview(): Promise<IResponse<Record<string, any>>> {
        const totalPayments = await this.paymentService.getTotal();
        const completedPayments = await this.paymentService.getTotal({
            status: ENUM_PAYMENT_STATUS.COMPLETED,
        });
        const failedPayments = await this.paymentService.getTotal({
            status: ENUM_PAYMENT_STATUS.FAILED,
        });
        const pendingPayments = await this.paymentService.getTotal({
            status: ENUM_PAYMENT_STATUS.PENDING,
        });

        return {
            data: {
                total: totalPayments,
                completed: completedPayments,
                failed: failedPayments,
                pending: pendingPayments,
            },
        };
    }

    @Response('payment.delete')
    @Permission('payments', 'can_delete')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Delete('/:payment')
    async delete(
        @Param('payment', RequestRequiredPipe) paymentId: string
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const payment = await this.paymentService.findOneById(paymentId);

        if (!payment) {
            throw new NotFoundException('Payment not found');
        }

        await this.paymentService.softDelete(payment);

        return {
            data: { _id: payment._id.toString() },
        };
    }

    @SubscriptionAdminAddToolsDoc()
    @Post('/update/subscription')
    @HttpCode(HttpStatus.OK)
    @Response('subscription.addTools')
    @AuthJwtAccessProtected()
    async addToolsToSubscription(
        @Body() body: SubscriptionAddToolsRequestDto,
        @AuthJwtPayload('user') userId: string
    ): Promise<IResponse<SubscriptionAddToolsResponseDto>> {
        try {
            // Validate request body
            if (
                !body.subscriptionId ||
                typeof body.subscriptionId !== 'string'
            ) {
                throw new Error('Invalid subscription ID');
            }

            if (!Array.isArray(body.tools) || body.tools.length === 0) {
                throw new Error('At least one tool must be provided');
            }

            if (!body.payment || typeof body.payment !== 'object') {
                throw new Error('Payment information is required');
            }

            if (!userId || typeof userId !== 'string') {
                throw new Error('User ID is required');
            }

            const result = await this.paymentService.addToolsToSubscription(
                body.subscriptionId,
                body.tools,
                body.payment,
                userId,
                this.cardService
            );

            // Validate result
            if (!result || typeof result !== 'object') {
                throw new Error('Invalid result from subscription service');
            }

            if (!result.subscription || !result.payment) {
                throw new Error('Incomplete result from subscription service');
            }

            const response: SubscriptionAddToolsResponseDto = {
                success: result.success === true,
                subscription: {
                    _id: result.subscription._id?.toString() || '',
                    tools: Array.isArray(result.subscription.tools)
                        ? result.subscription.tools.map((tool: any) => ({
                            _id: tool._id?.toString() || '',
                            name: tool.name || '',
                            slug: tool.slug || '',
                            base_price: tool.base_price ?? tool.price ?? 0,
                            pricing_mode: tool.pricing_mode || 'fixed',
                            location_multiplier: tool.location_multiplier || 1.0,
                            calculated_price: tool.calculated_price ?? tool.price ?? 0,
                            is_mandatory: tool.is_mandatory ?? false,
                            display_order: tool.display_order ?? 0,
                        }))
                        : [],
                    tools_price: Number(result.subscription.tools_price) || 0,
                    plan_price: Number(result.subscription.plan_price) || 0,
                    subtotal: Number(result.subscription.subtotal) || 0,
                    tax_price: Number(result.subscription.tax_price) || 0,
                    final_price: Number(result.subscription.final_price) || 0,
                },
                payment: {
                    _id: result.payment._id?.toString() || '',
                    charge_id: result.payment.charge_id || '',
                    status: result.payment.status || '',
                    amount: Number(result.payment.total) || 0,
                    gateway: result.payment.gateway || 'paypal',
                    method: result.payment.method || 'card',
                },
                provisioning: {
                    status: result.provisioning?.status || 'unknown',
                    toolsProvisioned:
                        Number(result.provisioning?.toolsProvisioned) || 0,
                    errors: Array.isArray(result.provisioning?.errors)
                        ? result.provisioning.errors
                        : [],
                },
                message: result.message || 'Tools added successfully',
            };

            return {
                _metadata: {
                    languages: [],
                    timestamp: Date.now(),
                },
                data: response,
            } as any;
        } catch (error) {
            throw error;
        }
    }
}