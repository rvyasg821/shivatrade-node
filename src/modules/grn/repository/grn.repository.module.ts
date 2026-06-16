import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { GrnEntity } from './entities/grn.entity';
import { GrnLineEntity } from './entities/grn-line.entity';
import { DebitNoteEntity } from './entities/debit-note.entity';
import { DebitNoteLineEntity } from './entities/debit-note-line.entity';
import { GrnRepository } from './repositories/grn.repository';
import { GrnLineRepository } from './repositories/grn-line.repository';
import { DebitNoteRepository } from './repositories/debit-note.repository';
import { DebitNoteLineRepository } from './repositories/debit-note-line.repository';

@Module({
    providers: [
        GrnRepository,
        GrnLineRepository,
        DebitNoteRepository,
        DebitNoteLineRepository,
    ],
    exports: [
        GrnRepository,
        GrnLineRepository,
        DebitNoteRepository,
        DebitNoteLineRepository,
    ],
    imports: [
        TypeOrmModule.forFeature(
            [GrnEntity, GrnLineEntity, DebitNoteEntity, DebitNoteLineEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class GrnRepositoryModule {}
