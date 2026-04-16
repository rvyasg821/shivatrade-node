import { IFileRows } from '@common/file/interfaces/file.interface';

export interface IFileService {
    writeCsv<T = Record<string, string | number | Date>>(
        rows: IFileRows<T>
    ): Buffer;
    writeCsvFromArray<T = Record<string, string | number | Date>>(
        rows: T[][]
    ): Buffer;
    writeExcel<T = Record<string, string | number | Date>>(
        rows: IFileRows<T>[]
    ): Buffer;
    writeExcelFromArray<T = Record<string, string | number | Date>>(
        rows: T[][]
    ): Buffer;
    readCsv<T = Record<string, string | number | Date>>(
        file: Buffer
    ): IFileRows<T>;
    readCsvFromString<T = Record<string, string | number | Date>>(
        file: string
    ): IFileRows<T>;
    readExcel<T = Record<string, string | number | Date>>(
        file: Buffer
    ): IFileRows<T>[];
    
    // New methods for base64 validation and image upload
    isBase64(str: string): boolean;
    uploadBase64Image(base64String: string, filename: string): Promise<string>;
    getExtensionFromBase64(base64String: string): string | null;
}