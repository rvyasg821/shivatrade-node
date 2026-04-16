import { Injectable } from '@nestjs/common';
import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ async: false })
@Injectable()
export class UniqueLocationsConstraint implements ValidatorConstraintInterface {
    validate(
        value: Array<{ locations: number; [key: string]: any }>,
        args: ValidationArguments
    ): boolean {
        if (!Array.isArray(value)) {
            return true; // Let other validators handle type checking
        }

        const locationCounts = value.map(tier => tier.locations);
        const uniqueLocations = new Set(locationCounts);

        return locationCounts.length === uniqueLocations.size;
    }

    defaultMessage(args: ValidationArguments): string {
        return 'Location pricing tiers must have unique location counts';
    }
}

export function UniqueLocations(validationOptions?: ValidationOptions) {
    return function (object: Record<string, any>, propertyName: string): void {
        registerDecorator({
            name: 'UniqueLocations',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: UniqueLocationsConstraint,
        });
    };
}
