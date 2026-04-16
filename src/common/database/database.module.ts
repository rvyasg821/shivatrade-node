import { DynamicModule, Global, Module } from '@nestjs/common';
import { DatabaseOptionService } from '@common/database/services/database.options.service';
import { DatabaseService } from '@common/database/services/database.service';
import { DatabaseFindAllService } from '@common/database/services/database.find-all.service';
import { PaginationModule } from '@common/pagination/pagination.module';

@Module({
    providers: [DatabaseOptionService],
    exports: [DatabaseOptionService],
    imports: [],
    controllers: [],
})
export class DatabaseOptionModule {}

@Global()
@Module({})
export class DatabaseModule {
    static forRoot(): DynamicModule {
        return {
            module: DatabaseModule,
            providers: [DatabaseService, DatabaseFindAllService],
            exports: [DatabaseService, DatabaseFindAllService],
            imports: [PaginationModule],
            controllers: [],
        };
    }
}
