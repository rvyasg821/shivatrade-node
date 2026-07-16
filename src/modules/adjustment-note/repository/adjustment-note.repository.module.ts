import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { AdjustmentNoteEntity } from './entities/adjustment-note.entity';
import { AdjustmentNoteRepository } from './repositories/adjustment-note.repository';

@Module({
    providers: [AdjustmentNoteRepository],
    exports: [AdjustmentNoteRepository],
    imports: [
        TypeOrmModule.forFeature(
            [AdjustmentNoteEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class AdjustmentNoteRepositoryModule {}
