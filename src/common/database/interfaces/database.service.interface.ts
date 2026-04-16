import { QueryRunner } from 'typeorm';

export interface IDatabaseService {
    createTransaction(): Promise<QueryRunner>;
    commitTransaction(queryRunner: QueryRunner): Promise<void>;
    abortTransaction(queryRunner: QueryRunner): Promise<void>;
    filterEqual<T = string>(
        field: string,
        filterValue: T
    ): Record<string, { $eq: T }>;
    filterNotEqual<T = string>(
        field: string,
        filterValue: T
    ): Record<string, { $ne: T }>;
    filterContain(field: string, filterValue: string): Record<string, any>;
    filterContainFullMatch(
        field: string,
        filterValue: string
    ): Record<string, any>;
    filterIn<T = string>(
        field: string,
        filterValue: T[]
    ): Record<string, { $in: T[] }>;
    filterNin<T = string>(
        field: string,
        filterValue: T[]
    ): Record<
        string,
        {
            $nin: T[];
        }
    >;
    filterDateBetween(
        fieldStart: string,
        fieldEnd: string,
        filterStartValue: Date,
        filterEndValue: Date
    ): Record<string, any>;
}
