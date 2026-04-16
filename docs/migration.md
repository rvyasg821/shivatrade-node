# Overview

> TODO: (v8) In the future will replace `nestjs-command` with `commander`

This documentation explains the features and usage of:
- **Migration Module**: Located at `src/migration/**`

This document covers the migration and seed functionality in the ACK NestJS Boilerplate project, explaining how database seeding works and how to use the migration commands.

# Table of Contents
- [Overview](#overview)
- [Table of Contents](#table-of-contents)
  - [Modules](#modules)
    - [Migration Module](#migration-module)
    - [Seed Modules](#seed-modules)
  - [Data Seed](#data-seed)
    
    - [Country Seed](#country-seed)
    - [Role Seed](#role-seed)
    - [User Seed](#user-seed)
  - [Template Seed](#template-seed)
    - [Purpose](#purpose)
    - [Supported Templates](#supported-templates)
    - [Implementation](#implementation)
    - [Commands](#commands)
    - [Usage](#usage)
  - [Running Migrations](#running-migrations)
  - [Creating Custom Seeds](#creating-custom-seeds)
    - [Testing Seeds](#testing-seeds)


## Modules 

The system uses `nestjs-command` to create CLI commands that can be executed to seed or remove data from the database.

Each seed module is responsible for a specific domain area and can be executed independently or as part of the full migration process. Seeds can also be reversed, allowing you to clean up the database as needed.

The entry point for all migrations is the `src/cli.ts` file, which creates a NestJS application context specifically for migration operations:

```typescript
async function bootstrap() {
    process.env.APP_ENV = ENUM_APP_ENVIRONMENT.MIGRATION;

    const app = await NestFactory.createApplicationContext(MigrationModule, {
        logger: ['error', 'fatal'],
        abortOnError: true,
        bufferLogs: false,
    });

    const logger = new Logger('NestJs-Seed');

    try {
        await app.select(CommandModule).get(CommandService).exec();
        process.exit(0);
    } catch (err: unknown) {
        logger.error(err);
        process.exit(1);
    }
}
```

### Migration Module

The Migration Module (`src/migration/migration.module.ts`) serves as the entry point for all migration operations. It imports all necessary modules and registers seed providers:

```typescript
@Module({
    imports: [
        CommonModule,
        CommandModule,
        CountryModule,
        EmailModule,
        AuthModule,
        RoleModule,
        UserModule,
        ActivityModule,
        PasswordHistoryModule,
        SessionModule,
        CountryModule,
    ],
    providers: [
        MigrationCountrySeed,
        MigrationUserSeed,
        MigrationRoleSeed,
        MigrationTemplateSeed,
    ],
    exports: [],
})
export class MigrationModule {}
```

This module integrates with the `CommandModule` from `nestjs-command` to provide command-line functionality and imports all required service modules to perform the seeding operations.

### Seed Modules

Seed modules are responsible for populating the database with initial data. Each seed module focuses on a specific domain area and follows a consistent pattern:

1. An `@Injectable()` class that accepts relevant services via dependency injection
2. Methods decorated with `@Command()` that execute seeding operations
3. Typically includes both a `seeds()` method to add data and a `remove()` method to clean up data

All seed modules are registered in the `MigrationModule` as providers, allowing them to be executed via the command line.

The seed process follows a logical progression where dependent data is seeded first. The typical order is:

2. Countries
3. Roles
4. Users
5. Templates (handled separately)

## Data Seed



### Country Seed

**File**: `src/migration/seeds/migration.country.seed.ts`

Seeds the database with country information. By default, it adds Indonesia with all its related data.

Implementation:

```typescript
@Injectable()
export class MigrationCountrySeed {
    constructor(private readonly countryService: CountryService) {}

    @Command({
        command: 'seed:country',
        describe: 'seed countries',
    })
    async seeds(): Promise<void> {
        try {
            const countries = [
                {
                    iso2: 'ID',
                    iso3: 'IDN',
                    name: 'Indonesia',
                    dialCode: '+62',
                    provinces: [
                        // List of provinces for Indonesia
                        { name: 'Aceh' },
                        { name: 'Bali' },
                        { name: 'Banten' },
                        // Additional provinces...
                    ],
                    cities: [
                        // List of cities for Indonesia
                        { name: 'Jakarta', province: 'DKI Jakarta' },
                        { name: 'Surabaya', province: 'Jawa Timur' },
                        { name: 'Bandung', province: 'Jawa Barat' },
                        // Additional cities...
                    ],
                    languages: [
                        // List of languages for Indonesia
                        { name: 'Indonesian (Bahasa Indonesia)', iso2: 'id' },
                        { name: 'Javanese', iso2: 'jv' },
                        { name: 'Sundanese', iso2: 'su' },
                        // Additional languages...
                    ],
                    timezones: [
                        // List of timezones for Indonesia
                        { name: 'Western Indonesian Time', offset: '+07:00' },
                        { name: 'Central Indonesian Time', offset: '+08:00' },
                        { name: 'Eastern Indonesian Time', offset: '+09:00' },
                    ],
                    currencies: [
                        // Currency for Indonesia
                        { name: 'Indonesian Rupiah', symbol: 'Rp', iso: 'IDR' },
                    ],
                },
                // Additional countries can be added here
            ];
            
            await Promise.all(
                countries.map(async country => {
                    await this.countryService.create(country);
                })
            );
        } catch (err: any) {
            throw new Error(err.message);
        }
    }

    @Command({
        command: 'remove:country',
        describe: 'remove countries',
    })
    async remove(): Promise<void> {
        try {
            await this.countryService.deleteMany({});
        } catch (err: any) {
            throw new Error(err.message);
        }
    }
}
```

Commands:
- `seed:country` - Adds countries
- `remove:country` - Removes all countries

### Role Seed

**File**: `src/migration/seeds/migration.role.seed.ts`

Seeds the database with predefined roles and their permissions:

- `superadmin` - Has all system permissions
- `admin` - Has administrative permissions
- `individual` - Standard user role
- `premium` - Premium user role
- `business` - Business user role

Implementation:

```typescript
@Injectable()
export class MigrationRoleSeed {
    constructor(private readonly roleService: RoleService) {}

    @Command({
        command: 'seed:role',
        describe: 'seed roles',
    })
    async seeds(): Promise<void> {
        const data: RoleCreateRequestDto[] = [
            {
                name: 'superadmin',
                type: ENUM_POLICY_ROLE_TYPE.SUPER_ADMIN,
                permissions: [],
            },
            {
                name: 'admin',
                type: ENUM_POLICY_ROLE_TYPE.ADMIN,
                permissions: Object.values(ENUM_POLICY_SUBJECT)
                    .filter(e => e !== ENUM_POLICY_SUBJECT.API_KEY)
                    .map(val => ({
                        subject: val,
                        action: [ENUM_POLICY_ACTION.MANAGE],
                    })),
            },
            {
                name: 'individual',
                type: ENUM_POLICY_ROLE_TYPE.USER,
                permissions: [],
            },
            // Additional roles...
        ];

        try {
            await this.roleService.createMany(data);
        } catch (err: any) {
            throw new Error(err);
        }
    }

    // Remove method...
}
```

Commands:
- `seed:role` - Creates roles
- `remove:role` - Removes all roles

### User Seed

**File**: `src/migration/seeds/migration.user.seed.ts`

Seeds the database with default users for each role type. It also creates corresponding password history and activity records for each user.

Implementation:

```typescript
@Injectable()
export class MigrationUserSeed {
    constructor(
        private readonly authService: AuthService,
        private readonly userService: UserService,
        private readonly roleService: RoleService,
        private readonly countryService: CountryService,
        private readonly passwordHistoryService: PasswordHistoryService,
        private readonly activityService: ActivityService,
        private readonly messageService: MessageService,
        private readonly sessionService: SessionService
    ) {}

    @Command({
        command: 'seed:user',
        describe: 'seed users',
    })
    async seeds(): Promise<void> {
        const password = 'aaAA@123';
        const passwordHash = this.authService.createPassword(password);
        const superAdminRole: RoleDoc =
            await this.roleService.findOneByName('superadmin');
        const adminRole: RoleDoc =
            await this.roleService.findOneByName('admin');

        const country: CountryDoc =
            await this.countryService.findOneByAlpha2('ID');

        // Get other roles by name...

        try {
            // Create all users in parallel
            const [superAdmin, admin, individual, premium, business] =
                await Promise.all([
                    this.userService.create(
                        {
                            role: superAdminRole._id,
                            name: 'superadmin',
                            email: 'superadmin@mail.com',
                            // Additional user properties...
                        },
                        passwordHash
                    ),
                    // Additional user creations...
                ]);

            // Create password histories for each user
            await Promise.all([
                this.passwordHistoryService.create({
                    user: superAdmin._id,
                    password: passwordHash,
                    type: ENUM_PASSWORD_HISTORY_TYPE.CREATED,
                }),
                // Additional password histories...
            ]);

            // Create activities for each user
            await Promise.all([
                this.activityService.create({
                    user: superAdmin._id,
                    message: this.messageService.get('activity.createUser', {
                        properties: {
                            email: superAdmin.email,
                        },
                    }),
                }),
                // Additional activities...
            ]);
        } catch (err: any) {
            throw new Error(err.message);
        }
    }

    // Remove method...
}
```

Commands:
- `seed:user` - Creates users
- `remove:user` - Removes all users, activities, password histories, and sessions

Default seeded users include:
- `superadmin@mail.com`
- `admin@mail.com`
- `individual@mail.com`
- `premium@mail.com`
- `business@mail.com`

All with the default password: `aaAA@123`



## Running Migrations

The project includes npm scripts to simplify migration operations:

```bash
# Run all data migrations
yarn migrate:seed

# Run migrations in reverse (clean up the database)
yarn migrate:remove

# Only migrate email templates
yarn migrate:template

# Remove email templates
yarn rollback:template

# Complete reset and rebuild of the database
yarn migrate:fresh
```

These commands are defined in the `package.json` file:

```json
"scripts": {
    "migrate:fresh": "yarn migrate:remove && yarn migrate:seed",
    "migrate:seed": "nestjs-command seed:country && nestjs-command seed:apikey && nestjs-command seed:role && nestjs-command seed:user",
    "migrate:remove": "nestjs-command remove:user && nestjs-command remove:country && nestjs-command remove:role",
    "migrate:template": "nestjs-command migrate:template",
    "rollback:template": "nestjs-command rollback:template"
}
```

Note that the scripts handle the ordering of operations automatically. For example, the `migrate:seed` script ensures that countries are seeded before users since users depend on countries being available in the database.


## Creating Custom Seeds

To create a custom seed module:

1. Create a new file in `src/migration/seeds/` with a meaningful name like `migration.your-entity.seed.ts`
2. Implement the seed class with `@Injectable()` decorator
3. Inject required services in the constructor
4. Add `@Command()` methods for seed and remove operations
5. Register your seed class in `src/migration/migration.module.ts`
6. Update the npm scripts in `package.json` to include your new commands

Example of a custom seed:

```typescript
import { Command } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { YourService } from '@modules/your-module/services/your.service';

@Injectable()
export class MigrationYourSeed {
    constructor(private readonly yourService: YourService) {}

    @Command({
        command: 'seed:your-command',
        describe: 'seeds your data',
    })
    async seeds(): Promise<void> {
        try {
            const data = [
                // Your data here
            ];
            
            await this.yourService.createMany(data);
        } catch (err: any) {
            throw new Error(err.message);
        }
        
        return;
    }

    @Command({
        command: 'remove:your-command',
        describe: 'remove your data',
    })
    async remove(): Promise<void> {
        try {
            await this.yourService.deleteMany({});
        } catch (err: any) {
            throw new Error(err.message);
        }
        
        return;
    }
}
```

Then add your new seed to the `MigrationModule`:

```typescript
@Module({
    // ...imports
    providers: [
        // ...existing seeds
        MigrationYourSeed,
    ],
})
export class MigrationModule {}
```

Finally, update the npm scripts in `package.json` to include your new commands:

```json
"scripts": {
    "migrate:seed": "nestjs-command seed:country && nestjs-command seed:apikey && nestjs-command seed:role && nestjs-command seed:user && nestjs-command seed:your-command",
    "migrate:remove": "nestjs-command remove:user && nestjs-command remove:country && nestjs-command remove:apikey && nestjs-command remove:role && nestjs-command remove:your-command",
}
```

### Testing Seeds

Before committing your new seed, test it with:

```bash
# Test seeding the data
yarn nestjs-command seed:your-command

# Test removal
yarn nestjs-command remove:your-command
```
