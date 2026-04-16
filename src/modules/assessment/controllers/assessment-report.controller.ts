import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    UseGuards,
    NotFoundException,
    InternalServerErrorException,
    BadRequestException,
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AssessmentReportService } from '@modules/assessment/services/assessment-report.service';
import { AssessmentReportCreateDto } from '@modules/assessment/dtos/assessment-report.create.dto';
import { AssessmentReportUpdateDto } from '@modules/assessment/dtos/assessment-report.update.dto';
import {
    AssessmentReportAdminCreateDoc,
    AssessmentReportAdminDeleteDoc,
    AssessmentReportAdminGetDoc,
    AssessmentReportAdminListDoc,
    AssessmentReportAdminUpdateDoc,
    AssessmentReportAdminGeneratePdfDoc,
    AssessmentReportAdminGetAuthDoc,
} from '../docs/assessment.admin.doc';
import { Permission } from '@modules/role/decorators/permission.decorator';
import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { PermissionGuard } from '@modules/role/guards/permission.guard';
import { PaginationService } from '@common/pagination/services/pagination.service';
import {
    Response,
    ResponsePaging,
} from '@common/response/decorators/response.decorator';
import {
    IResponse,
    IResponsePaging,
} from '@common/response/interfaces/response.interface';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';
import {
    PaginationQuery,
    PaginationQueryFilterInEnum,
} from '@common/pagination/decorators/pagination.decorator';
import {
    ASSESSMENT_REPORT_DEFAULT_AVAILABLE_SEARCH,
    ASSESSMENT_REPORT_DEFAULT_STATUS,
} from '@modules/assessment/constants/assessment.list.constant';
import {
    ENUM_ASSESSMENT_REPORT_STATUS,
    ENUM_ASSESSMENT_STATUS,
} from '@modules/assessment/enums/assessment.enum';
import { RequestRequiredPipe } from '@common/request/pipes/request.required.pipe';
import { ENUM_APP_STATUS_CODE_ERROR } from '@app/enums/app.status-code.enum';
import { AssessmentService } from '../services/assessment.service';
import { VerifyAssessmentReportDto } from '@modules/assessment/dtos/verify-assessment-report.dto';
import { SectionService } from '../services/section.service';
import { PdfGeneratorService } from '../services/pdf-generator.service';
import { QuestionService } from '../services/question.service';
import { IUnifiedAuthJwtAccessTokenPayload } from '@modules/auth/interfaces/auth.unified.interface';
import { EnhancedEmailService } from '@modules/email/services/enhanced-email.service';

import { ApiResponse } from '@nestjs/swagger';
import { RequestPDFAssessmentReportDto } from '../dtos/assessment.pdf_request.dto';
import path from 'path';

@ApiTags('modules.admin.assessment_reports')
@Controller({
    version: '1',
    path: '/assessment_reports',
})
export class AssessmentReportController {
    constructor(
        private readonly assessmentService: AssessmentService,
        private readonly sectionService: SectionService,
        private readonly assessmentReportService: AssessmentReportService,
        private readonly paginationService: PaginationService,
        private readonly pdfGeneratorService: PdfGeneratorService,
        private readonly questionService: QuestionService,
        private readonly emailService: EnhancedEmailService,) { }

    @Post('/create')
    @AssessmentReportAdminCreateDoc()
    @Response('assessmentReport.create')
    // @Permission('assessment', 'can_create')
    // @UseGuards(PermissionGuard)
    // @AuthJwtAccessProtected()
    @ApiQuery({
        name: 'tenant_id',
        required: false,
    })
    async create(
        @Body() createDto: AssessmentReportCreateDto,
        @Query('tenant_id') tenantId?: string
    ): Promise<IResponse<any>> {
        try {
            const data: any = { ...createDto };
            data['group_data'] = [];

            if (tenantId) {
                // Tenant connection removed - using central database only                // Generate verification code
                data.email_code =
                    this.assessmentReportService.generateVerificationCode();

                if (data.assessment_id) {
                    const assessment =
                        await this.assessmentService.findOneById(
                            data.assessment_id
                        );
                    if (!assessment) {
                        throw new NotFoundException({
                            statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                            message: 'assessment.error.notFound',
                        });
                    }
                    data.assessment_id = data?.assessment_id?.toString();
                    data.assessment_data = assessment;
                }

                // Get sections for group_data
                try {
                    const sectionDocs = await this.sectionService.findAll({
                        assessment_id: data.assessment_id,
                    });
                    if (sectionDocs.length) {
                        for (const section of sectionDocs) {
                            const sectionData = section;
                            data.group_data.push(sectionData);
                        }
                    }
                } catch (error) {
                    console.error('Error fetching sections:', error);
                }

                // Create the assessment report
                const created =
                    await this.assessmentReportService.create(data);

                // Send verification email
                try {
                    await this.emailService.sendAssessmentVerification(
                        { email: data.email, name: data.name },
                        { otp: data.email_code }
                    );
                } catch (error) { }

                return { data: created };
            }

            // Use default services for master database
            // Generate verification code
            data.email_code =
                this.assessmentReportService.generateVerificationCode();

            if (data.assessment_id) {
                const assessment = await this.assessmentService.findOneById(
                    data.assessment_id
                );
                if (!assessment) {
                    throw new NotFoundException({
                        statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                        message: 'assessment.error.notFound',
                    });
                }
                data.assessment_id = data?.assessment_id?.toString();
                data.assessment_data = assessment;
            }

            // Get sections for group_data
            try {
                const sectionDocs = await this.sectionService.findAll({
                    assessment_id: data.assessment_id,
                });
                if (sectionDocs.length) {
                    for (const section of sectionDocs) {
                        const sectionData = section;
                        data.group_data.push(sectionData);
                    }
                }
            } catch (error) {
                console.error('Error fetching sections:', error);
            }

            // Create the assessment report
            const created = await this.assessmentReportService.create(data);

            // Send verification email
            try {
                await this.emailService.sendAssessmentVerification(
                    { email: data.email, name: data.name },
                    { otp: data.email_code }
                );
            } catch (error) { }
            // // Generate PDF in background (don't wait for it)
            // this.generatePdfAsync(created._id.toString(), data.assessment_id.toString())
            //     .catch(error => {
            //         console.error('Error generating PDF:', error);
            //     });

            return { data: created };
        } catch (err: unknown) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    private async generatePdfAsync(
        reportId: string,
        assessmentId: string
    ): Promise<void> {
        try {
            // Get questions with answers for PDF
            const assessmentData =
                await this.questionService.getGroupedQuestionsByAssessment(
                    assessmentId
                );

            // Get report details for user info
            const report =
                await this.assessmentReportService.findOneById(reportId);
            const userDetails = {
                name: report.name,
                first_name: report.first_name,
                last_name: report.last_name,
                company_name: report.company_name,
                email: report.email,
                mobile: report.mobile,
                business_type: report.business_type,
                team_size: report.team_size,
                operation_description: report.operation_description,
                total: report.total,
                pass: report.pass,
                fail: report.fail,
                score: report.score,
            };

            // Generate PDF
            const pdfPath = await this.pdfGeneratorService.generatePdf(
                reportId,
                assessmentData,
                userDetails
            );

            // Update report with PDF path
            await this.assessmentReportService.update(report, {
                pdf_path: pdfPath,
            });

            console.log(`PDF generated successfully for report ${reportId}`);
        } catch (error) {
            console.error(
                `Failed to generate PDF for report ${reportId}:`,
                error
            );
        }
    }

    @Get('/list')
    @AssessmentReportAdminListDoc()
    @ResponsePaging('assessmentReport.list')
    // @Permission('assessment', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async findAll(
        @PaginationQuery({
            availableSearch: ASSESSMENT_REPORT_DEFAULT_AVAILABLE_SEARCH,
        })
        { _search, _limit, _offset, _order }: PaginationListDto,
        // @PaginationQueryFilterInEnum(
        //     'status',
        //     ASSESSMENT_REPORT_DEFAULT_STATUS,
        //     ENUM_ASSESSMENT_STATUS
        // )
        // status: Record<string, any>
        @Query('status') status: string,
        @AuthJwtPayload() payload: IUnifiedAuthJwtAccessTokenPayload
    ): Promise<IResponsePaging<any>> {
        const tenantId = payload.tenantId;
        let statusValue: number = 1;
        if (status === 'ACTIVE') {
            statusValue = ENUM_ASSESSMENT_REPORT_STATUS.COMPLETED;
        } else if (status === 'INACTIVE') {
            statusValue = ENUM_ASSESSMENT_REPORT_STATUS.PENDING;
        } else {
            status = null;
        }
        const find: Record<string, any> = {
            ..._search,
            ...(status !== null && status !== '' && status !== undefined
                ? { status: { $eq: statusValue } }
                : {}),
        };

        if (tenantId) {
            // Tenant connection removed - using central database only
            const assessmentReports = await this.assessmentReportService.findAll(find, {
                paging: {
                    limit: _limit,
                    offset: _offset,
                },
                order: _order,
            });

            const total: number = await this.assessmentReportService.getTotal(find);
            const totalPage: number = this.paginationService.totalPage(
                total,
                _limit
            );

            return {
                _pagination: { total, totalPage },
                data: assessmentReports,
            };
        }

        // Use default service for master database
        const assessmentReports = await this.assessmentReportService.findAll(
            find,
            {
                paging: {
                    limit: _limit,
                    offset: _offset,
                },
                order: _order,
            }
        );

        const total: number = await this.assessmentReportService.getTotal(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        return {
            _pagination: { total, totalPage },
            data: assessmentReports,
        };
    }

    @Get('/get/:id')
    @AssessmentReportAdminGetDoc()
    @Response('assessmentReport.get')
    // @Permission('assessment', 'can_read')
    // @UseGuards(PermissionGuard)
    // @AuthJwtAccessProtected()
    @ApiQuery({
        name: 'tenant_id',
        required: false,
    })
    async findOne(
        @Param('id', RequestRequiredPipe) id: string,
        // @AuthJwtPayload() payload: IUnifiedAuthJwtAccessTokenPayload,
        @Query('tenant_id') tenantId?: string
    ): Promise<IResponse<any>> {
        if (tenantId) {
            // Tenant connection removed - using central database only
            const assessmentReport = await this.assessmentReportService.findOneById(id);
            if (!assessmentReport) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'assessmentReport.error.notFound',
                });
            }
            return { data: assessmentReport };
        }

        // Use default service for master database
        const assessmentReport =
            await this.assessmentReportService.findOneById(id);
        if (!assessmentReport) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'assessmentReport.error.notFound',
            });
        }
        return { data: assessmentReport };
    }

    @Get('/get/report/:id')
    @AssessmentReportAdminGetAuthDoc()
    @Response('assessmentReport.get')
    @AuthJwtAccessProtected()
    async findOneForCompany(
        @Param('id', RequestRequiredPipe) id: string,
        @AuthJwtPayload() payload: IUnifiedAuthJwtAccessTokenPayload
    ): Promise<IResponse<any>> {
        const tenantId = payload.tenantId;
        if (tenantId) {
            // Tenant connection removed - using central database only
            const assessmentReport = await this.assessmentReportService.findOneById(id);
            if (!assessmentReport) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'assessmentReport.error.notFound',
                });
            }
            return { data: assessmentReport };
        }

        // Use default service for master database
        const assessmentReport =
            await this.assessmentReportService.findOneById(id);
        if (!assessmentReport) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'assessmentReport.error.notFound',
            });
        }
        return { data: assessmentReport };
    }

    @Put('/update/:id')
    @AssessmentReportAdminUpdateDoc()
    @Response('assessmentReport.update')
    // @Permission('assessment', 'can_update')
    // @UseGuards(PermissionGuard)
    // @AuthJwtAccessProtected()
    @ApiQuery({
        name: 'tenant_id',
        required: false,
    })
    async update(
        @Param('id', RequestRequiredPipe) id: string,
        @Body() updateDto: AssessmentReportUpdateDto,
        @Query('tenant_id') tenantId?: string
    ): Promise<IResponse<any>> {
        let assessmentReport;

        if (tenantId) {
            // Tenant connection removed - using central database only
            assessmentReport = await this.assessmentReportService.findOneById(id);
            if (!assessmentReport) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'assessmentReport.error.notFound',
                });
            }
            const data: any = { ...updateDto };
            let sendEmail = false;
            if (assessmentReport.email !== data.email) {
                // Generate verification code
                data.email_code =
                    this.assessmentReportService.generateVerificationCode();
                sendEmail = true;
            }
            if (data.assessment_id) {
                const assessment =
                    await this.assessmentService.findOneById(
                        data.assessment_id
                    );
                if (!assessment) {
                    throw new NotFoundException({
                        statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                        message: 'assessment.error.notFound',
                    });
                }
                data.assessment_id = data.assessment_id;
            }
            const updated = await this.assessmentReportService.update(
                assessmentReport,
                data
            );
            if (sendEmail) {
                // Send verification email
                try {
                    await this.emailService.sendAssessmentVerification(
                        {
                            email: updated.secondary_email,
                            name: updated.name,
                        },
                        { otp: updated.secondary_email_code }
                    );
                } catch (error) { }
            }
            return {
                data: updated,
                _metadata: {
                    otpModel: sendEmail,
                },
            };
        }

        // Use default services for master database
        assessmentReport = await this.assessmentReportService.findOneById(id);
        if (!assessmentReport) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'assessmentReport.error.notFound',
            });
        }
        const data: any = { ...updateDto };
        let sendEmail = false;
        if (assessmentReport.email !== data.email) {
            // Generate verification code
            data.email_code =
                this.assessmentReportService.generateVerificationCode();
            sendEmail = true;
        }

        if (data.assessment_id) {
            const assessment = await this.assessmentService.findOneById(
                data.assessment_id
            );
            if (!assessment) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'assessment.error.notFound',
                });
            }
            data.assessment_id = data.assessment_id;
        }
        const updated = await this.assessmentReportService.update(
            assessmentReport,
            data
        );
        if (sendEmail) {
            // Send verification email
            try {
                await this.emailService.sendAssessmentVerification(
                    { email: updated.secondary_email, name: updated.name },
                    { otp: updated.secondary_email_code }
                );
            } catch (error) { }
        }
        return {
            data: updated,
            _metadata: {
                otpModel: sendEmail,
            },
        };
    }

    @Delete('/delete/:id')
    @AssessmentReportAdminDeleteDoc()
    @Response('assessmentReport.delete')
    @Permission('assessment', 'can_delete')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async delete(
        @Param('id', RequestRequiredPipe) id: string,
        @AuthJwtPayload() payload: IUnifiedAuthJwtAccessTokenPayload
    ): Promise<void> {
        const tenantId = payload.tenantId;
        let assessmentReport;

        if (tenantId) {
            // Tenant connection removed - using central database only
            const assessmentReport = await this.assessmentReportService.findOneById(id);
            if (!assessmentReport) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'assessmentReport.error.notFound',
                });
            }

            await this.assessmentReportService.delete(assessmentReport);
            return;
        }



        // Use default service for master database
        assessmentReport = await this.assessmentReportService.findOneById(id);
        if (!assessmentReport) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'assessmentReport.error.notFound',
            });
        }
        await this.assessmentReportService.delete(assessmentReport);
    }

    @Post('/verify')
    @Response('assessmentReport.verify')
    @ApiQuery({ name: 'tenant_id', required: false })
    async verifyAssessmentReport(
        @Body() verifyDto: VerifyAssessmentReportDto,
        @Query('tenant_id') tenantId?: string
    ): Promise<IResponse<any>> {
        const { _id, email_code, mobile_code } = verifyDto;

        if (!_id) {
            throw new BadRequestException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'Id is required',
            });
        }

        if (tenantId) {
            // Tenant connection removed - using central database only
            const emailVerified =
                await this.assessmentReportService.verifyEmailCode(
                    _id,
                    email_code
                );

            if (!emailVerified) {
                throw new BadRequestException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'Email verification code not matched',
                });
            }

            // Update verification status
            const report =
                await this.assessmentReportService.findOneById(_id);
            await this.assessmentReportService.update(report, {
                email_verified: true,
            });

            return {
                data: { verified: true },
            };
        }

        const emailVerified =
            await this.assessmentReportService.verifyEmailCode(_id, email_code);

        if (!emailVerified) {
            throw new BadRequestException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'Email verification code not matched',
            });
        }

        // Update verification status
        const report = await this.assessmentReportService.findOneById(_id);
        await this.assessmentReportService.update(report, {
            email_verified: true,
        });

        return {
            data: { verified: true },
        };
    }

    @Get('/assessment-reports-questions')
    @Response('assessmentReport.get')
    @ApiQuery({ name: 'tenant_id', required: false })
    async GetAssessmentReport(
        @Query('assessment_id') assessment_id: string,
        @Query('asessment_report_id') asessment_report_id: string,
        @Query('tenant_id') tenantId?: string
    ): Promise<IResponse<any>> {
        if (tenantId) {
            // Tenant connection removed - using central database only
            const questionAsessmentId =
                await this.questionService.getSectionsWithQuestionsAndAnswers(
                    assessment_id,
                    asessment_report_id
                );

            return {
                data: questionAsessmentId,
            };
        }

        const questionAsessmentId =
            await this.questionService.getSectionsWithQuestionsAndAnswers(
                assessment_id,
                asessment_report_id
            );

        return {
            data: questionAsessmentId,
        };
    }

    @Post('/generate-pdf')
    @AssessmentReportAdminGeneratePdfDoc()
    @ApiQuery({ name: 'tenant_id', required: false })
    async generateAssessmentReportPdf(
        @Body() body: RequestPDFAssessmentReportDto,
        @Query('tenant_id') tenantId?: string
    ): Promise<IResponse<any>> {
        try {
            const { assessment_id, asessment_report_id } = body;

            let assessmentReportService = this.assessmentReportService;
            let questionService = this.questionService;

            // Handle tenant-specific services
            if (tenantId) {
                // Tenant connection removed - using central database only                // Get the assessment report
                const assessmentReport =
                    await this.assessmentReportService.findOneById(asessment_report_id);

                if (!assessmentReport) {
                    throw new NotFoundException({
                        statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                        message: 'assessmentReport.error.notFound',
                    });
                }

                // Check if PDF already exists
                const pdfExists =
                    await this.pdfGeneratorService.checkPdfExists(
                        asessment_report_id
                    );

                if (
                    assessmentReport?.pdf_path ||
                    assessmentReport?.pdf_path !== '' ||
                    pdfExists
                ) {
                    await this.pdfGeneratorService.deletePdf(asessment_report_id);
                }
                // Get data for PDF generation
                const data =
                    await this.questionService.getSectionsWithQuestionsAndAnswers(
                        assessment_id,
                        asessment_report_id
                    );

                // Prepare user details for PDF
                const userDetails = {
                    name: assessmentReport.name,
                    first_name: assessmentReport.first_name,
                    last_name: assessmentReport.last_name,
                    company_name: assessmentReport.company_name,
                    email: assessmentReport.email,
                    mobile: assessmentReport.mobile,
                    business_type: assessmentReport.business_type,
                    team_size: assessmentReport.team_size,
                    operation_description: assessmentReport.operation_description,
                    total: assessmentReport.total,
                    pass: assessmentReport.pass,
                    fail: assessmentReport.fail,
                    score: assessmentReport.score,
                };

                // Generate the PDF
                const pdfPath = await this.pdfGeneratorService.generatePdf(
                    asessment_report_id,
                    data?.sections,
                    userDetails
                );

                // Update the assessment report with the PDF path
                await this.assessmentReportService.update(assessmentReport, {
                    pdf_path: pdfPath,
                });

                return {
                    data: {
                        pdf_path: assessmentReport.pdf_path,
                    },
                };
            }
        } catch (error) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: error.message || 'Failed to generate PDF',
                _error: error,
            });
        }
    }

    @Post('/generate-pdf-email')
    @AssessmentReportAdminGeneratePdfDoc()
    @ApiQuery({ name: 'tenant_id', required: false })
    async generateAssessmentReportPdfAndSendEmail(
        @Body() body: RequestPDFAssessmentReportDto,
        @Query('tenant_id') tenantId?: string
    ): Promise<IResponse<any>> {
        try {
            const { assessment_id, asessment_report_id } = body;

            let assessmentReportService = this.assessmentReportService;
            let questionService = this.questionService;

            // Handle tenant-specific services
            if (tenantId) {
                // Tenant connection removed - using central database only                // Get the assessment report
                const assessmentReport =
                    await this.assessmentReportService.findOneById(asessment_report_id);

                if (!assessmentReport) {
                    throw new NotFoundException({
                        statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                        message: 'assessmentReport.error.notFound',
                    });
                }

                // Check if PDF already exists
                const pdfExists =
                    await this.pdfGeneratorService.checkPdfExists(
                        asessment_report_id
                    );

                if (
                    assessmentReport?.pdf_path ||
                    assessmentReport?.pdf_path !== '' ||
                    pdfExists
                ) {
                    await this.pdfGeneratorService.deletePdf(asessment_report_id);
                }
                // Get data for PDF generation
                const data =
                    await this.questionService.getSectionsWithQuestionsAndAnswers(
                        assessment_id,
                        asessment_report_id
                    );

                // Prepare user details for PDF
                const userDetails = {
                    name: assessmentReport.name,
                    first_name: assessmentReport.first_name,
                    last_name: assessmentReport.last_name,
                    company_name: assessmentReport.company_name,
                    email: assessmentReport.email,
                    mobile: assessmentReport.mobile,
                    business_type: assessmentReport.business_type,
                    team_size: assessmentReport.team_size,
                    operation_description: assessmentReport.operation_description,
                    total: assessmentReport.total,
                    pass: assessmentReport.pass,
                    fail: assessmentReport.fail,
                    score: assessmentReport.score,
                };

                // Generate the PDF
                const pdfPath = await this.pdfGeneratorService.generatePdf(
                    asessment_report_id,
                    data?.sections,
                    userDetails
                );

                // Update the assessment report with the PDF path
                await this.assessmentReportService.update(assessmentReport, {
                    pdf_path: pdfPath,
                });

                if (assessmentReport?.email) {
                    try {
                        const to = assessmentReport.email;
                        const name = assessmentReport.name;
                        const subject = 'Assessment Report';
                        const templateFile = 'assessment_attachment.hjs';
                        const templateData = {
                            name,
                        };
                        const filePath = path.join(
                            process.cwd(),
                            'public',
                            assessmentReport.pdf_path
                        );
                        await this.emailService.sendEmailWithProvider(
                            to,
                            name,
                            subject,
                            templateFile,
                            templateData,
                            [],
                            filePath
                        );
                        return {
                            data: {
                                email_sent: true,
                            },
                        };
                    } catch (error) { }
                }

                return {
                    data: {
                        email_sent: false,
                    },
                };
            }
        } catch (error) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: error.message || 'Failed to generate PDF',
                _error: error,
            });
        }
    }
}
