import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { CardEntity } from './entities/card.entity';
import { CardRepository } from './repositories/card.repository';

@Module({
    providers: [CardRepository],
    exports: [CardRepository],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [CardEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class CardRepositoryModule { }
