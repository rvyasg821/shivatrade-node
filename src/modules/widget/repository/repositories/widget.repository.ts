import { Injectable } from '@nestjs/common';
import { Repository, In, Not } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { WidgetDoc, WidgetEntity } from '../entities/widget.entity';
import { IWidgetBulkUpdate } from '../../interfaces/widget.interface';

@Injectable()
export class WidgetRepository extends DatabaseObjectIdRepositoryBase<
    WidgetEntity
> {
    constructor(
        @InjectDatabaseModel(WidgetEntity)
        private readonly widgetRepository: Repository<WidgetEntity>
    ) {
        super(widgetRepository);
    }

    async findByUserId(userId: string): Promise<WidgetDoc[]> {
        return this._repository.find({
            where: {
                user_id: userId,
                soft_delete: false,
            } as any,
            select: {
                _id: true,
                user_id: true,
                slug: true,
                order: true,
                is_visible: true,
                tool_slug: true,
                status: true,
                soft_delete: true,
                createdAt: true,
                updatedAt: true,
            } as any,
            order: { order: 'ASC' } as any,
        }) as unknown as WidgetDoc[];
    }

    async findByUserIdAndToolSlug(userId: string, toolSlug: string): Promise<WidgetDoc[]> {
        return this._repository.find({
            where: {
                user_id: userId,
                tool_slug: toolSlug,
                soft_delete: false,
            } as any,
            select: {
                _id: true,
                user_id: true,
                slug: true,
                order: true,
                is_visible: true,
                tool_slug: true,
                status: true,
                soft_delete: true,
                createdAt: true,
                updatedAt: true,
            } as any,
            order: { order: 'ASC' } as any,
        }) as unknown as WidgetDoc[];
    }

    async findAllInvisibleWidgetsByUserId(userId: string): Promise<WidgetDoc[]> {
        return this._repository.find({
            where: {
                user_id: userId,
                is_visible: false,
                soft_delete: false,
            } as any,
            select: {
                _id: true,
                user_id: true,
                slug: true,
                order: true,
                is_visible: true,
                tool_slug: true,
                status: true,
                soft_delete: true,
                createdAt: true,
                updatedAt: true,
            } as any,
            order: { order: 'ASC' } as any,
        }) as unknown as WidgetDoc[];
    }

    async findByUserIdAndSlugs(userId: string, slugs: string[]): Promise<WidgetDoc[]> {
        return this._repository.find({
            where: {
                user_id: userId,
                slug: In(slugs),
                soft_delete: false,
            } as any,
            order: { order: 'ASC' } as any,
        }) as unknown as WidgetDoc[];
    }

    async bulkUpdateWidgets(widgets: IWidgetBulkUpdate[]): Promise<void> {
        for (const widget of widgets) {
            await this._repository.update(
                { _id: widget._id } as any,
                {
                    order: widget.order,
                    is_visible: widget.is_visible,
                    updatedAt: new Date(),
                } as any
            );
        }
    }

    async softDeleteByUserIdAndToolSlug(userId: string, toolSlug: string): Promise<void> {
        await this._repository.update(
            { user_id: userId, tool_slug: toolSlug } as any,
            { soft_delete: true, updatedAt: new Date() } as any
        );
    }

    async createDefaultWidgets(widgets: Partial<WidgetEntity>[]): Promise<WidgetDoc[]> {
        const createdWidgets: WidgetDoc[] = [];
        for (const widget of widgets) {
            const entity = this._repository.create(widget as any);
            const saved = await this._repository.save(entity);
            createdWidgets.push(saved as unknown as WidgetDoc);
        }
        return createdWidgets;
    }

    async findExistingWidgetsByUserIdAndSlugs(userId: string, slugs: string[]): Promise<WidgetDoc[]> {
        return this._repository.find({
            where: {
                user_id: userId,
                slug: In(slugs),
            } as any,
            select: {
                _id: true,
                user_id: true,
                slug: true,
                tool_slug: true,
                soft_delete: true,
            } as any,
        }) as unknown as WidgetDoc[];
    }

    async countWidgetsByUserId(userId: string): Promise<number> {
        return this._repository.count({
            where: {
                user_id: userId,
                soft_delete: false,
            } as any,
        });
    }

    async findWidgetsByUserIdPaginated(
        userId: string,
        limit: number,
        offset: number
    ): Promise<WidgetDoc[]> {
        return this._repository.find({
            where: {
                user_id: userId,
                soft_delete: false,
            } as any,
            order: { order: 'ASC' } as any,
            take: limit,
            skip: offset,
        }) as unknown as WidgetDoc[];
    }

    async findOneById<T = WidgetDoc>(widgetId: string): Promise<T> {
        return this._repository.findOne({
            where: {
                _id: widgetId,
                soft_delete: false,
            } as any,
        }) as unknown as T;
    }

    async findOneByIdIncludeDeleted(widgetId: string): Promise<WidgetDoc | null> {
        return this._repository.findOne({
            where: { _id: widgetId } as any,
        }) as unknown as WidgetDoc | null;
    }

    async softDeleteById(tenantId: string, widgetId: string): Promise<void> {
        await this._repository.update(
            { _id: widgetId } as any,
            {
                soft_delete: true,
                updatedAt: new Date(),
            } as any
        );
    }

    async restoreById(tenantId: string, widgetId: string): Promise<void> {
        await this._repository.update(
            { _id: widgetId } as any,
            {
                soft_delete: false,
                updatedAt: new Date(),
            } as any
        );
    }

    async updateSingleWidget(tenantId: string, widgetId: string, updateData: any): Promise<void> {
        await this._repository.update(
            { _id: widgetId } as any,
            {
                ...updateData,
                updatedAt: new Date(),
            }
        );
    }

    async findByTenantAndFilters(
        tenantId: string,
        filters: Record<string, any> = {}
    ): Promise<WidgetDoc[]> {
        return this._repository.find({
            where: {
                ...filters,
                soft_delete: false,
            } as any,
            order: { order: 'ASC' } as any,
        }) as unknown as WidgetDoc[];
    }

    async findAll<T = WidgetDoc>(find?: Record<string, any>, options?: any): Promise<T[]> {
        return super.findAll<T>(find, options);
    }

    async getTotalByTenantAndFilters(
        tenantId: string,
        filters: Record<string, any> = {}
    ): Promise<number> {
        return this._repository.count({
            where: {
                ...filters,
                soft_delete: false,
            } as any,
        });
    }

    async softDelete(doc: WidgetEntity): Promise<WidgetDoc> {
        (doc as any).soft_delete = true;
        (doc as any).updatedAt = new Date();
        return this._repository.save(doc) as unknown as WidgetDoc;
    }

    async restore(doc: WidgetEntity): Promise<WidgetDoc> {
        (doc as any).soft_delete = false;
        (doc as any).updatedAt = new Date();
        return this._repository.save(doc) as unknown as WidgetDoc;
    }
}
