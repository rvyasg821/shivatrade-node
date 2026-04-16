import { Request } from 'express';
import { ResponsePagingMetadataPaginationRequestDto } from '@common/response/dtos/response.paging.dto';
import { IUserEntity } from '@modules/user/interfaces/user.interface';
import { IAuthJwtAccessTokenPayload } from '@modules/auth/interfaces/auth.interface';


export interface IRequestApp<T = IAuthJwtAccessTokenPayload> extends Request {
    user?: T;

    
    __user?: IUserEntity;
    __language: string;
    __version: string;

    __pagination?: ResponsePagingMetadataPaginationRequestDto;
}
