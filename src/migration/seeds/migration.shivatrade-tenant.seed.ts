import { Command } from 'nestjs-command';
import { Injectable, Logger } from '@nestjs/common';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import { LocationRepository } from '@modules/location/repository/repositories/location.repository';
import { UserService } from '@modules/user/services/user.service';
import { ENUM_COMPANY_STATUS } from '@modules/company/enums/company.enum';
import { ENUM_LOCATION_STATUS } from '@modules/location/enums/location.enum';

/**
 * Single-tenant seed for the ShivaTrades build (APP_MODE=single).
 *
 * Creates exactly ONE company row (ShivaTrades Impex Pvt Ltd / STIPL) and its
 * baseline locations. Designed to be safe to run any number of times:
 *
 *  - The company is matched by its unique `company_code` ('STIPL'). If it
 *    already exists it is reused, never duplicated or overwritten.
 *  - Each location is matched by (company_id, location_code) and only the
 *    MISSING ones are inserted. Locations the user has added by hand are left
 *    completely untouched — so the location set can grow freely over time.
 *    To ship a new baseline location later, just append to BASELINE_LOCATIONS.
 */
@Injectable()
export class MigrationShivatradeTenantSeed {
    private readonly logger = new Logger(MigrationShivatradeTenantSeed.name);

    private static readonly COMPANY_CODE = 'STIPL';

    /**
     * Baseline locations shipped with the single-tenant build. This is a
     * floor, not a ceiling — re-running the seed only adds any of these that
     * are missing and never removes or caps user-created locations.
     */
    private static readonly BASELINE_LOCATIONS = [
        {
            location_code: 'HO',
            location_name: 'ShivaTrades - Head Office',
            is_default: true,
        },
        {
            location_code: 'WH',
            location_name: 'ShivaTrades - Warehouse',
            is_default: false,
        },
    ];

    constructor(
        private readonly companyRepository: CompanyRepository,
        private readonly locationRepository: LocationRepository,
        private readonly userService: UserService,
    ) {}

    @Command({
        command: 'seed:shivatrade-tenant',
        describe: 'seed the single ShivaTrades company + baseline locations (idempotent)',
    })
    async seed(): Promise<void> {
        try {
            const company = await this.ensureCompany();
            await this.ensureLocations(String(company._id));
            this.logger.log('✅ ShivaTrades single-tenant seed complete');
        } catch (err: any) {
            this.logger.error(`❌ ShivaTrades tenant seed failed: ${err?.message || err}`);
            throw new Error(err);
        }
    }

    /** Find-or-create the single ShivaTrades company. */
    private async ensureCompany(): Promise<any> {
        const existing = await this.companyRepository.findOne({
            company_code: MigrationShivatradeTenantSeed.COMPANY_CODE,
        });

        if (existing) {
            this.logger.log(
                `↪︎ Company '${MigrationShivatradeTenantSeed.COMPANY_CODE}' already exists — reusing (${existing._id})`
            );
            return existing;
        }

        // The company row requires an owning user_id. Reuse the seeded System
        // Admin so the seed has no auth side-effects (it never creates users).
        const owner = await this.userService.findOneByEmail('admin@admin.com');
        if (!owner) {
            throw new Error(
                'System Admin user (admin@admin.com) not found. Run "yarn migrate:seed" first.'
            );
        }

        const created = await this.companyRepository.create({
            user_id: String(owner._id),
            company_name: 'ShivaTrades Impex Pvt Ltd',
            company_code: MigrationShivatradeTenantSeed.COMPANY_CODE,
            voucher_prefix: 'STIPL',
            contact_name: 'Rakesh',
            email: 'info@shivatradeimpex.com',
            mobile: '+919227859625',
            address_1: 'FF-3 FF-4 Plot 1, Sun Building 1',
            address_2: 'Abhishek Colony, Race Course Circle, Gotri',
            city: 'Vadodara',
            state: 'Gujarat',
            country: 'India',
            zipcode: '390007',
            currency: 'INR',
            timezone: 'Asia/Kolkata',
            status: ENUM_COMPANY_STATUS.ACTIVE,
            is_default: true,
            setup_completed: true,
        } as any);

        this.logger.log(`＋ Created company 'ShivaTrades Impex Pvt Ltd' (${created._id})`);
        return created;
    }

    /** Ensure each baseline location exists for the company. Adds only the missing ones. */
    private async ensureLocations(companyId: string): Promise<void> {
        const existingDefault = await this.locationRepository.findOne({
            company_id: companyId,
            is_default: true,
        });
        let aDefaultExists = !!existingDefault;

        for (const base of MigrationShivatradeTenantSeed.BASELINE_LOCATIONS) {
            const found = await this.locationRepository.findOne({
                company_id: companyId,
                location_code: base.location_code,
            });

            if (found) {
                this.logger.log(
                    `↪︎ Location '${base.location_code}' already exists — leaving untouched`
                );
                continue;
            }

            // Only claim the default flag if the company has no default yet.
            const isDefault = base.is_default && !aDefaultExists;
            if (isDefault) aDefaultExists = true;

            const created = await this.locationRepository.create({
                company_id: companyId,
                location_name: base.location_name,
                location_code: base.location_code,
                contact_name: 'Rakesh',
                email: 'info@shivatradeimpex.com',
                mobile: '+919227859625',
                city: 'Vadodara',
                state: 'Gujarat',
                country: 'India',
                timezone: 'Asia/Kolkata',
                currency: 'INR',
                status: ENUM_LOCATION_STATUS.ACTIVE,
                is_active: true,
                is_default: isDefault,
                soft_delete: false,
            } as any);

            this.logger.log(`＋ Created location '${base.location_name}' (${created._id})`);
        }
    }
}
