import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SubscriptionToolLoggerService extends Logger {
    private readonly logFilePath: string;
    private readonly logDirectory: string;

    constructor(private readonly configService: ConfigService) {
        super('SubscriptionToolLogger');

        // Get log directory from config or use default
        this.logDirectory = this.configService.get<string>('debug.filePath') || '/logs';
        this.logFilePath = path.join(process.cwd(), this.logDirectory, 'subscription-tools.log');

        // Ensure log directory exists
        this.ensureLogDirectoryExists();
    }

    private ensureLogDirectoryExists(): void {
        const dir = path.dirname(this.logFilePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private writeToFile(level: string, message: string, context?: string): void {
        const timestamp = new Date().toISOString();
        const contextStr = context ? `[${context}] ` : '';
        const logEntry = `${timestamp} [${level.toUpperCase()}] ${contextStr}${message}\n`;

        try {
            fs.appendFileSync(this.logFilePath, logEntry);
        } catch (error) {
            // Fallback to console if file write fails
            console.error('Failed to write to log file:', error);
            console.log(logEntry.trim());
        }
    }

    logSubscriptionPurchase(message: string, context?: string): void {
        this.writeToFile('INFO', `[SUBSCRIPTION_PURCHASE] ${message}`, context);
        super.log(`[SUBSCRIPTION_PURCHASE] ${message}`, context);
    }

    logToolProvisioning(message: string, context?: string): void {
        this.writeToFile('INFO', `[TOOL_PROVISIONING] ${message}`, context);
        super.log(`[TOOL_PROVISIONING] ${message}`, context);
    }

    logToolRestoration(message: string, context?: string): void {
        this.writeToFile('INFO', `[TOOL_RESTORATION] ${message}`, context);
        super.log(`[TOOL_RESTORATION] ${message}`, context);
    }

    logToolUpdate(message: string, context?: string): void {
        this.writeToFile('INFO', `[TOOL_UPDATE] ${message}`, context);
        super.log(`[TOOL_UPDATE] ${message}`, context);
    }

    logError(message: string, trace?: string, context?: string): void {
        const errorMessage = trace ? `${message}\nStack: ${trace}` : message;
        this.writeToFile('ERROR', `[ERROR] ${errorMessage}`, context);
        super.error(`[ERROR] ${message}`, trace, context);
    }

    logWarning(message: string, context?: string): void {
        this.writeToFile('WARN', `[WARNING] ${message}`, context);
        super.warn(`[WARNING] ${message}`, context);
    }

    logDebug(message: string, context?: string): void {
        this.writeToFile('DEBUG', `[DEBUG] ${message}`, context);
        super.debug(`[DEBUG] ${message}`, context);
    }

    // Method to get log file path for external access
    getLogFilePath(): string {
        return this.logFilePath;
    }

    // Method to clear log file
    clearLogFile(): void {
        try {
            fs.writeFileSync(this.logFilePath, '');
            this.logDebug('Log file cleared');
        } catch (error) {
            this.logError(`Failed to clear log file: ${error.message}`);
        }
    }

    // Method to get recent logs
    getRecentLogs(lines: number = 100): string[] {
        try {
            const content = fs.readFileSync(this.logFilePath, 'utf-8');
            const allLines = content.split('\n').filter(line => line.trim() !== '');
            return allLines.slice(-lines);
        } catch (error) {
            this.logError(`Failed to read log file: ${error.message}`);
            return [];
        }
    }
}