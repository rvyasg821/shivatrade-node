import {
    Controller,
    Get,
    Put,
    Patch,
    Body,
    Query,
    UseGuards,
    Logger,
    Param,
} from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
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

import { SubscriptionService } from '../services/subscription.service';
import { SubscriptionListResponseDto } from '../dtos/response/subscription.list.response.dto';
import { SubscriptionGetResponseDto } from '../dtos/response/subscription.get.response.dto';
import { SubscriptionUpdateRequestDto } from '../dtos/request/subscription.update.request.dto';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';
import {
    SUBSCRIPTION_DEFAULT_AVAILABLE_ORDER_BY,
    SUBSCRIPTION_DEFAULT_AVAILABLE_SEARCH,
} from '../constants/subscription.list.constant';

import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { Permission } from '@modules/role/decorators/permission.decorator';
import { PermissionGuard } from '@modules/role/guards/permission.guard';

import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { UserService } from '@modules/user/services/user.service';
import { SubscriptionAdminListDoc, SubscriptionAdminGetDoc, SubscriptionAdminUpdateDoc } from '../docs/subscription.admin.doc';
import { SubscriptionParsePipe } from '../pipes/subscription.parse.pipe';
import { SubscriptionDoc } from '../repository/entities/subscription.entity';
import { EnhancedEmailService } from '@modules/email/services/enhanced-email.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('modules.admin.subscription')
@Controller({
    version: '1',
    path: '/subscription',
})
export class SubscriptionAdminController {
    private readonly logger = new Logger(SubscriptionAdminController.name);

    constructor(
        private readonly paginationService: PaginationService,
        private readonly subscriptionService: SubscriptionService,
        private readonly userService: UserService,
        private readonly emailService: EnhancedEmailService,
        private readonly configService: ConfigService
    ) {
        this.logger.log('SubscriptionAdminController initialized (post multi-tenant removal)');
    }

    @SubscriptionAdminListDoc()
    @ResponsePaging('subscription.list')
    @Permission('subscription', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @ApiQuery({
        name: 'company_id',
        required: false,
    })
    @ApiQuery({
        name: 'user_id',
        required: false,
    })
    @ApiQuery({
        name: 'status',
        required: false,
    })
    @Get('/list')
    async list(
        @PaginationQuery({
            availableSearch: SUBSCRIPTION_DEFAULT_AVAILABLE_SEARCH,
            availableOrderBy: SUBSCRIPTION_DEFAULT_AVAILABLE_ORDER_BY,
        })
        { _search, _limit, _offset, _order }: PaginationListDto,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('user') CurrentuserId: string,
        @Query('user_id') userId?: string,
        @Query('status') status?: string,
        @Query('company_id') companyId?: string,
    ): Promise<IResponsePaging<SubscriptionListResponseDto>> {
        this.logger.debug(`Subscription list requested by role: ${roleName}`);

        const find: Record<string, any> = {
            ..._search,
        };

        // Agent can only see subscriptions they referred
        if (roleName === ENUM_SYSTEM_ROLE.AGENT) {
            const agent = await this.userService.findOneById(CurrentuserId?.toString());
            if (agent) {
                find['$or'] = [
                    { referal_code: agent.referal_code },
                    { agent_id: agent._id }
                ];
            } else {
                find['agent_id'] = CurrentuserId?.toString();
            }
        }

        // Filter by user_id if provided
        if (userId) {
            find.user_id = userId;
        }

        // Filter by status if provided
        if (status !== undefined && status !== null && status !== '') {
            find.status = status === '1' || status === 'true';
        }

        // Filter by company_id if provided
        if (companyId) {
            find.company_id = companyId;
        }

        this.logger.debug(`Query filters: ${JSON.stringify(find)}`);

        // Fetch subscriptions with joins
        const subscriptions: any[] =
            await this.subscriptionService.findAllWithJoins(find, {
                paging: {
                    limit: _limit,
                    offset: _offset,
                },
                order: _order,
            });

        this.logger.debug(`Found ${subscriptions.length} subscriptions`);

        const total: number = await this.subscriptionService.getTotal(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        // Map the subscriptions with joins
        const mapped: SubscriptionListResponseDto[] =
            await this.subscriptionService.mapGetWithJoinsArray(subscriptions);

        return {
            _pagination: { total, totalPage },
            data: mapped,
        };
    }

    /**
     * Returns the current user's subscription status.
     * Used by the dashboard to redirect inactive Company Admins to the upgrade
     * page, and by the upgrade page to refresh the tools list after a successful
     * purchase. NOTE: must be declared BEFORE the /:subscription route or it
     * will be parsed as a subscription ID.
     */
    @AuthJwtAccessProtected()
    @Get('/my-status')
    async myStatus(
        @AuthJwtPayload('user') userId: string,
    ): Promise<{ statusCode: number; message: string; data: any }> {
        const status = await this.subscriptionService.getMyStatus(userId);
        return { statusCode: 200, message: 'Success', data: status };
    }

    @SubscriptionAdminGetDoc()
    @Response('subscription.get')
    @Permission('subscription', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Get('/:subscription')
    async get(
        @Param('subscription', RequestRequiredPipe, SubscriptionParsePipe)
        subscription: SubscriptionDoc
    ): Promise<IResponse<any>> {
        this.logger.debug(`Fetching subscription: ${subscription._id}`);

        const subscriptionWithJoins =
            await this.subscriptionService.findOneWithJoins(subscription._id.toString());

        let mapped: any;
        if (subscriptionWithJoins) {
            mapped = await this.subscriptionService.mapGetWithJoins(
                subscriptionWithJoins
            );
        } else {
            // Fallback to original subscription if join failed
            mapped = await this.subscriptionService.mapGetWithJoins(subscription);
        }

        // Include tax_info from env so frontend uses correct tax rate for editing
        const taxLabel = this.configService.get<string>('TAX_LABEL') || 'Tax';
        const taxValue = this.configService.get<number>('TAX_VALUE') || 0;

        return {
            data: {
                ...mapped,
                tax_info: {
                    label: taxLabel,
                    value: taxValue,
                },
            },
        };
    }

    @SubscriptionAdminUpdateDoc()
    @Response('subscription.update')
    @Permission('subscription', 'can_update')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Put('/:subscription')
    async update(
        @Param('subscription', RequestRequiredPipe, SubscriptionParsePipe)
        subscription: SubscriptionDoc,
        @Body() body: SubscriptionUpdateRequestDto
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        this.logger.debug(`Updating subscription: ${subscription._id}`);

        // Validate location downgrade — block if company has more active locations than new limit
        if (body.locations !== undefined && subscription.company_id) {
            await this.subscriptionService.validateLocationDowngrade(
                subscription.company_id.toString(),
                subscription.locations || 1,
                body.locations
            );
        }

        const updated: SubscriptionDoc = await this.subscriptionService.update(
            subscription,
            body
        );

        // Send admin notification (async, non-blocking)
        this.sendAdminUpdateNotification(updated).catch(err =>
            this.logger.error('Failed to send admin update notification:', err)
        );

        return {
            data: { _id: updated._id.toString() },
        };
    }

    @Response('subscription.cancel')
    @Permission('subscription', 'can_update')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Patch('/:subscription/cancel')
    async cancel(
        @Param('subscription', RequestRequiredPipe, SubscriptionParsePipe)
        subscription: SubscriptionDoc
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        this.logger.debug(`Cancelling subscription: ${subscription._id}`);

        // Cancel subscription by setting status to false and cancelledAt timestamp
        const updated: SubscriptionDoc = await this.subscriptionService.update(
            subscription,
            {
                status: false,
                cancelledAt: new Date()
            }
        );

        this.logger.log(`Subscription ${subscription._id} cancelled successfully`);

        // Send admin notification (async, non-blocking)
        this.sendAdminCancelNotification(updated).catch(err =>
            this.logger.error('Failed to send admin cancel notification:', err)
        );

        return {
            data: { _id: updated._id.toString() },
        };
    }

    /**
     * Helper method to send admin and user notifications for subscription update
     */
    private async sendAdminUpdateNotification(subscription: SubscriptionDoc): Promise<void> {
        try {
            // Fetch subscription with joins to get full data
            const subscriptionWithJoins = await this.subscriptionService.findOneWithJoins(subscription._id.toString());

            if (!subscriptionWithJoins) {
                this.logger.warn('Could not find subscription with joins for notifications');
                return;
            }

            const emailData = {
                companyName: subscriptionWithJoins.company?.company_name || 'N/A',
                customerName: subscriptionWithJoins.user?.name || 'N/A',
                customerEmail: subscriptionWithJoins.user?.email || subscriptionWithJoins.company?.email || 'N/A',
                planName: subscriptionWithJoins.plan?.name || 'N/A',
                locations: subscription.locations || 1,
                totalPrice: subscription.subtotal || 0,
                finalPrice: subscription.final_price || subscription.subtotal || 0,
                status: subscription.status,
                endDate: subscription.end_date ? new Date(subscription.end_date).toISOString().split('T')[0] : 'N/A',
                discountCode: subscription.discount_code || null,
            };

            // Send admin notification
            const subCompanyId = subscription.company_id?.toString();
            await this.emailService.sendAdminSubscriptionUpdated(emailData, subCompanyId);
            this.logger.log(`Admin update notification sent for subscription: ${subscription._id}`);

            // Send user notification
            const userData = {
                name: subscriptionWithJoins.user?.name || 'Customer',
                email: subscriptionWithJoins.user?.email || subscriptionWithJoins.company?.email,
            };

            const subscriptionData = {
                planName: subscriptionWithJoins.plan?.name || 'N/A',
                planType: 'subscription',
                status: subscription.status,
            };

            await this.emailService.sendUserSubscriptionUpdated(userData, subscriptionData, subCompanyId);
            this.logger.log(`User update notification sent for subscription: ${subscription._id}`);
        } catch (error) {
            this.logger.error('Error sending update notifications:', error);
            throw error;
        }
    }

    /**
     * Helper method to send admin and user notifications for subscription cancellation
     */
    private async sendAdminCancelNotification(subscription: SubscriptionDoc): Promise<void> {
        try {
            // Fetch subscription with joins to get full data
            const subscriptionWithJoins = await this.subscriptionService.findOneWithJoins(subscription._id.toString());

            if (!subscriptionWithJoins) {
                this.logger.warn('Could not find subscription with joins for notifications');
                return;
            }

            const emailData = {
                companyName: subscriptionWithJoins.company?.company_name || 'N/A',
                customerName: subscriptionWithJoins.user?.name || 'N/A',
                customerEmail: subscriptionWithJoins.user?.email || subscriptionWithJoins.company?.email || 'N/A',
                planName: subscriptionWithJoins.plan?.name || 'N/A',
                cancelledDate: subscription.cancelledAt ? new Date(subscription.cancelledAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                endDate: subscription.end_date ? new Date(subscription.end_date).toISOString().split('T')[0] : 'N/A',
            };

            // Send admin notification
            const cancelCompanyId = subscription.company_id?.toString();
            await this.emailService.sendAdminSubscriptionCancelled(emailData, cancelCompanyId);
            this.logger.log(`Admin cancel notification sent for subscription: ${subscription._id}`);

            // Send user notification
            const userData = {
                name: subscriptionWithJoins.user?.name || 'Customer',
                email: subscriptionWithJoins.user?.email || subscriptionWithJoins.company?.email,
            };

            const subscriptionData = {
                planName: subscriptionWithJoins.plan?.name || 'N/A',
                cancelledDate: emailData.cancelledDate,
                endDate: emailData.endDate,
            };

            await this.emailService.sendUserSubscriptionCancelled(userData, subscriptionData, cancelCompanyId);
            this.logger.log(`User cancel notification sent for subscription: ${subscription._id}`);
        } catch (error) {
            this.logger.error('Error sending cancel notifications:', error);
            throw error;
        }
    }
}
