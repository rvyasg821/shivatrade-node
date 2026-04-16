import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    HttpStatus,
    HttpCode,
    UploadedFile,
    BadRequestException,
    ForbiddenException,
    Res,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { ToolAccessGuard } from '@modules/subscription/guards/tool-access.guard';
import { RequireToolAccess } from '@modules/subscription/decorators/tool-access.decorator';
import { FileUploadSingle } from '@common/file/decorators/file.decorator';
import * as path from 'path';
import * as fs from 'fs';

import { DocumentService } from '../services/document.service';
import { DocumentCategoryService } from '../services/document-category.service';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';

import { DocumentCategoryCreateRequestDto } from '../dtos/request/document-category.create.request.dto';
import { DocumentCategoryUpdateRequestDto } from '../dtos/request/document-category.update.request.dto';
import { DocumentUpdateRequestDto } from '../dtos/request/document.update.request.dto';
import { ENUM_DOCUMENT_STATUS, ENUM_DOCUMENT_APPROVAL_STATUS } from '../enums/document.enum';
import { Logger } from '@nestjs/common';

const ROLE_LOCATION_ADMIN = 'Location Admin';
const ROLE_EMPLOYEE = 'Employee';

@ApiTags('admin.document')
@UseGuards(ToolAccessGuard)
@RequireToolAccess(['hrm-documents'])
@Controller({
    version: '1',
    path: '/document',
})
export class DocumentAdminController {
    private readonly logger = new Logger(DocumentAdminController.name);

    constructor(
        private readonly documentService: DocumentService,
        private readonly categoryService: DocumentCategoryService,
        private readonly userRepository: UserRepository
    ) {}

    // ============ CATEGORY ENDPOINTS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/category/create')
    async createCategory(
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: DocumentCategoryCreateRequestDto
    ) {
        const item = await this.categoryService.create(companyId, body);
        return { statusCode: 200, message: 'Category created', data: this.categoryService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/category/list')
    async listCategories(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('_search') search?: string,
        @Query('_limit') limit?: string,
        @Query('_offset') offset?: string
    ) {
        const perPage = parseInt(limit || '100', 10);
        const skip = parseInt(offset || '0', 10);
        const find: any = { soft_delete: false, is_active: true };
        if (search) find.name = { $regex: search, $options: 'i' };

        const [items, total] = await Promise.all([
            this.categoryService.findAllAdmin(find, perPage, skip),
            this.categoryService.getTotal(find),
        ]);

        // Include system + company categories
        const filtered = items.filter(
            (c) => !c.company_id || c.company_id === companyId
        );

        return {
            statusCode: 200,
            message: 'Category list',
            data: filtered.map((c) => this.categoryService.mapGet(c)),
            _metadata: { pagination: { total: filtered.length } },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/category/update/:categoryId')
    async updateCategory(
        @Param('categoryId') categoryId: string,
        @Body() body: DocumentCategoryUpdateRequestDto
    ) {
        const item = await this.categoryService.update(categoryId, body);
        return { statusCode: 200, message: 'Category updated', data: this.categoryService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/category/delete/:categoryId')
    async deleteCategory(@Param('categoryId') categoryId: string) {
        await this.categoryService.softDelete(categoryId);
        return { statusCode: 200, message: 'Category deleted' };
    }

    // ============ DOCUMENT ENDPOINTS ============

    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
                title: { type: 'string' },
                description: { type: 'string' },
                category_id: { type: 'string' },
                user_id: { type: 'string' },
                location_id: { type: 'string' },
                expiry_date: { type: 'string' },
            },
        },
    })
    @FileUploadSingle({ field: 'file', fileSize: 20 * 1024 * 1024 }) // 20MB limit for documents
    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/upload')
    async upload(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @UploadedFile() file: Express.Multer.File,
        @Body('title') title: string,
        @Body('description') description: string,
        @Body('category_id') category_id: string,
        @Body('user_id') user_id: string,
        @Body('location_id') location_id: string,
        @Body('expiry_date') expiry_date: string,
        @Body('approved_status') approved_status_input: string
    ) {
        this.logger.log(`[Upload] Start - user: ${userId}, role: ${roleName}, company: ${companyId}, file: ${file?.originalname}, size: ${file?.size}`);

        if (!file) throw new BadRequestException('No file provided');
        if (!title) throw new BadRequestException('Title is required');
        if (!category_id) throw new BadRequestException('Category is required');

        // Role-based enforcement
        let effectiveUserId = user_id || null;
        let effectiveLocationId = location_id || null;

        if (roleName === ROLE_EMPLOYEE) {
            effectiveUserId = userId;
            effectiveLocationId = jwtLocationId || null;
        } else if (roleName === ROLE_LOCATION_ADMIN) {
            // Use selected location from form, fallback to JWT primary
            effectiveLocationId = location_id || jwtLocationId;
        }

        // Determine approval status based on role
        let approvedStatus = ENUM_DOCUMENT_APPROVAL_STATUS.APPROVED;
        let approvedBy: string | null = userId;
        let approvedAt: Date | null = new Date();

        if (roleName === ROLE_EMPLOYEE) {
            // Employee uploads are always pending
            approvedStatus = ENUM_DOCUMENT_APPROVAL_STATUS.PENDING;
            approvedBy = null;
            approvedAt = null;
        } else if (approved_status_input === ENUM_DOCUMENT_APPROVAL_STATUS.PENDING) {
            // Admin explicitly chose pending
            approvedStatus = ENUM_DOCUMENT_APPROVAL_STATUS.PENDING;
            approvedBy = null;
            approvedAt = null;
        }

        try {
            const doc = await this.documentService.create(
                companyId,
                userId,
                file,
                {
                    title,
                    description: description || '',
                    category_id,
                    user_id: effectiveUserId,
                    location_id: effectiveLocationId,
                    expiry_date: expiry_date || null,
                    approved_status: approvedStatus,
                    approved_by: approvedBy,
                    approved_at: approvedAt,
                }
            );

            this.logger.log(`[Upload] Success - docId: ${doc._id}, path: ${doc.file_path}`);

            return {
                statusCode: 200,
                message: 'Document uploaded successfully',
                data: this.documentService.mapGet(doc, null),
            };
        } catch (err) {
            this.logger.error(`[Upload] Failed - ${err.message}`, err.stack);
            throw err;
        }
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @Query('_search') search?: string,
        @Query('_limit') limit?: string,
        @Query('_offset') offset?: string,
        @Query('_sort') sort?: string,
        @Query('_order') order?: string,
        @Query('category_id') category_id?: string,
        @Query('user_id') user_id?: string,
        @Query('location_id') location_id?: string,
        @Query('status') status?: string,
        @Query('approved_status') approved_status?: string,
        @Query('expiring_days') expiring_days?: string
    ) {
        const perPage = parseInt(limit || '20', 10);
        const skip = parseInt(offset || '0', 10);

        const find: any = { company_id: companyId, soft_delete: false };
        if (category_id) find.category_id = category_id;
        if (status) find.status = status;
        if (approved_status) find.approved_status = approved_status;

        // Role-based scope enforcement
        if (roleName === ROLE_EMPLOYEE) {
            // Employees see only their own documents
            find.user_id = userId;
        } else if (roleName === ROLE_LOCATION_ADMIN) {
            // Location admins see documents in their selected/assigned location
            find.location_id = location_id || jwtLocationId;
            if (user_id) find.user_id = user_id;
        } else {
            // Company Admin / Super Admin — filter by requested params
            if (user_id) find.user_id = user_id;
            const effectiveLocationId = location_id || null;

            const orConditions: any[] = [];
            if (effectiveLocationId && search) {
                orConditions.push(
                    { location_id: effectiveLocationId, title: { $regex: search, $options: 'i' } },
                    { location_id: null, title: { $regex: search, $options: 'i' } },
                );
            } else if (effectiveLocationId) {
                orConditions.push(
                    { location_id: effectiveLocationId },
                    { location_id: null },
                );
            } else if (search) {
                orConditions.push({ title: { $regex: search, $options: 'i' } });
            }
            if (orConditions.length > 0) {
                find.$or = orConditions;
            }
        }

        // For Location Admin + Employee: apply search without location $or
        if (roleName !== 'Company Admin' && roleName !== 'Admin' && search) {
            find.title = { $regex: search, $options: 'i' };
        }

        // Expiring soon filter
        if (expiring_days) {
            const days = parseInt(expiring_days, 10);
            const future = new Date();
            future.setDate(future.getDate() + days);
            const today = new Date().toISOString().split('T')[0];
            const futureStr = future.toISOString().split('T')[0];
            find.expiry_date = { $gte: today, $lte: futureStr };
            find.is_expired = false;
        }

        const [items, total] = await Promise.all([
            this.documentService.findAll(find, perPage, skip, sort || '_id', (order === 'asc' ? 'asc' : 'desc') as any),
            this.documentService.getTotal(find),
        ]);

        // Batch-fetch employee names/emails for display
        const userIds = [...new Set(items.map((d) => d.user_id).filter(Boolean))];
        const userMap: Record<string, { name: string; email: string }> = {};
        if (userIds.length > 0) {
            const users = await this.userRepository.findAll(
                { _id: userIds },
                { paging: { limit: userIds.length, offset: 0 } }
            ) as any[];
            for (const u of users) {
                const first = (u as any).first_name || (u as any).firstName || '';
                const last = (u as any).last_name || (u as any).lastName || '';
                userMap[u._id] = { name: `${first} ${last}`.trim() || u.email, email: u.email || '' };
            }
        }

        return {
            statusCode: 200,
            message: 'Document list',
            data: items.map((d) => ({
                ...this.documentService.mapList(d),
                employee: d.user_id && userMap[d.user_id]
                    ? { name: userMap[d.user_id].name, email: userMap[d.user_id].email }
                    : null,
            })),
            _metadata: { pagination: { total } },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/get/:documentId')
    async get(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @Param('documentId') documentId: string
    ) {
        const doc = await this.documentService.findOneById(documentId);

        // Role-based access check
        if (roleName === ROLE_EMPLOYEE && doc.user_id !== userId) {
            throw new ForbiddenException('Access denied');
        }
        if (roleName === ROLE_LOCATION_ADMIN && doc.location_id && doc.location_id !== jwtLocationId) {
            throw new ForbiddenException('Access denied');
        }

        return {
            statusCode: 200,
            message: 'Document details',
            data: this.documentService.mapGet(doc, null),
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/update/:documentId')
    async update(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @Param('documentId') documentId: string,
        @Body() body: DocumentUpdateRequestDto
    ) {
        const doc = await this.documentService.findOneById(documentId);

        // Role-based access check
        if (roleName === ROLE_EMPLOYEE && doc.user_id !== userId) {
            throw new ForbiddenException('Access denied');
        }
        if (roleName === ROLE_LOCATION_ADMIN && doc.location_id && doc.location_id !== jwtLocationId) {
            throw new ForbiddenException('Access denied');
        }

        // Location Admin cannot reassign to a different location
        if (roleName === ROLE_LOCATION_ADMIN && body.location_id && body.location_id !== jwtLocationId) {
            body.location_id = jwtLocationId;
        }

        // Handle approval status changes
        if (body.approved_status && body.approved_status !== doc.approved_status) {
            if (roleName === ROLE_EMPLOYEE) {
                delete body.approved_status;
                delete body.approval_note;
            } else {
                (body as any).approved_by = userId;
                (body as any).approved_at = new Date();
            }
        }

        const updated = await this.documentService.update(documentId, body);
        return {
            statusCode: 200,
            message: 'Document updated',
            data: this.documentService.mapList(updated),
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/delete/:documentId')
    async delete(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @Param('documentId') documentId: string
    ) {
        const doc = await this.documentService.findOneById(documentId);

        if (roleName === ROLE_EMPLOYEE) {
            // Employees can only delete their own pending/rejected documents
            if (doc.user_id !== userId) {
                throw new ForbiddenException('Access denied');
            }
            if (doc.approved_status === ENUM_DOCUMENT_APPROVAL_STATUS.APPROVED) {
                throw new ForbiddenException('Approved documents cannot be deleted by employees');
            }
        }

        if (roleName === ROLE_LOCATION_ADMIN && doc.location_id && doc.location_id !== jwtLocationId) {
            throw new ForbiddenException('Access denied');
        }

        await this.documentService.softDelete(documentId);
        return { statusCode: 200, message: 'Document deleted' };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/approve/:documentId')
    async approve(
        @AuthJwtPayload('user') adminId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @Param('documentId') documentId: string,
        @Body('approval_note') approvalNote?: string
    ) {
        if (roleName === ROLE_EMPLOYEE) {
            throw new ForbiddenException('Employees cannot approve documents');
        }

        const doc = await this.documentService.findOneById(documentId);

        if (roleName === ROLE_LOCATION_ADMIN && doc.location_id && doc.location_id !== jwtLocationId) {
            throw new ForbiddenException('Access denied');
        }

        const updated = await this.documentService.update(documentId, {
            approved_status: ENUM_DOCUMENT_APPROVAL_STATUS.APPROVED,
            approved_by: adminId,
            approved_at: new Date(),
            approval_note: approvalNote || null,
        } as any);

        return { statusCode: 200, message: 'Document approved', data: this.documentService.mapList(updated) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/reject/:documentId')
    async reject(
        @AuthJwtPayload('user') adminId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @Param('documentId') documentId: string,
        @Body('approval_note') approvalNote?: string
    ) {
        if (roleName === ROLE_EMPLOYEE) {
            throw new ForbiddenException('Employees cannot reject documents');
        }

        const doc = await this.documentService.findOneById(documentId);

        if (roleName === ROLE_LOCATION_ADMIN && doc.location_id && doc.location_id !== jwtLocationId) {
            throw new ForbiddenException('Access denied');
        }

        const updated = await this.documentService.update(documentId, {
            approved_status: ENUM_DOCUMENT_APPROVAL_STATUS.REJECTED,
            approved_by: adminId,
            approved_at: new Date(),
            approval_note: approvalNote || null,
        } as any);

        return { statusCode: 200, message: 'Document rejected', data: this.documentService.mapList(updated) };
    }

    @AuthJwtAccessProtected()
    @Get('/download/:documentId')
    async download(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @Param('documentId') documentId: string,
        @Res() res: Response
    ) {
        const doc = await this.documentService.findOneById(documentId);

        // Role-based access check
        if (roleName === ROLE_EMPLOYEE && doc.user_id !== userId) {
            res.status(403).json({ message: 'Access denied' });
            return;
        }
        if (roleName === ROLE_LOCATION_ADMIN && doc.location_id && doc.location_id !== jwtLocationId) {
            res.status(403).json({ message: 'Access denied' });
            return;
        }

        const relativePath = doc.file_path.replace('/assets/', 'public/');
        const fullPath = path.resolve(process.cwd(), relativePath);

        this.logger.log(`[Download] docId: ${documentId}, file_path: ${doc.file_path}, resolved: ${fullPath}, cwd: ${process.cwd()}`);

        if (!fs.existsSync(fullPath)) {
            this.logger.error(`[Download] File not found on disk: ${fullPath}`);
            res.status(404).json({ message: 'File not found on disk' });
            return;
        }

        res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        const stream = fs.createReadStream(fullPath);
        stream.pipe(res);
    }
}
