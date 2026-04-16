import { Test, TestingModule } from '@nestjs/testing';
import { CompanyService } from '../company.service';
import { CompanyRepository } from '../../repository/repositories/company.repository';
import { CompanyDoc } from '../../repository/entities/company.entity';
import { randomUUID } from 'crypto';
const newObjectId = () => randomUUID();

describe('CompanyService', () => {
    let service: CompanyService;
    let repository: CompanyRepository;

    const mockRepository = {
        findAll: jest.fn(),
        getTotal: jest.fn(),
        findOneById: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        findAllWithUser: jest.fn(),
        getTotalWithUser: jest.fn(),
        existByEmail: jest.fn(),
        existByEmailExcludingId: jest.fn(),
        findOneWithUser: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CompanyService,
                {
                    provide: CompanyRepository,
                    useValue: mockRepository,
                },
            ],
        }).compile();

        service = module.get<CompanyService>(CompanyService);
        repository = module.get<CompanyRepository>(CompanyRepository);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('mapListItem', () => {
        it('should map company with populated user data correctly', () => {
            const mockCompany = {
                _id: newObjectId(),
                company_name: 'Test Company',
                contact_name: 'John Doe',
                contact_first_name: 'John',
                contact_last_name: 'Doe',
                email: 'test@company.com',
                mobile: '1234567890',
                website: 'https://test.com',
                user_id: {
                    _id: newObjectId(),
                    name: 'John Doe',
                    first_name: 'John',
                    last_name: 'Doe',
                    email: 'john@example.com',
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            } as any;

            const result = service.mapListItem(mockCompany);

            expect(result).toEqual({
                _id: String(mockCompany._id),
                company_name: 'Test Company',
                contact_name: 'John Doe',
                contact_first_name: 'John',
                contact_last_name: 'Doe',
                email: 'test@company.com',
                mobile: '1234567890',
                website: 'https://test.com',
                user: {
                    _id: String(mockCompany.user_id._id),
                    name: 'John Doe',
                    first_name: 'John',
                    last_name: 'Doe',
                    email: 'john@example.com',
                },
                createdAt: mockCompany.createdAt,
                updatedAt: mockCompany.updatedAt,
            });
        });

        it('should handle company without populated user data', () => {
            const mockCompany = {
                _id: newObjectId(),
                company_name: 'Test Company',
                contact_name: 'John Doe',
                email: 'test@company.com',
                mobile: '1234567890',
                user_id: newObjectId(), // Not populated
                createdAt: new Date(),
                updatedAt: new Date(),
            } as any;

            const result = service.mapListItem(mockCompany);

            expect(result.user).toBeUndefined();
            expect(result.company_name).toBe('Test Company');
        });

        it('should handle null/undefined user data gracefully', () => {
            const mockCompany = {
                _id: newObjectId(),
                company_name: 'Test Company',
                contact_name: 'John Doe',
                email: 'test@company.com',
                mobile: '1234567890',
                user_id: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            } as any;

            const result = service.mapListItem(mockCompany);

            expect(result.user).toBeUndefined();
            expect(result.company_name).toBe('Test Company');
        });

        it('should handle malformed populated user data', () => {
            const mockCompany = {
                _id: newObjectId(),
                company_name: 'Test Company',
                contact_name: 'John Doe',
                email: 'test@company.com',
                mobile: '1234567890',
                user_id: {
                    // Missing _id field
                    name: 'John Doe',
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            } as any;

            const result = service.mapListItem(mockCompany);

            expect(result.user).toBeUndefined();
            expect(result.company_name).toBe('Test Company');
        });

        it('should provide fallback values for missing company fields', () => {
            const mockCompany = {
                _id: newObjectId(),
                // Missing required fields
                createdAt: new Date(),
                updatedAt: new Date(),
            } as any;

            const result = service.mapListItem(mockCompany);

            expect(result.company_name).toBe('');
            expect(result.contact_name).toBe('');
            expect(result.email).toBe('');
            expect(result.mobile).toBe('');
        });

        it('should handle transformation errors gracefully', () => {
            const mockCompany = {
                _id: newObjectId(),
                company_name: 'Test Company',
                contact_name: 'John Doe',
                email: 'test@company.com',
                mobile: '1234567890',
                createdAt: new Date(),
                updatedAt: new Date(),
            } as any;

            // Mock console.error to avoid noise in tests
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            // Force an error by making _id throw
            Object.defineProperty(mockCompany, '_id', {
                get: () => {
                    throw new Error('Test error');
                },
            });

            const result = service.mapListItem(mockCompany);

            expect(result).toBeDefined();
            expect(result.user).toBeUndefined();
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });
    });

    describe('mapList', () => {
        it('should map array of companies correctly', () => {
            const mockCompanies = [
                {
                    _id: newObjectId(),
                    company_name: 'Company 1',
                    contact_name: 'John Doe',
                    email: 'test1@company.com',
                    mobile: '1234567890',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    _id: newObjectId(),
                    company_name: 'Company 2',
                    contact_name: 'Jane Doe',
                    email: 'test2@company.com',
                    mobile: '0987654321',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ] as any[];

            const result = service.mapList(mockCompanies);

            expect(result).toHaveLength(2);
            expect(result[0].company_name).toBe('Company 1');
            expect(result[1].company_name).toBe('Company 2');
        });

        it('should handle empty array', () => {
            const result = service.mapList([]);
            expect(result).toEqual([]);
        });

        it('should handle null/undefined input', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            const result1 = service.mapList(null as any);
            const result2 = service.mapList(undefined as any);

            expect(result1).toEqual([]);
            expect(result2).toEqual([]);
            expect(consoleSpy).toHaveBeenCalledTimes(2);

            consoleSpy.mockRestore();
        });

        it('should handle individual item mapping errors', () => {
            const mockCompanies = [
                {
                    _id: newObjectId(),
                    company_name: 'Company 1',
                    contact_name: 'John Doe',
                    email: 'test1@company.com',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                null, // This will cause an error
            ] as any[];

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            const result = service.mapList(mockCompanies);

            expect(result).toHaveLength(2);
            expect(result[0].company_name).toBe('Company 1');
            expect(result[1].company_name).toBe('Unknown Company');
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });
    });
});