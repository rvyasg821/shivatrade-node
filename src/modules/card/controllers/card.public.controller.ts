import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
    UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
    Response,
} from '@common/response/decorators/response.decorator';
import {
    IResponse,
} from '@common/response/interfaces/response.interface';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';

import { CardService } from '../services/card.service';
import { CardCreateRequestDto } from '../dtos/request/card.create.request.dto';
import { CardListResponseDto } from '../dtos/response/card.list.response.dto';
import { CardDoc } from '../repository/entities/card.entity';

import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { UserParsePipe } from '@modules/user/pipes/user.parse.pipe';
import { UserDoc } from '@modules/user/repository/entities/user.entity';

@ApiTags('modules.public.card')
@Controller({
    version: '1',
    path: '/card',
})
export class CardPublicController {
    constructor(
        private readonly cardService: CardService
    ) { }

    @Response('card.myCards')
    @AuthJwtAccessProtected()
    @Get('/my-cards')
    async getMyCards(
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc
    ): Promise<IResponse<CardListResponseDto[]>> {
        const cards = await this.cardService.findByUserId(user._id.toString());
        const mapped = this.cardService.mapList(cards);

        return { data: mapped };
    }

    @Response('card.myActiveCards')
    @AuthJwtAccessProtected()
    @Get('/my-active-cards')
    async getMyActiveCards(
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc
    ): Promise<IResponse<CardListResponseDto[]>> {
        const cards = await this.cardService.findActiveByUserId(user._id.toString());
        const mapped = this.cardService.mapList(cards);

        return { data: mapped };
    }

    @Response('card.myDefaultCard')
    @AuthJwtAccessProtected()
    @Get('/my-default-card')
    async getMyDefaultCard(
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc
    ): Promise<IResponse<CardListResponseDto | null>> {
        const card = await this.cardService.findDefaultByUserId(user._id.toString());
        const mapped = card ? this.cardService.mapGet(card) : null;

        return { data: mapped };
    }

    @Response('card.get')
    @AuthJwtAccessProtected()
    @Get('/:card')
    async get(
        @Param('card') cardId: string,
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc
    ): Promise<IResponse<CardListResponseDto>> {
        const card = await this.cardService.findOneById(cardId);

        // Ensure user can only access their own cards
        if (card.user_id.toString() !== user._id.toString()) {
            throw new Error('Unauthorized access to card');
        }

        const mapped = this.cardService.mapGet(card);
        return { data: mapped };
    }

    @Response('card.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @Body() body: CardCreateRequestDto,
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        // Override user_id with authenticated user's ID
        body.user_id = user._id.toString();

        const created: CardDoc = await this.cardService.create(body);

        return {
            data: { _id: created._id.toString() },
        };
    }

    @Response('card.update')
    @AuthJwtAccessProtected()
    @Put('/:card')
    async update(
        @Param('card') cardId: string,
        @Body() body: Partial<CardCreateRequestDto>,
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const card = await this.cardService.findOneById(cardId);

        // Ensure user can only update their own cards
        if (card.user_id.toString() !== user._id.toString()) {
            throw new Error('Unauthorized access to card');
        }

        const updated = await this.cardService.update(card, body);

        return {
            data: { _id: updated._id.toString() },
        };
    }

    @Response('card.setDefault')
    @AuthJwtAccessProtected()
    @Patch('/:card/set-default')
    async setDefault(
        @Param('card') cardId: string,
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const updated = await this.cardService.setAsDefault(cardId, user._id.toString());

        return {
            data: { _id: updated._id.toString() },
        };
    }

    @Response('card.delete')
    @AuthJwtAccessProtected()
    @Delete('/:card')
    async delete(
        @Param('card') cardId: string,
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const card = await this.cardService.findOneById(cardId);

        // Ensure user can only delete their own cards
        if (card.user_id.toString() !== user._id.toString()) {
            throw new Error('Unauthorized access to card');
        }

        await this.cardService.softDelete(card);

        return {
            data: { _id: card._id.toString() },
        };
    }
}