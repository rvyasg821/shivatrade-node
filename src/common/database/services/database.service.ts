import { Injectable } from '@nestjs/common';
import { IDatabaseService } from '@common/database/interfaces/database.service.interface';
import {
    DatabaseHelperQueryContain,
    InjectDatabaseConnection,
} from '@common/database/decorators/database.decorator';
import { DataSource, QueryRunner } from 'typeorm';

@Injectable()
export class DatabaseService implements IDatabaseService {
    constructor(
        @InjectDatabaseConnection()
        private readonly dataSource: DataSource
    ) {}

    async createTransaction(): Promise<QueryRunner> {
        const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        return queryRunner;
    }

    async commitTransaction(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.commitTransaction();
        await queryRunner.release();
    }

    async abortTransaction(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
    }

    filterEqual<T = string>(
        field: string,
        filterValue: T
    ): Record<string, { $eq: T }> {
        return {
            [field]: {
                $eq: filterValue,
            },
        };
    }

    filterNotEqual<T = string>(
        field: string,
        filterValue: T
    ): Record<string, { $ne: T }> {
        return {
            [field]: {
                $ne: filterValue,
            },
        };
    }

    filterContain(field: string, filterValue: string): Record<string, any> {
        return DatabaseHelperQueryContain(field, filterValue);
    }

    filterContainFullMatch(
        field: string,
        filterValue: string
    ): Record<string, any> {
        return DatabaseHelperQueryContain(field, filterValue, {
            fullWord: true,
        });
    }

    filterIn<T = string>(
        field: string,
        filterValue: T[]
    ): Record<string, { $in: T[] }> {
        return {
            [field]: {
                $in: filterValue,
            },
        };
    }

    filterNin<T = string>(
        field: string,
        filterValue: T[]
    ): Record<
        string,
        {
            $nin: T[];
        }
    > {
        return {
            [field]: {
                $nin: filterValue,
            },
        };
    }

    filterDateBetween(
        fieldStart: string,
        fieldEnd: string,
        filterStartValue: Date,
        filterEndValue: Date
    ): Record<string, any> {
        if (fieldStart === fieldEnd) {
            return {
                [fieldStart]: {
                    $gte: filterStartValue,
                    $lte: filterEndValue,
                },
            };
        }

        return {
            [fieldStart]: {
                $gte: filterStartValue,
            },
            [fieldEnd]: {
                $lte: filterEndValue,
            },
        };
    }

    filterLte<T = string>(
        field: string,
        filterValue: T
    ): Record<string, { $lte: T }> {
        return {
            [field]: {
                $lte: filterValue,
            },
        };
    }

    filterGte<T = string>(
        field: string,
        filterValue: T
    ): Record<string, { $gte: T }> {
        return {
            [field]: {
                $gte: filterValue,
            },
        };
    }

    aggregateIncrement(
        field: string,
        incrementValue: number
    ): Record<string, any> {
        return {
            $inc: {
                [field]: incrementValue,
            },
        };
    }
}
