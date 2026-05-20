import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PoVendorEntity } from '../entities/po-vendor.entity';

@Injectable()
export class PoVendorRepository extends DatabaseObjectIdRepositoryBase<PoVendorEntity> {
    constructor(
        @InjectDatabaseModel(PoVendorEntity)
        private readonly poVendorRepository: Repository<PoVendorEntity>
    ) {
        super(poVendorRepository);
    }
}
