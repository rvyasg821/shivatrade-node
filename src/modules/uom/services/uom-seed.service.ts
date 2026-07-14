import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { UomRepository } from '@modules/uom/repository/repositories/uom.repository';
import { UomEntity } from '@modules/uom/repository/entities/uom.entity';
import { UOM_SEED } from '@modules/uom/seeds/uom.seed-data';
import { ENUM_UOM_STATUS } from '@modules/uom/enums/uom.enum';

/**
 * Seeds the 14 units that used to be hardcoded in `ENUM_PRODUCT_UOM`.
 *
 * THIS SEED IS LOAD-BEARING. Products, SO lines, POV lines and invoice lines all
 * store the unit as a loose string with no foreign key. If the master is empty,
 * `UomService.resolveCode()` rejects every unit and NO product can be saved. So
 * unlike the geo seeds (where an empty table is merely unhelpful), an empty UOM
 * table breaks the app — which is exactly why the seed runs on boot.
 *
 * Only when the table is empty, and it never updates or deletes: once the client
 * renames a unit or fixes a UQC code, a redeploy must not undo that.
 */
@Injectable()
export class UomSeedService implements OnApplicationBootstrap {
    private readonly logger = new Logger(UomSeedService.name);

    constructor(private readonly uomRepository: UomRepository) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            await this.seedIfEmpty();
        } catch (err: any) {
            this.logger.error(`uom seed failed: ${err?.message}`);
        }
    }

    async seedIfEmpty(): Promise<number> {
        // withDeleted: a client who deleted units still has a curated list.
        // Counting only live rows would see 0 and resurrect all 14.
        const existing = await this.uomRepository.getTotal(
            {},
            { withDeleted: true }
        );
        if (existing > 0) return 0;

        const rows = UOM_SEED.map((u, index) => {
            const entity = new UomEntity();
            entity.code = u.code;
            entity.name = u.name;
            entity.uqc_code = u.uqc_code;
            entity.allow_decimal = u.allow_decimal;
            entity.sort_order = index;
            entity.status = ENUM_UOM_STATUS.ACTIVE;
            return entity;
        });

        await this.uomRepository.createMany<UomEntity>(rows);
        this.logger.log(`uom master seeded — ${rows.length} units`);
        return rows.length;
    }
}
