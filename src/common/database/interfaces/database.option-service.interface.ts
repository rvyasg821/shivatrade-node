import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export interface IDatabaseOptionService {
    createOptions(): TypeOrmModuleOptions;
}
