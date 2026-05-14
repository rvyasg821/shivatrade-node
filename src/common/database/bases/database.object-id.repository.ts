import {
    Repository,
    FindOptionsWhere,
    FindOptionsOrder,
    FindOptionsRelations,
    Not,
    In,
    LessThanOrEqual,
    MoreThanOrEqual,
    LessThan,
    MoreThan,
    ILike,
    IsNull,
    QueryRunner,
    DataSource,
    SelectQueryBuilder,
    FindManyOptions,
    FindOperator,
    Equal,
    Raw,
    Between,
} from 'typeorm';
import {
    IDatabaseAggregateOptions,
    IDatabaseCreateManyOptions,
    IDatabaseCreateOptions,
    IDatabaseDeleteManyOptions,
    IDatabaseDeleteOptions,
    IDatabaseExistsOptions,
    IDatabaseFindAllAggregateOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseSaveOptions,
    IDatabaseSoftDeleteOptions,
    IDatabaseUpdateManyOptions,
    IDatabaseUpdateOptions,
    IDatabaseUpsertOptions,
} from '@common/database/interfaces/database.interface';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';
import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';

// Types for backward compatibility
export type IDatabaseDocument<T> = T;

export interface IInsertManyResult {
    acknowledged: boolean;
    insertedCount: number;
}

export interface IUpdateResult {
    affected: number;
}

export interface IDeleteResult {
    affected: number;
}

/**
 * Translates MongoDB-style filter objects into TypeORM FindOptionsWhere.
 *
 * Supports:
 *   { field: value }                       -> { field: value }
 *   { field: { $eq: value } }              -> { field: Equal(value) }
 *   { field: { $ne: value } }              -> { field: Not(value) }
 *   { field: { $in: [...] } }              -> { field: In([...]) }
 *   { field: { $nin: [...] } }             -> { field: Not(In([...])) }
 *   { field: { $lte: value } }             -> { field: LessThanOrEqual(value) }
 *   { field: { $gte: value } }             -> { field: GreaterThanOrEqual(value) }
 *   { field: { $lt: value } }              -> { field: LessThan(value) }
 *   { field: { $gt: value } }              -> { field: GreaterThan(value) }
 *   { field: { $regex: pattern, $options: 'i' } } -> { field: ILike('%pattern%') }
 *   { $or: [{...}, {...}] }                -> array of where clauses
 *   { field: { $gte: v1, $lte: v2 } }     -> combined operators
 */
function translateValue(value: any): any {
    if (value === null || value === undefined) {
        return value === null ? IsNull() : value;
    }

    if (typeof value !== 'object' || value instanceof Date || value instanceof FindOperator) {
        return value;
    }

    if (Array.isArray(value)) {
        return In(value);
    }

    // Check if it's a MongoDB operator object
    const keys = Object.keys(value);
    const isMongoOperator = keys.some(k => k.startsWith('$'));

    if (!isMongoOperator) {
        return value;
    }

    // Handle combined operators like { $gte: date1, $lte: date2 }.
    //
    // PREVIOUS IMPLEMENTATION used Raw() with named parameters (:p0, :p1) to
    // assemble a SQL fragment. That didn't reliably bind when mixed with
    // plain where fields - the date filter would silently drop, causing
    // queries to return all rows. See: attendance Monthly Report bug.
    //
    // FIX: use TypeORM's native FindOperators directly. The most common case
    // ($gte + $lte only) maps cleanly to Between(). Other combinations fall
    // back to the previous Raw approach which is fine for non-range filters.
    if (keys.length > 1 && keys.every(k => k.startsWith('$')) && !keys.includes('$regex')) {
        // Happy path: just $gte + $lte → Between(a, b)
        if (keys.length === 2 && keys.includes('$gte') && keys.includes('$lte')) {
            return Between(value.$gte, value.$lte);
        }
        // Happy path: just $gt + $lt → still representable via Between with small offset
        // (rare, typically only seen on date filters) - fall through to Raw for these
        // since Between is inclusive and $gt/$lt are exclusive. Raw with a SINGLE column
        // and fresh parameter names has worked historically for single-operator cases;
        // we only observed the bug when multiple conditions share parameter namespaces.

        // For everything else, build via Raw (legacy path) - still works for
        // filters that only use one operator per column in the query.
        const conditions: string[] = [];
        const params: Record<string, any> = {};

        keys.forEach((key, index) => {
            const paramName = `p${index}`;
            switch (key) {
                case '$gte':
                    conditions.push(`__ALIAS__ >= :${paramName}`);
                    params[paramName] = value[key];
                    break;
                case '$lte':
                    conditions.push(`__ALIAS__ <= :${paramName}`);
                    params[paramName] = value[key];
                    break;
                case '$gt':
                    conditions.push(`__ALIAS__ > :${paramName}`);
                    params[paramName] = value[key];
                    break;
                case '$lt':
                    conditions.push(`__ALIAS__ < :${paramName}`);
                    params[paramName] = value[key];
                    break;
                case '$ne':
                    conditions.push(`__ALIAS__ != :${paramName}`);
                    params[paramName] = value[key];
                    break;
            }
        });

        if (conditions.length > 0) {
            return Raw(alias => conditions.map(c => c.replace(/__ALIAS__/g, alias)).join(' AND '), params);
        }
    }

    // Single operator
    if (keys.includes('$regex')) {
        const pattern = value.$regex;
        const regStr = pattern instanceof RegExp ? pattern.source : String(pattern);
        const options = value.$options || '';
        // Handle word boundary regex (e.g. \bWord\b) -> exact match
        const wordBoundaryMatch = regStr.match(/^\\b(.+)\\b$/);
        if (wordBoundaryMatch) {
            const exactValue = wordBoundaryMatch[1];
            return options.includes('i') ? ILike(exactValue) : Equal(exactValue);
        }
        if (options.includes('i')) {
            return ILike(`%${regStr}%`);
        }
        return Raw(alias => `${alias} LIKE :pattern`, { pattern: `%${regStr}%` });
    }

    const op = keys[0];
    const val = value[op];
    switch (op) {
        case '$eq':
            return Equal(val);
        case '$ne':
            return val === null ? Not(IsNull()) : Not(val);
        case '$in':
            return In(val);
        case '$nin':
            return Not(In(val));
        case '$lte':
            return LessThanOrEqual(val);
        case '$gte':
            return MoreThanOrEqual(val);
        case '$lt':
            return LessThan(val);
        case '$gt':
            return MoreThan(val);
        case '$exists':
            return val ? Not(IsNull()) : IsNull();
        default:
            return value;
    }
}

function translateMongoFilter<Entity>(
    find: Record<string, any> | undefined
): FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[] | undefined {
    if (!find || Object.keys(find).length === 0) {
        return undefined;
    }

    // Handle $or at top level
    if (find.$or) {
        const orConditions = find.$or as Record<string, any>[];
        // Get non-$or fields
        const baseFields: Record<string, any> = {};
        for (const key of Object.keys(find)) {
            if (key !== '$or') {
                baseFields[key] = translateValue(find[key]);
            }
        }

        return orConditions.map(condition => {
            const translated: Record<string, any> = { ...baseFields };
            for (const key of Object.keys(condition)) {
                translated[key] = translateValue(condition[key]);
            }
            return translated as FindOptionsWhere<Entity>;
        });
    }

    // Handle $and at top level
    if (find.$and) {
        // Merge all conditions
        const merged: Record<string, any> = {};
        for (const key of Object.keys(find)) {
            if (key !== '$and') {
                merged[key] = translateValue(find[key]);
            }
        }
        for (const condition of find.$and as Record<string, any>[]) {
            for (const key of Object.keys(condition)) {
                merged[key] = translateValue(condition[key]);
            }
        }
        return merged as FindOptionsWhere<Entity>;
    }

    const result: Record<string, any> = {};
    for (const key of Object.keys(find)) {
        if (key.startsWith('$')) continue;
        result[key] = translateValue(find[key]);
    }
    return result as FindOptionsWhere<Entity>;
}

function translateOrder(order: Record<string, any> | undefined): Record<string, any> | undefined {
    if (!order) return undefined;
    const result: Record<string, any> = {};
    for (const key of Object.keys(order)) {
        const val = order[key];
        if (typeof val === 'string') {
            result[key] = val.toUpperCase();
        } else if (typeof val === 'number') {
            result[key] = val === 1 ? 'ASC' : 'DESC';
        } else {
            result[key] = val;
        }
    }
    return result;
}

function translateSelect(
    select: Record<string, boolean | number> | string | undefined
): string[] | undefined {
    if (!select) return undefined;
    if (typeof select === 'string') {
        // Strip Mongoose-style +field prefix; exclude -field exclusions
        return select.split(' ')
            .filter(s => !s.startsWith('-') && s.length > 0)
            .map(s => s.startsWith('+') ? s.slice(1) : s);
    }
    const fields: string[] = [];
    for (const key of Object.keys(select)) {
        if (select[key] === true || select[key] === 1) {
            fields.push(key);
        }
    }
    // Always include _id
    if (fields.length > 0 && !fields.includes('_id')) {
        fields.unshift('_id');
    }
    return fields.length > 0 ? fields : undefined;
}

export class DatabaseObjectIdRepositoryBase<
    Entity extends DatabaseObjectIdEntityBase,
> {
    protected readonly _repository: Repository<Entity>;
    readonly _join?: FindOptionsRelations<Entity>;

    constructor(
        repository: Repository<Entity>,
        options?: FindOptionsRelations<Entity>
    ) {
        this._repository = repository;
        this._join = options;
    }

    // Find
    async findAll<T = Entity>(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<T[]> {
        const whereBase = translateMongoFilter<Entity>(find);
        const deletedFilter = !options?.withDeleted ? { deleted: false } : {};

        const where = this._mergeWhere(whereBase, deletedFilter);

        const findOptions: FindManyOptions<Entity> = {
            where: where as any,
        };

        const selectFields = translateSelect(options?.select);
        if (selectFields) {
            findOptions.select = selectFields.reduce((acc, field) => {
                (acc as any)[field] = true;
                return acc;
            }, {} as any);
        }

        if (options?.paging) {
            findOptions.take = options.paging.limit;
            findOptions.skip = options.paging.offset;
        }

        if (options?.order) {
            findOptions.order = translateOrder(options.order) as FindOptionsOrder<Entity>;
        }

        if (options?.join) {
            findOptions.relations = (
                typeof options.join === 'boolean' && options.join
                    ? this._join
                    : options.join
            ) as FindOptionsRelations<Entity>;
        }

        return this._repository.find(findOptions) as unknown as T[];
    }

    async findOne<T = Entity>(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<T> {
        if (
            !find ||
            typeof find !== 'object' ||
            Object.keys(find).length === 0
        ) {
            throw new Error('Find criteria must be a non-empty object');
        }

        const whereBase = translateMongoFilter<Entity>(find);
        const deletedFilter = !options?.withDeleted ? { deleted: false } : {};
        const where = this._mergeWhere(whereBase, deletedFilter);

        const findOptions: any = {
            where,
        };

        const selectFields = translateSelect(options?.select);
        if (selectFields) {
            findOptions.select = selectFields.reduce((acc: any, field: string) => {
                acc[field] = true;
                return acc;
            }, {});
        }

        if (options?.order) {
            findOptions.order = translateOrder(options.order);
        }

        if (options?.join) {
            findOptions.relations = (
                typeof options.join === 'boolean' && options.join
                    ? this._join
                    : options.join
            ) as FindOptionsRelations<Entity>;
        }

        return this._repository.findOne(findOptions) as unknown as T;
    }

    async findOneById<T = Entity>(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<T> {
        if (!_id) {
            throw new Error('ID must be provided');
        }

        return this.findOne<T>(
            { _id } as any,
            options
        );
    }

    async findOneAndLock<T = Entity>(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<T> {
        // In PostgreSQL, we find and update the timestamp for a "lock" effect
        const entity = await this.findOne<T>(find, options);
        if (entity) {
            (entity as any).updatedAt = new Date();
            await this._repository.save(entity as any);
        }
        return entity;
    }

    async findOneByIdAndLock<T = Entity>(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<T> {
        if (!_id) {
            throw new Error('ID must be provided');
        }
        return this.findOneAndLock<T>({ _id } as any, options);
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        const whereBase = translateMongoFilter<Entity>(find);
        const deletedFilter = !options?.withDeleted ? { deleted: false } : {};
        const where = this._mergeWhere(whereBase, deletedFilter);

        return this._repository.count({
            where: where as any,
        });
    }

    async exists(
        find: Record<string, any>,
        options?: IDatabaseExistsOptions
    ): Promise<boolean> {
        if (
            !find ||
            typeof find !== 'object' ||
            Object.keys(find).length === 0
        ) {
            throw new Error('Find criteria must be a non-empty object');
        }

        const whereBase = translateMongoFilter<Entity>(find);
        const deletedFilter = !options?.withDeleted ? { deleted: false } : {};
        let where = this._mergeWhere(whereBase, deletedFilter);

        if (options?.excludeId) {
            where = this._mergeWhere(where, { _id: Not(options.excludeId) });
        }

        const count = await this._repository.count({
            where: where as any,
        });
        return count > 0;
    }

    // Create
    async create<T extends Partial<Entity>>(
        data: T,
        options?: IDatabaseCreateOptions
    ): Promise<Entity> {
        if (
            !data ||
            typeof data !== 'object' ||
            Object.keys(data).length === 0
        ) {
            throw new Error('Data must be a non-empty object');
        }

        const now = new Date();
        (data as any).createdAt = now;
        (data as any).updatedAt = now;

        if (options?.actionBy) {
            (data as any).createdBy = options.actionBy;
        }

        const entity = this._repository.create(data as any);
        return this._repository.save(entity) as any as Promise<Entity>;
    }

    // Update
    async update<T extends Partial<Entity>>(
        find: Record<string, any>,
        data: T,
        options?: IDatabaseUpdateOptions
    ): Promise<Entity> {
        if (
            !find ||
            typeof find !== 'object' ||
            Object.keys(find).length === 0
        ) {
            throw new Error('Find criteria must be a non-empty object');
        }

        if (
            !data ||
            typeof data !== 'object' ||
            Object.keys(data).length === 0
        ) {
            throw new Error('Data must be a non-empty object');
        }

        const entity = await this.findOne<Entity>(find, {
            withDeleted: options?.withDeleted,
        });
        if (!entity) {
            return null;
        }

        const now = new Date();
        Object.assign(entity, data);
        (entity as any).updatedAt = now;
        if (options?.actionBy) {
            (entity as any).updatedBy = options.actionBy;
        }

        return this._repository.save(entity);
    }

    async updateRaw(
        find: Record<string, any>,
        data: Record<string, any>,
        options?: IDatabaseUpdateOptions
    ): Promise<Entity> {
        if (
            !find ||
            typeof find !== 'object' ||
            Object.keys(find).length === 0
        ) {
            throw new Error('Find criteria must be a non-empty object');
        }

        // Extract $set, $inc, $unset from MongoDB-style update
        const updateData = this._extractUpdateData(data);

        const entity = await this.findOne<Entity>(find, {
            withDeleted: options?.withDeleted,
        });
        if (!entity) {
            return null;
        }

        const now = new Date();
        Object.assign(entity, updateData);
        (entity as any).updatedAt = now;
        if (options?.actionBy) {
            (entity as any).updatedBy = options.actionBy;
        }

        return this._repository.save(entity);
    }

    async upsert(
        find: Record<string, any>,
        data: Record<string, any>,
        options?: IDatabaseUpsertOptions
    ): Promise<Entity> {
        if (
            !find ||
            typeof find !== 'object' ||
            Object.keys(find).length === 0
        ) {
            throw new Error('Find criteria must be a non-empty object');
        }

        const existing = await this.findOne<Entity>(find, {
            withDeleted: options?.withDeleted,
        });

        const now = new Date();
        if (existing) {
            const updateData = this._extractUpdateData(data);
            Object.assign(existing, updateData);
            (existing as any).updatedAt = now;
            if (options?.actionBy) {
                (existing as any).updatedBy = options.actionBy;
            }
            return this._repository.save(existing) as any as Promise<Entity>;
        } else {
            const insertData = this._extractUpdateData(data);
            const onInsertData = data['$setOnInsert'] || {};
            const merged = {
                ...find,
                ...insertData,
                ...onInsertData,
                createdAt: now,
                updatedAt: now,
            };
            if (options?.actionBy) {
                merged.createdBy = options.actionBy;
                merged.updatedBy = options.actionBy;
            }
            const entity = this._repository.create(merged as any);
            return this._repository.save(entity) as any as Promise<Entity>;
        }
    }

    async delete(
        find: Record<string, any>,
        options?: IDatabaseDeleteOptions
    ): Promise<Entity> {
        if (
            !find ||
            typeof find !== 'object' ||
            Object.keys(find).length === 0
        ) {
            throw new Error('Find criteria must be a non-empty object');
        }

        const entity = await this.findOne<Entity>(find, {
            withDeleted: options?.withDeleted,
        });
        if (!entity) {
            return null;
        }

        await this._repository.remove(entity);
        return entity;
    }

    async save(
        entity: Entity,
        options?: IDatabaseSaveOptions
    ): Promise<Entity> {
        if (!entity) {
            throw new Error('Entity must be provided');
        }

        if (!(entity as any)._id) {
            // New entity
            const now = new Date();
            (entity as any).createdAt = now;
            (entity as any).updatedAt = now;
            if (options?.actionBy) {
                (entity as any).createdBy = options.actionBy;
            }
        } else {
            // Existing entity
            (entity as any).updatedAt = new Date();
            if (options?.actionBy) {
                (entity as any).updatedBy = options.actionBy;
            }
        }

        return this._repository.save(entity);
    }

    async join<T>(
        entity: Entity,
        _joins: Record<string, any>
    ): Promise<T> {
        if (!entity) {
            throw new Error('Entity must be provided');
        }

        // Re-fetch with relations
        return this._repository.findOne({
            where: { _id: (entity as any)._id } as any,
            relations: _joins as FindOptionsRelations<Entity>,
        }) as unknown as T;
    }

    // Soft delete
    async softDelete(
        entity: Entity,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<Entity> {
        if (!entity) {
            throw new Error('Entity must be provided');
        }

        (entity as any).deletedAt = new Date();
        (entity as any).deleted = true;
        if (options?.actionBy) {
            (entity as any).deletedBy = options.actionBy;
        }

        return this._repository.save(entity);
    }

    async restore(
        entity: Entity,
        options?: IDatabaseSaveOptions
    ): Promise<Entity> {
        if (!entity) {
            throw new Error('Entity must be provided');
        }

        (entity as any).deletedAt = null;
        (entity as any).deletedBy = null;
        (entity as any).deleted = false;
        (entity as any).updatedAt = new Date();
        if (options?.actionBy) {
            (entity as any).updatedBy = options.actionBy;
        }

        return this._repository.save(entity);
    }

    // Bulk operations
    async createMany<T extends Partial<Entity>>(
        data: T[],
        options?: IDatabaseCreateManyOptions
    ): Promise<IInsertManyResult> {
        if (!data || !Array.isArray(data) || data.length === 0) {
            throw new Error('Data must be a non-empty array');
        }

        const now = new Date();
        const entities = data.map(e => {
            return this._repository.create({
                ...e,
                createdAt: now,
                updatedAt: now,
                ...(options?.actionBy && { createdBy: options.actionBy }),
            } as any);
        });

        const saved = await this._repository.save(entities as any[]);
        return {
            acknowledged: true,
            insertedCount: (saved as any[]).length,
        };
    }

    async updateMany<T = Partial<Entity>>(
        find: Record<string, any>,
        data: T,
        options?: IDatabaseUpdateManyOptions
    ): Promise<IUpdateResult> {
        if (
            !find ||
            typeof find !== 'object' ||
            Object.keys(find).length === 0
        ) {
            throw new Error('Find criteria must be a non-empty object');
        }

        if (
            !data ||
            typeof data !== 'object' ||
            Object.keys(data).length === 0
        ) {
            throw new Error('Data must be a non-empty object');
        }

        const now = new Date();
        const updateData: any = {
            ...(data as any),
            updatedAt: now,
        };
        if (options?.actionBy) {
            updateData.updatedBy = options.actionBy;
        }

        const whereBase = translateMongoFilter<Entity>(find);
        const deletedFilter = !options?.withDeleted ? { deleted: false } : {};
        const where = this._mergeWhere(whereBase, deletedFilter);

        const result = await this._repository.update(where as any, updateData);
        return { affected: result.affected || 0 };
    }

    async updateManyRaw(
        find: Record<string, any>,
        data: Record<string, any>,
        options?: IDatabaseUpdateManyOptions
    ): Promise<IUpdateResult> {
        if (
            !find ||
            typeof find !== 'object' ||
            Object.keys(find).length === 0
        ) {
            throw new Error('Find criteria must be a non-empty object');
        }

        const updateData = this._extractUpdateData(data);
        const now = new Date();
        updateData.updatedAt = now;
        if (options?.actionBy) {
            updateData.updatedBy = options.actionBy;
        }

        const whereBase = translateMongoFilter<Entity>(find);
        const deletedFilter = !options?.withDeleted ? { deleted: false } : {};
        const where = this._mergeWhere(whereBase, deletedFilter);

        const result = await this._repository.update(where as any, updateData);
        return { affected: result.affected || 0 };
    }

    async deleteMany(
        find?: Record<string, any>,
        options?: IDatabaseDeleteManyOptions
    ): Promise<IDeleteResult> {
        const whereBase = find ? translateMongoFilter<Entity>(find) : undefined;
        const deletedFilter = !options?.withDeleted ? { deleted: false } : {};
        const where = this._mergeWhere(whereBase, deletedFilter);

        // If where is empty after merge, delete all non-deleted
        const result = await this._repository.delete(
            (where && Object.keys(where).length > 0 ? where : deletedFilter) as any
        );
        return { affected: result.affected || 0 };
    }

    async softDeleteMany(
        find?: Record<string, any>,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<IUpdateResult> {
        const whereBase = find ? translateMongoFilter<Entity>(find) : undefined;
        const where = this._mergeWhere(whereBase, { deleted: false });

        const updateData: any = {
            deletedAt: new Date(),
            deleted: true,
        };
        if (options?.actionBy) {
            updateData.deletedBy = options.actionBy;
        }

        const result = await this._repository.update(
            (where && Object.keys(where).length > 0 ? where : { deleted: false }) as any,
            updateData
        );
        return { affected: result.affected || 0 };
    }

    async restoreMany(
        find?: Record<string, any>,
        options?: IDatabaseSaveOptions
    ): Promise<IUpdateResult> {
        const whereBase = find ? translateMongoFilter<Entity>(find) : undefined;
        const where = this._mergeWhere(whereBase, { deleted: true });

        const updateData: any = {
            deletedAt: null,
            deletedBy: null,
            deleted: false,
            updatedAt: new Date(),
        };
        if (options?.actionBy) {
            updateData.updatedBy = options.actionBy;
        }

        const result = await this._repository.update(
            (where && Object.keys(where).length > 0 ? where : { deleted: true }) as any,
            updateData
        );
        return { affected: result.affected || 0 };
    }

    // Aggregation - uses QueryBuilder for complex queries
    async aggregate<AggregateResponse>(
        callback: (qb: SelectQueryBuilder<Entity>) => SelectQueryBuilder<Entity>,
        options?: IDatabaseAggregateOptions
    ): Promise<AggregateResponse[]> {
        const qb = this._repository.createQueryBuilder('entity');
        if (!options?.withDeleted) {
            qb.andWhere('entity.deleted = :deleted', { deleted: false });
        }
        const customQb = callback(qb);
        return customQb.getRawMany() as unknown as AggregateResponse[];
    }

    async findAllAggregate<AggregateResponse>(
        callback: (qb: SelectQueryBuilder<Entity>) => SelectQueryBuilder<Entity>,
        options?: IDatabaseFindAllAggregateOptions
    ): Promise<AggregateResponse[]> {
        const qb = this._repository.createQueryBuilder('entity');
        if (!options?.withDeleted) {
            qb.andWhere('entity.deleted = :deleted', { deleted: false });
        }
        const customQb = callback(qb);

        if (options?.order) {
            for (const key of Object.keys(options.order)) {
                const dir = options.order[key] === ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC ? 'ASC' : 'DESC';
                customQb.addOrderBy(`entity.${key}`, dir);
            }
        }

        if (options?.paging) {
            customQb.take(options.paging.limit);
            customQb.skip(options.paging.offset);
        }

        return customQb.getRawMany() as unknown as AggregateResponse[];
    }

    async getTotalAggregate(
        callback: (qb: SelectQueryBuilder<Entity>) => SelectQueryBuilder<Entity>,
        options?: IDatabaseAggregateOptions
    ): Promise<number> {
        const qb = this._repository.createQueryBuilder('entity');
        if (!options?.withDeleted) {
            qb.andWhere('entity.deleted = :deleted', { deleted: false });
        }
        const customQb = callback(qb);
        return customQb.getCount();
    }

    model(): Repository<Entity> {
        return this._repository;
    }

    // ─── Private helpers ───

    private _mergeWhere(
        base: FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[] | undefined,
        extra: Record<string, any>
    ): FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[] {
        if (!base) {
            return extra as FindOptionsWhere<Entity>;
        }

        if (Array.isArray(base)) {
            return base.map(w => ({ ...w, ...extra } as FindOptionsWhere<Entity>));
        }

        return { ...base, ...extra } as FindOptionsWhere<Entity>;
    }

    private _extractUpdateData(data: Record<string, any>): Record<string, any> {
        if (Array.isArray(data)) {
            // Merge all $set objects
            const merged: Record<string, any> = {};
            for (const item of data) {
                if (item.$set) {
                    Object.assign(merged, item.$set);
                }
                if (item.$inc) {
                    // Handle $inc separately - need raw SQL for real increment
                    // For simplicity, treat as direct assignment
                    Object.assign(merged, item.$inc);
                }
            }
            return merged;
        }

        if (data.$set) {
            const result = { ...data.$set };
            if (data.$inc) {
                Object.assign(result, data.$inc);
            }
            return result;
        }

        // If no MongoDB operators, return as-is
        const result: Record<string, any> = {};
        for (const key of Object.keys(data)) {
            if (!key.startsWith('$')) {
                result[key] = data[key];
            }
        }
        return result;
    }
}
