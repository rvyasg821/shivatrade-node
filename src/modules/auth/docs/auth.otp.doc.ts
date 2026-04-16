import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
    ApiBody,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { OTPGenerateRequestDto } from '../dtos/request/otp-generate.request.dto';
import { OTPVerifyRequestDto } from '../dtos/request/otp-verify.request.dto';
import { OTPGenerateResponseDto } from '../dtos/response/otp-generate.response.dto';
import { OTPVerifyResponseDto } from '../dtos/response/otp-verify.response.dto';

export function AuthOTPGenerateDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.public.auth'),
        ApiOperation({
            summary: 'Generate OTP for email verification',
            description: 'Generates a 6-digit OTP and sends it to the provided email address. The OTP expires in 5 minutes.',
        }),
        ApiBody({
            description: 'Email address to send OTP to',
            type: OTPGenerateRequestDto,
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'OTP generated and sent successfully',
            type: OTPGenerateResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.BAD_REQUEST,
            description: 'Invalid email format or email sending failed',
        }),
        ApiResponse({
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            description: 'Internal server error',
        })
    );
}

export function AuthOTPVerifyDoc(): MethodDecorator {
    return applyDecorators(
        ApiTags('modules.public.auth'),
        ApiOperation({
            summary: 'Verify OTP for email verification',
            description: 'Verifies the provided OTP against the email address. The OTP is deleted after successful verification.',
        }),
        ApiBody({
            description: 'Email and OTP for verification',
            type: OTPVerifyRequestDto,
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'OTP verified successfully',
            type: OTPVerifyResponseDto,
        }),
        ApiResponse({
            status: HttpStatus.BAD_REQUEST,
            description: 'Invalid OTP, expired OTP, or maximum attempts exceeded',
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'OTP not found for the provided email',
        }),
        ApiResponse({
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            description: 'Internal server error',
        })
    );
}