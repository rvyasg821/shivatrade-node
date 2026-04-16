import {
    IDatabaseCreateOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseSaveOptions,
} from '@common/database/interfaces/database.interface';
import { DiscountDoc } from '../repository/entities/discount.entity';
import { DiscountAppliedDoc } from '../repository/entities/discount-applied.entity';
import { DiscountCreateRequestDto } from '../dtos/request/discount.create.request.dto';
import { DiscountUpdateRequestDto } from '../dtos/request/discount.update.request.dto';
import { DiscountListResponseDto } from '../dtos/response/discount.list.response.dto';
import { DiscountGetResponseDto } from '../dtos/response/discount.get.response.dto';
import { DiscountApplyResponseDto } from '../dtos/response/discount.apply.response.dto';

export interface IDiscountService {
    findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<DiscountDoc[]>;

    getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number>;

    findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<DiscountDoc>;

    findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<DiscountDoc>;

    findByCode(code: string): Promise<DiscountDoc>;

    findActiveByCode(code: string, date?: Date): Promise<DiscountDoc>;

    create(
        data: DiscountCreateRequestDto,
        options?: IDatabaseCreateOptions
    ): Promise<DiscountDoc>;

    update(
        repository: DiscountDoc,
        data: DiscountUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<DiscountDoc>;

    softDelete(
        repository: DiscountDoc,
        options?: IDatabaseSaveOptions
    ): Promise<DiscountDoc>;

    delete(repository: DiscountDoc): Promise<boolean>;

    applyDiscountCode(
        discountCode: string,
        amount: number,
        date?: Date,
        companyId?: string,
        userId?: string
    ): Promise<DiscountApplyResponseDto>;

    recordDiscountApplication(
        companyId: string,
        userId: string,
        subscriptionId: string,
        discountId: string,
        discountCode: string,
        discountPrice: number,
        options?: IDatabaseCreateOptions
    ): Promise<DiscountAppliedDoc>;

    markExpiredDiscounts(): Promise<number>;

    countDiscountApplications(discountId: string): Promise<number>;

    mapList(discounts: DiscountDoc[]): DiscountListResponseDto[];

    mapGet(discount: DiscountDoc): DiscountGetResponseDto;
}
