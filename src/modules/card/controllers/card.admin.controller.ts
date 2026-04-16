import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Put,
    Query,
    UseGuards,
    Inject,
    forwardRef,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
    PaginationQuery,
} from '@common/pagination/decorators/pagination.decorator';
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

import { CardService } from '../services/card.service';
import { CardCreateRequestDto } from '../dtos/request/card.create.request.dto';
import { CardListResponseDto } from '../dtos/response/card.list.response.dto';
import { CardDoc } from '../repository/entities/card.entity';

import { AuthJwtAccessProtected } from '@modules/auth/decorators/auth.jwt.decorator';
import { Permission } from '@modules/role/decorators/permission.decorator';
import { PermissionGuard } from '@modules/role/guards/permission.guard';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';
import { PaymentService } from '@modules/payment/services/payment.service';


@ApiTags('modules.admin.card')
@Controller({
    version: '1',
    path: '/card',
})
export class CardAdminController {
    constructor(
        private readonly paginationService: PaginationService,
        private readonly cardService: CardService,
        @Inject(forwardRef(() => SubscriptionService))
        private readonly subscriptionService: SubscriptionService,
        @Inject(forwardRef(() => PaymentService))
        private readonly paymentService: PaymentService
    ) { }

    @ResponsePaging('card.list')
    @Permission('card', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @ApiBearerAuth('accessToken')
    @Get('/list')
    async list(
        @PaginationQuery()
        { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('user_id') userId?: string,
        @Query('gateway') gateway?: string,
        @Query('status') status?: string
    ): Promise<IResponsePaging<CardListResponseDto>> {
        const find: Record<string, any> = {
            ..._search,
        };

        if (userId) {
            find.user_id = userId;
        }

        if (gateway) {
            find.gateway = gateway;
        }

        if (status !== undefined) {
            find.status = status === 'true';
        }

        const cards: CardDoc[] = await this.cardService.findAll(find, {
            paging: {
                limit: _limit,
                offset: _offset,
            },
            order: _order,
        });

        const total: number = await this.cardService.getTotal(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        const mapped: CardListResponseDto[] = this.cardService.mapList(cards);

        return {
            _pagination: { total, totalPage },
            data: mapped,
        };
    }

    /**
     * Check if a user has any saved cards (for admin payment assignment)
     * Returns hasCards: true/false and count of cards
     */
    @Response('card.checkAvailability')
    @Permission('card', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Get('/check-availability/:userId')
    async checkCardAvailability(
        @Param('userId') userId: string
    ): Promise<IResponse<any>> {
        const cards = await this.cardService.findByUserId(userId);
        const activeCards = cards.filter(card => card.status === true);

        return {
            data: {
                hasCards: activeCards.length > 0,
                totalCards: cards.length,
                activeCards: activeCards.length,
                cards: activeCards.length > 0 ? this.cardService.mapList(activeCards) : [],
            },
        };
    }

    /**
     * Get the active card for a user with fallback strategy:
     * 1. Card from last active subscription's payment
     * 2. Fallback: Card marked as is_default
     * 3. Fallback: Most recently created card
     * Returns a single card for admin plan assignment
     */
    @Response('card.getActiveCard')
    @Permission('card', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @ApiBearerAuth('accessToken')
    @Get('/active-card/:userId')
    async getActiveCard(
        @Param('userId') userId: string,
        @Query('gateway') gateway?: string
    ): Promise<IResponse<any>> {
        console.log(`🔍 Getting active card for user: ${userId}, gateway: ${gateway || 'any'}`);

        let activeCard: CardDoc | null = null;
        let source = 'none';

        try {
            // Step 1: Try to find card from last active subscription's payment
            const activeSubscription = await this.subscriptionService.findActiveByUserId(userId);

            if (activeSubscription) {
                console.log(`   Found active subscription: ${activeSubscription._id}`);

                // Find the last completed payment for this subscription
                const userObjectId = userId;
                const lastPayment = await this.paymentService.findOne(
                    {
                        user_id: userObjectId,
                        subscription_id: activeSubscription._id,
                        status: 'completed',
                        paid: true,
                    }
                );

                if (lastPayment) {
                    console.log(`   Found last payment: ${lastPayment._id}`);

                    // Try to get card_id from payment's request_data
                    const paymentCardId = (lastPayment.request_data as any)?.card_id ||
                                         (lastPayment.request_data as any)?.selectedCard ||
                                         null;

                    if (paymentCardId) {
                        const card = await this.cardService.findOneById(String(paymentCardId));
                        if (card && card.status === true &&
                            (!gateway || card.gateway?.toLowerCase() === gateway.toLowerCase())) {
                            activeCard = card;
                            source = 'last_subscription_payment';
                            console.log(`   ✓ Found card from last payment: ${card._id}`);
                        }
                    }
                }
            }

            // Step 2: Fallback - Try default card
            if (!activeCard) {
                console.log(`   Trying fallback: default card`);
                const defaultCard = await this.cardService.findDefaultByUserId(userId);

                if (defaultCard && defaultCard.status === true &&
                    (!gateway || defaultCard.gateway?.toLowerCase() === gateway.toLowerCase())) {
                    activeCard = defaultCard;
                    source = 'default_card';
                    console.log(`   ✓ Found default card: ${defaultCard._id}`);
                }
            }

            // Step 3: Fallback - Get most recently created active card
            if (!activeCard) {
                console.log(`   Trying fallback: most recent card`);
                const filter: Record<string, any> = {
                    user_id: userId,
                    status: true,
                };

                if (gateway) {
                    filter.gateway = { $regex: new RegExp(`^${gateway}$`, 'i') };
                }

                const recentCard = await this.cardService.findOneSort(filter, 'createdAt', -1);

                if (recentCard) {
                    activeCard = recentCard;
                    source = 'most_recent';
                    console.log(`   ✓ Found most recent card: ${recentCard._id}`);
                }
            }

            if (activeCard) {
                return {
                    data: {
                        hasCard: true,
                        source: source,
                        card: this.cardService.mapGet(activeCard),
                    },
                };
            }

            // No card found
            console.log(`   ✗ No card found for user: ${userId}`);
            return {
                data: {
                    hasCard: false,
                    source: 'none',
                    card: null,
                },
            };

        } catch (error) {
            console.error(`Error getting active card for user ${userId}:`, error.message);
            return {
                data: {
                    hasCard: false,
                    source: 'error',
                    card: null,
                    error: error.message,
                },
            };
        }
    }

    @Response('card.get')
    @Permission('card', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Get('/:card')
    async get(
        @Param('card', RequestRequiredPipe) cardId: string
    ): Promise<IResponse<CardListResponseDto>> {
        const card = await this.cardService.findOneById(cardId);
        const mapped: CardListResponseDto = this.cardService.mapGet(card);
        return { data: mapped };
    }

    @Response('card.create')
    @Permission('card', 'can_add')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @Body() body: CardCreateRequestDto
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const created: CardDoc = await this.cardService.create(body);

        return {
            data: { _id: created._id.toString() },
        };
    }

    @Response('card.update')
    @Permission('card', 'can_update')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Put('/:card')
    async update(
        @Param('card', RequestRequiredPipe) cardId: string,
        @Body() body: Partial<CardCreateRequestDto>
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const card = await this.cardService.findOneById(cardId);
        const updated = await this.cardService.update(card, body);

        return {
            data: { _id: updated._id.toString() },
        };
    }

    @Response('card.delete')
    @Permission('card', 'can_delete')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @Delete('/:card')
    async delete(
        @Param('card', RequestRequiredPipe) cardId: string
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const card = await this.cardService.findOneById(cardId);
        await this.cardService.softDelete(card);

        return {
            data: { _id: card._id.toString() },
        };
    }
}