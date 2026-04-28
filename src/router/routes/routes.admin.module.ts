import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { ActivityModule } from 'src/modules/activity/activity.module';
import { ActivityAdminController } from 'src/modules/activity/controllers/activity.admin.controller';

import { AuthModule } from 'src/modules/auth/auth.module';
import { AuthAdminController } from 'src/modules/auth/controllers/auth.admin.controller';
import { EmailModule } from 'src/modules/email/email.module';
import { PasswordHistoryAdminController } from 'src/modules/password-history/controllers/password-history.admin.controller';
import { PasswordHistoryModule } from 'src/modules/password-history/password-history.module';
import { RoleAdminController } from 'src/modules/role/controllers/role.admin.controller';
import { RoleModule } from 'src/modules/role/role.module';
import { SessionAdminController } from 'src/modules/session/controllers/session.admin.controller';
import { SessionModule } from 'src/modules/session/session.module';
import { SettingModule } from 'src/modules/setting/setting.module';
import { UserAdminController } from 'src/modules/user/controllers/user.admin.controller';
import { UserModule } from 'src/modules/user/user.module';
import { ENUM_WORKER_QUEUES } from 'src/worker/enums/worker.enum';
import { SettingAdminController } from '@modules/setting/controllers/setting.admin.controller';
import { RoleRepositoryModule } from '@modules/role/repository/role.repository.module';
import { CompanyModule } from '@modules/company/company.module';
import { CompanyAdminController } from '@modules/company/controllers/company.admin.controller';
import { PlanModule } from '@modules/plan/plan.module';
import { PlanAdminController } from '@modules/plan/controllers/plan.admin.controller';
import { PaymentModule } from '@modules/payment/payment.module';
import { CardModule } from '@modules/card/card.module';
import { PaymentAdminController } from '@modules/payment/controllers/payment.admin.controller';
import { CardAdminController } from '@modules/card/controllers/card.admin.controller';
import { ToolsAdminController } from '@modules/tools/controllers/tools.admin.controller';
import { ToolsModule } from '@modules/tools/tools.module';
import { SubscriptionModule } from '@modules/subscription/subscription.module';
import { SubscriptionAdminController } from '@modules/subscription/controllers/subscription.admin.controller';
import { DiscountModule } from '@modules/discount/discount.module';
import { DiscountAdminController } from '@modules/discount/controllers/discount.admin.controller';
import { ToolDeletionModule } from '@modules/tools/tool-deletion.module';
import { AssessmentModule } from '@modules/assessment/assessment.module';
import { AssessmentReportController } from '@modules/assessment/controllers/assessment-report.controller';
import { AssessmentAdminController } from '@modules/assessment/controllers/assessment.admin.controller';
import { QuestionAnswerController } from '@modules/assessment/controllers/question-answer.controller';
import { QuestionController } from '@modules/assessment/controllers/question.controller';
import { SectionController } from '@modules/assessment/controllers/section.controller';
import { DashboardModule } from '@modules/dashboard/dashboard.module';
import { DashboardAdminController } from '@modules/dashboard/controllers/dashboard.admin.controller';
import { LocationModule } from '@modules/location/location.module';
import { LocationAdminController } from '@modules/location/controllers/location.admin.controller';
import { CategoryModule } from '@modules/category/category.module';
import { CategoryAdminController } from '@modules/category/controllers/category.admin.controller';
import { ProductModule } from '@modules/product/product.module';
import { ProductAdminController } from '@modules/product/controllers/product.admin.controller';
import { VendorModule } from '@modules/vendor/vendor.module';
import { VendorAdminController } from '@modules/vendor/controllers/vendor.admin.controller';
import { CustomerModule } from '@modules/customer/customer.module';
import { CustomerAdminController } from '@modules/customer/controllers/customer.admin.controller';
import { CurrencyModule } from '@modules/currency/currency.module';
import { CurrencyAdminController } from '@modules/currency/controllers/currency.admin.controller';
import { PriceListModule } from '@modules/price-list/price-list.module';
import { PriceListAdminController } from '@modules/price-list/controllers/price-list.admin.controller';
import { EmployeeModule } from '@modules/employee/employee.module';
import { EmployeeAdminController } from '@modules/employee/controllers/employee.admin.controller';
import { HolidayCalendarModule } from '@modules/holiday-calendar/holiday-calendar.module';
import { HolidayCalendarAdminController } from '@modules/holiday-calendar/controllers/holiday-calendar.admin.controller';
import { DocumentModule } from '@modules/document/document.module';
import { DocumentAdminController } from '@modules/document/controllers/document.admin.controller';
import { UserRepositoryModule } from '@modules/user/repository/user.repository.module';
import { ContractModule } from '@modules/contract/contract.module';
import { ContractAdminController } from '@modules/contract/controllers/contract.admin.controller';
import { LeaveModule } from '@modules/leave/leave.module';
import { LeaveAdminController } from '@modules/leave/controllers/leave.admin.controller';
import { AttendanceModule } from '@modules/attendance/attendance.module';
import { AttendanceAdminController } from '@modules/attendance/controllers/attendance.admin.controller';
import { ShiftModule } from '@modules/shift/shift.module';
import { ShiftAdminController } from '@modules/shift/controllers/shift.admin.controller';
import { ComplianceModule } from '@modules/compliance/compliance.module';
import { ComplianceAdminController } from '@modules/compliance/controllers/compliance.admin.controller';
import { CompanyLookupModule } from '@modules/company-lookup/company-lookup.module';
import { CompanyLookupAdminController } from '@modules/company-lookup/controllers/company-lookup.admin.controller';
import { CompanySettingsModule } from '@modules/company-settings/company-settings.module';
import { CompanySettingsAdminController } from '@modules/company-settings/controllers/company-settings.admin.controller';
import { NotificationModule } from '@modules/notification/notification.module';
import { NotificationAdminController } from '@modules/notification/controllers/notification.admin.controller';
import { MessageLogAdminController } from '@modules/message-log/controllers/message-log.admin.controller';
import { PayrollModule } from '@modules/payroll/payroll.module';
import { PayrollAdminController } from '@modules/payroll/controllers/payroll.admin.controller';

@Module({
    controllers: [
        RoleAdminController,
        UserAdminController,
        AuthAdminController,
        SessionAdminController,
        PasswordHistoryAdminController,
        ActivityAdminController,
        SettingAdminController,
        CompanyAdminController,
        PlanAdminController,
        PaymentAdminController,
        CardAdminController,
        ToolsAdminController,
        SubscriptionAdminController,

        // Assessment controllers

        AssessmentReportController,
        AssessmentAdminController,
        QuestionAnswerController,
        QuestionController,
        SectionController,

        DiscountAdminController,

        // Dashboard controller
        DashboardAdminController,

        // Location controller
        LocationAdminController,

        // Category controller
        CategoryAdminController,

        // Product controller
        ProductAdminController,

        // Vendor controller
        VendorAdminController,

        // Customer controller
        CustomerAdminController,

        // Currency controller
        CurrencyAdminController,

        // Price List controller
        PriceListAdminController,

        // Employee controller
        EmployeeAdminController,

        // Holiday Calendar controller
        HolidayCalendarAdminController,

        // Document controller
        DocumentAdminController,

        // Contract controller
        ContractAdminController,

        // Leave controller
        LeaveAdminController,

        // Attendance controller
        AttendanceAdminController,

        // Shift controller
        ShiftAdminController,

        // Compliance controller
        ComplianceAdminController,

        // Company Lookup controller
        CompanyLookupAdminController,

        // Company Settings controller
        CompanySettingsAdminController,

        // Notification controller
        NotificationAdminController,

        // Message Log controller
        MessageLogAdminController,

        // Payroll controller
        PayrollAdminController,
    ],
    providers: [],
    exports: [],
    imports: [
        RoleRepositoryModule,
        SettingModule,
        RoleModule,
        UserModule,
        AuthModule,
        EmailModule,
        SessionModule,
        PasswordHistoryModule,
        ActivityModule,
        CompanyModule,
        PlanModule,
        BullModule.registerQueueAsync({
            name: ENUM_WORKER_QUEUES.EMAIL_QUEUE,
        }),
        BullModule.registerQueueAsync({
            name: ENUM_WORKER_QUEUES.SMS_QUEUE,
        }),
        BullModule.registerQueueAsync({
            name: ENUM_WORKER_QUEUES.WHATSAPP_QUEUE,
        }),
        PaymentModule,
        CardModule,
        ToolsModule,
        SubscriptionModule,

        DiscountModule,
        ToolDeletionModule,
        AssessmentModule,
        DashboardModule,
        LocationModule,
        CategoryModule,
        ProductModule,
        VendorModule,
        CustomerModule,
        CurrencyModule,
        PriceListModule,
        EmployeeModule,
        HolidayCalendarModule,
        DocumentModule,
        UserRepositoryModule,
        ContractModule,
        LeaveModule,
        AttendanceModule,
        ShiftModule,
        ComplianceModule,
        CompanyLookupModule,
        CompanySettingsModule,
        NotificationModule,
        PayrollModule,
    ],
})
export class RoutesAdminModule { }
