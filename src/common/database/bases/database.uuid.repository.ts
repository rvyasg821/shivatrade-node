// UUID repository is now identical to ObjectId repository since both use UUID in PostgreSQL
export {
    DatabaseObjectIdRepositoryBase as DatabaseUUIDRepositoryBase,
    IDatabaseDocument,
    IInsertManyResult,
    IUpdateResult,
    IDeleteResult,
} from './database.object-id.repository';
