import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { IDatabaseQueryContainOptions } from '@common/database/interfaces/database.interface';
import { ILike } from 'typeorm';

export function InjectDatabaseConnection(
    connectionName?: string
): ParameterDecorator {
    return InjectDataSource(connectionName ?? DATABASE_CONNECTION_NAME);
}

export function InjectDatabaseModel(
    entity: any,
    connectionName?: string
): ParameterDecorator {
    return InjectRepository(entity, connectionName ?? DATABASE_CONNECTION_NAME);
}

export function DatabaseHelperQueryContain(
    field: string,
    value: string,
    options?: IDatabaseQueryContainOptions
) {
    if (options?.fullWord) {
        return {
            [field]: {
                $regex: new RegExp(`\\b${value}\\b`),
                $options: 'i',
            },
        };
    }

    return {
        [field]: {
            $regex: new RegExp(value),
            $options: 'i',
        },
    };
}
