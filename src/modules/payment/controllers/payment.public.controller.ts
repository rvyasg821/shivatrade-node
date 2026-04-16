import {
    Body,
    Controller,
    Delete,
    Get,
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
import {
    Response,
    ResponsePaging,
} from '@common/response/decorators/response.decorator';
import {
    IResponse,
    IResponsePaging,
} from '@common/response/interfaces/response.interface';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';
import { NotFoundException, BadRequestException } from '@nestjs/common';

import { PaymentService } from '../services/payment.service';
import { PaymentCreateRequestDto } from '../dtos/request/payment.create.request.dto';
import { PaymentRedirectRequestDto } from '../dtos/request/payment.redirect.request.dto';
import { PaymentListResponseDto } from '../dtos/response/payment.list.response.dto';
import { PaymentDoc } from '../repository/entities/payment.entity';
import {
    IStripeCardPaymentRequest,
    IStripePaymentResponse,
    IStripeConfirmPaymentRequest,
    IStripeConfigResponse,
} from '../interfaces/payment-stripe.interface';

import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { UserParsePipe } from '@modules/user/pipes/user.parse.pipe';
import { UserDoc } from '@modules/user/repository/entities/user.entity';
import { UserProtected } from '@modules/user/decorators/user.decorator';
import { UserService } from '@modules/user/services/user.service';
import { PAYMENT_DEFAULT_AVAILABLE_ORDER_BY, PAYMENT_DEFAULT_AVAILABLE_SEARCH } from '../constants/payment.list.constant';
import { StripeService } from '@common/stripe/stripe.service';

@ApiTags('modules.public.payment')
@ApiBearerAuth()
@Controller({
    version: '1',
    path: '/payment',
})
export class PaymentPublicController {
    constructor(
        private readonly paginationService: PaginationService,
        private readonly paymentService: PaymentService,
        private readonly userService: UserService,
        private readonly stripeService: StripeService
    ) { }

    @ApiBearerAuth('accessToken')
    @Response('payment.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @Body() body: PaymentCreateRequestDto,
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        // Override user_id with authenticated user's ID
        body.user_id = user._id.toString();
        // Set company_id from user's companyId or fallback to user_id
        body.company_id = user.companyId || user._id.toString();

        const created: PaymentDoc = await this.paymentService.create(body);

        return {
            data: { _id: created._id.toString() },
        };
    }

    @ResponsePaging('payment.myPaymentsList')
    @AuthJwtAccessProtected()
    @ApiOperation({
        summary: 'Get my payments list with pagination',
        description:
            "Retrieve a paginated list of current user's payments with optional status filtering",
    })
    @ApiQuery({
        name: 'status',
        required: false,
        description:
            'Filter payments by status (e.g., COMPLETED, PENDING, FAILED)',
        example: 'COMPLETED',
    })
    @ApiBearerAuth('accessToken')
    @Get('/my-payments/list')
    async getMyPaymentsList(
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc,
        @PaginationQuery({
            availableSearch: PAYMENT_DEFAULT_AVAILABLE_SEARCH,
            availableOrderBy: PAYMENT_DEFAULT_AVAILABLE_ORDER_BY,
        })
        { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string
    ): Promise<IResponsePaging<PaymentListResponseDto>> {
        const find: Record<string, any> = {
            ..._search,
            user_id: user._id.toString(),
        };

        if (status) {
            find.status = status;
        }

        const payments = await this.paymentService.findAll(find, {
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

    @ResponsePaging('payment.myPayments')
    @ApiOperation({
        summary: 'Get my payments with pagination',
        description: "Retrieve a paginated list of current user's payments",
    })
    @AuthJwtAccessProtected()
    @ApiBearerAuth('accessToken')
    @ApiQuery({
        name: 'search',
        required: false,
        type: String,
        description: 'Search term for payment name or description',
    })
    @Get('/my-payments')
    async getMyPayments(
        @AuthJwtPayload('user') user: string,
        @PaginationQuery()
        { _search, _limit, _offset, _order }: PaginationListDto
    ): Promise<IResponsePaging<PaymentListResponseDto>> {
        const find: Record<string, any> = {
            ..._search,
            user_id: user,
        };

        const payments = await this.paymentService.findAll(find, {
            paging: {
                limit: _limit,
                offset: _offset,
            },
            order: _order,
            join: true,
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

    @AuthJwtAccessProtected()
    @ApiOperation({
        summary: 'Download invoice PDF (Company Admin)',
        description: 'Download the invoice PDF for a payment owned by the authenticated user',
    })
    @ApiParam({ name: 'id', description: 'Payment ID' })
    @Get('/download-invoice/:id')
    async downloadInvoice(
        @AuthJwtPayload('user') userId: string,
        @Param('id') paymentId: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const payment = await this.paymentService.findOneById(paymentId);
        if (!payment) {
            throw new NotFoundException('Payment not found');
        }

        // Ensure user can only download their own invoices
        if (payment.user_id !== userId) {
            throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
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

    // ===================== STRIPE ENDPOINTS =====================
    // NOTE: These specific routes must come BEFORE the /:payment route
    // to avoid route parameter matching conflicts

    @Response('payment.stripe.config')
    @Get('/stripe-config')
    @ApiOperation({
        summary: 'Get Stripe configuration',
        description: 'Retrieve Stripe publishable key and configuration for frontend',
    })
    async getStripeConfig(): Promise<IResponse<IStripeConfigResponse>> {
        const publishableKey = this.stripeService.getPublishableKey();
        const currency = this.stripeService.getCurrency();

        return {
            data: {
                publishableKey,
                currency,
                mode: process.env.STRIPE_MODE || 'sandbox',
            },
        };
    }

    @Response('payment.stripe.cardPayment')
    @ApiBearerAuth('accessToken')
    @AuthJwtAccessProtected()
    @Post('/stripe-card-payment')
    @ApiOperation({
        summary: 'Process Stripe card payment',
        description: 'Process a one-time payment using Stripe with option to save card for recurring charges',
    })
    async stripeCardPayment(
        @Body() body: IStripeCardPaymentRequest,
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc,
        @AuthJwtPayload('roleName') roleName: string
    ): Promise<IResponse<IStripePaymentResponse>> {
        try {
            console.log('🚀 Stripe Card Payment Controller - Start');
            console.log('🔍 Role Name:', roleName);
            console.log('🔍 Request Body:', JSON.stringify(body, null, 2));
            console.log('🔍 User ID:', user._id.toString());
            
            // Set user_id and company_id from authenticated user
            if (roleName !== 'Admin') {
                const userId = user._id.toString();
                const userDoc = await this.userService.findOneById(userId);
                const companyId = userDoc.companyId;

                const result =
                    await this.paymentService.processStripeCardPayment({
                        ...body,
                        user_id: userId,
                        company_id: companyId,
                    });

                return {
                    data: result,
                };
            }

            // Admin processing payment for another user
            console.log('🔧 Admin processing payment for user:', body['user_id']);
            const userDoc = await this.userService.findOneById(body['user_id']);
            const companyId = userDoc.companyId;
            console.log('🔧 Company ID:', companyId);

            const result =
                await this.paymentService.processStripeCardPaymentForSubscriptionUpdateByAdmin({
                    ...body,
                    company_id: companyId,
                });

            console.log('✅ Admin payment processing completed');
            console.log('📤 Returning result:', JSON.stringify(result, null, 2));

            return {
                data: result,
            };
        } catch (error) {
            throw new BadRequestException(
                error.message || 'Stripe payment processing failed'
            );
        }
    }

    @Response('payment.stripe.confirmPayment')
    @ApiBearerAuth('accessToken')
    @AuthJwtAccessProtected()
    @Post('/stripe-confirm-payment')
    @ApiOperation({
        summary: 'Confirm Stripe payment after 3D Secure',
        description: 'Confirm payment intent after 3D Secure authentication',
    })
    async confirmStripePayment(
        @Body() body: IStripeConfirmPaymentRequest,
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc
    ): Promise<IResponse<any>> {
        try {
            const result =
                await this.paymentService.confirmStripePayment(body);

            return {
                data: result,
            };
        } catch (error) {
            throw new BadRequestException(
                error.message || 'Payment confirmation failed'
            );
        }
    }

    // ===================== GENERIC PAYMENT ENDPOINTS =====================

    @Response('payment.get')
    @ApiBearerAuth('accessToken')
    @AuthJwtAccessProtected()
    @ApiOperation({
        summary: 'Get payment by ID',
        description:
            'Retrieve a specific payment by its ID (users can only access their own payments)',
    })
    @ApiParam({
        name: 'payment',
        description: 'Payment ID',
        example: '507f1f77bcf86cd799439011',
    })
    @Get('/:payment')
    async get(
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc,
        @Param('payment') paymentId: string
    ): Promise<IResponse<PaymentListResponseDto>> {
        // Validate ObjectId format
        if (!paymentId || !(/^[0-9a-fA-F]{24}$/.test(paymentId))) {
            throw new BadRequestException('Invalid payment ID format');
        }

        const payment = await this.paymentService.findOneById(paymentId);

        if (!payment) {
            throw new NotFoundException('Payment not found');
        }

        // Ensure user can only access their own payments
        if (payment.user_id.toString() !== user._id.toString()) {
            throw new BadRequestException('Unauthorized access to payment');
        }

        const mapped = this.paymentService.mapGet(payment);
        return { data: mapped };
    }

    @Response('payment.paypalCardPayment')
    @ApiBearerAuth('accessToken')
    @AuthJwtAccessProtected()
    @Post('/paypal-card-payment')
    async paypalCardPayment(
        @Body() body: PaymentCreateRequestDto,
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc,
        @AuthJwtPayload('roleName') roleName: string
    ): Promise<IResponse<any>> {
        // Override user_id with authenticated user's ID
        
        if (roleName !== 'Admin') {
            body.user_id = user._id.toString();
            // Set company_id from user's companyId or fallback to user_id
            let company_id = await this.userService.findOneById(
                user._id.toString()
            );

            body.company_id = company_id.companyId;

            const result =
                await this.paymentService.processPayPalCardPayment(body);

            return {
                data: result,
            };
        }

        // Set company_id from user's companyId or fallback to user_id
        let company_id = await this.userService.findOneById(body.user_id);

        body.company_id = company_id.companyId;

        const result =
            await this.paymentService.processPayPalCardPaymentForSubscriptionUpdateByAdmin(
                body
            );

        return {
            data: result,
        };
    }

    @Response('payment.confirmRedirectPaypalPayment')
    @ApiBearerAuth('accessToken')
    @AuthJwtAccessProtected()
    @Post('/confirm-redirect-paypal-payment')
    async confirmRedirectPaypalPayment(
        @Body() body: PaymentRedirectRequestDto,
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc
    ): Promise<IResponse<any>> {
        const result =
            await this.paymentService.confirmRedirectPayPalPayment(body as any);

        return {
            data: result,
        };
    }
}
