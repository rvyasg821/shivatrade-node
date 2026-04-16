import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
    IDatabaseCreateOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseSaveOptions,
} from '@common/database/interfaces/database.interface';
import { CardRepository } from '../repository/repositories/card.repository';
import { CardDoc, CardEntity } from '../repository/entities/card.entity';
import { CardCreateRequestDto } from '../dtos/request/card.create.request.dto';
import { CardListResponseDto } from '../dtos/response/card.list.response.dto';

export interface ICardService {
    findAll(find?: Record<string, any>, options?: IDatabaseFindAllOptions): Promise<CardDoc[]>;
    getTotal(find?: Record<string, any>, options?: IDatabaseGetTotalOptions): Promise<number>;
    findOneById(_id: string, options?: IDatabaseFindOneOptions): Promise<CardDoc>;
    findOne(find: Record<string, any>, options?: IDatabaseFindOneOptions): Promise<CardDoc>;
    findByUserId(userId: string, options?: IDatabaseFindAllOptions): Promise<CardDoc[]>;
    create(data: CardCreateRequestDto, options?: IDatabaseCreateOptions): Promise<CardDoc>;
    update(repository: CardDoc, data: Partial<CardCreateRequestDto>, options?: IDatabaseSaveOptions): Promise<CardDoc>;
    softDelete(repository: CardDoc, options?: IDatabaseSaveOptions): Promise<CardDoc>;
    mapList(cards: CardDoc[]): CardListResponseDto[];
    mapGet(card: CardDoc): CardListResponseDto;
}

@Injectable()
export class CardService implements ICardService {
    constructor(
        private readonly cardRepository: CardRepository
    ) { }

    async findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<CardDoc[]> {
        const filters = {
            ...find,
            soft_delete: false,
        };
        return this.cardRepository.findAll(filters, options);
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        const filters = {
            ...find,
            soft_delete: false,
        };
        return this.cardRepository.getTotal(filters);
    }

    async findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<CardDoc> {
        return this.cardRepository.findOneById(_id, options);
    }

    async findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<CardDoc> {
        return this.cardRepository.findOne(find, options);
    }

    async findOneSort(
        find: Record<string, any>,
        sortField: string = 'createdAt',
        sortOrder: number = -1
    ): Promise<CardDoc> {
        return this.cardRepository.findOneSort(find, sortField, sortOrder);
    }

    async findByUserId(
        userId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<CardDoc[]> {
        return this.cardRepository.findByUserId(userId, options);
    }

    async findActiveByUserId(
        userId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<CardDoc[]> {
        return this.cardRepository.findActiveByUserId(userId, options);
    }

    async findDefaultByUserId(
        userId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<CardDoc> {
        return this.cardRepository.findDefaultByUserId(userId, options);
    }

    async create(
        data: CardCreateRequestDto,
        options?: IDatabaseCreateOptions
    ): Promise<CardDoc> {
        const create: CardEntity = new CardEntity();
        create.user_id = data.user_id;
        create.gateway = data.gateway;
        create.token_id = data.token_id;
        create.card_id = data.card_id;
        create.holder_name = data.holder_name;
        create.card_number = data.card_number;
        create.last4 = data.last4;
        create.expiry_month = data.expiry_month;
        create.expiry_year = data.expiry_year;
        create.response = data.response || {};
        create.is_default = data.is_default || false;
        create.status = data.status !== undefined ? data.status : true;
        create.soft_delete = false;

        // If this is set as default, unset other default cards for this user
        if (create.is_default) {
            await this.cardRepository.unsetDefaultForUser(data.user_id);
        }

        return this.cardRepository.create<CardEntity>(create, options);
    }

    async update(
        repository: CardDoc,
        data: Partial<CardCreateRequestDto>,
        options?: IDatabaseSaveOptions
    ): Promise<CardDoc>;
    async update(
        id: string,
        data: Partial<CardCreateRequestDto>
    ): Promise<CardDoc>;
    async update(
        repositoryOrId: CardDoc | string,
        data: Partial<CardCreateRequestDto>,
        options?: IDatabaseSaveOptions
    ): Promise<CardDoc> {
        console.log("typeof repositoryOrId", repositoryOrId);

        if (typeof repositoryOrId === 'string') {
            // Handle string ID case
            const updateData: Partial<CardEntity> = {};
            if (data.user_id) updateData.user_id = data.user_id;
            if (data.gateway !== undefined) updateData.gateway = data.gateway;
            if (data.token_id !== undefined) updateData.token_id = data.token_id;
            if (data.card_id !== undefined) updateData.card_id = data.card_id;
            if (data.holder_name !== undefined) updateData.holder_name = data.holder_name;
            if (data.card_number !== undefined) updateData.card_number = data.card_number;
            if (data.last4 !== undefined) updateData.last4 = data.last4;
            if (data.expiry_month !== undefined) updateData.expiry_month = data.expiry_month;
            if (data.expiry_year !== undefined) updateData.expiry_year = data.expiry_year;
            if (data.response !== undefined) updateData.response = data.response;
            if (data.is_default !== undefined) updateData.is_default = data.is_default;
            if (data.status !== undefined) updateData.status = data.status;

            const dataCard = await this.cardRepository.updateById(repositoryOrId, updateData);
            console.log('data', dataCard);

            return dataCard;
        } else {
            // Handle CardDoc case
            const repository = repositoryOrId;
            if (data.holder_name !== undefined) repository.holder_name = data.holder_name;
            if (data.expiry_month !== undefined) repository.expiry_month = data.expiry_month;
            if (data.expiry_year !== undefined) repository.expiry_year = data.expiry_year;
            if (data.response !== undefined) repository.response = data.response;
            if (data.token_id !== undefined) repository.token_id = data.token_id;
            if (data.card_id !== undefined) repository.card_id = data.card_id;

            // Handle default card logic
            if (data.is_default !== undefined && data.is_default) {
                await this.cardRepository.unsetDefaultForUser(repository.user_id.toString());
                repository.is_default = true;
            }

            return this.cardRepository.save(repository, options);
        }
    }

    async updateManyCards(filter: Record<string, any>, updateData: Record<string, any>): Promise<any> {
        return this.cardRepository.updateMany(filter, updateData);
    }

    async setAsDefault(
        cardId: string,
        userId: string
    ): Promise<CardDoc> {
        // First, unset all default cards for this user
        await this.cardRepository.unsetDefaultForUser(userId);

        // Then set the specified card as default
        const card = await this.findOneById(cardId);
        if (!card) {
            throw new Error('Card not found');
        }

        if (card.user_id.toString() !== userId) {
            throw new Error('Card does not belong to this user');
        }

        card.is_default = true;
        return this.cardRepository.save(card);
    }

    async softDelete(
        repository: CardDoc,
        options?: IDatabaseSaveOptions
    ): Promise<CardDoc> {
        repository.soft_delete = true;
        repository.status = false;

        // If deleting the default card, unset it
        if (repository.is_default) {
            repository.is_default = false;
        }

        return this.cardRepository.save(repository, options);
    }

    async remove(id: string): Promise<void> {
        await this.cardRepository.softDeleteById(id);
    }

    async deleteByUserIds(userIds: string[]): Promise<number> {
        if (!userIds || userIds.length === 0) return 0;
        return this.cardRepository.deleteByUserIds(userIds);
    }

    mapList(cards: CardDoc[]): CardListResponseDto[] {
        return plainToInstance(
            CardListResponseDto,
            cards.map((card: CardDoc) =>
                (card as any).toObject ? (card as any).toObject() : card
            )
        );
    }

    mapGet(card: CardDoc): CardListResponseDto {
        return plainToInstance(
            CardListResponseDto,
            (card as any).toObject ? (card as any).toObject() : card
        );
    }
}