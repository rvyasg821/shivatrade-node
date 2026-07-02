import {
    BadRequestException,
    ConflictException,
    Injectable,
} from '@nestjs/common';
import { ENUM_USER_STATUS_CODE_ERROR } from '@modules/user/enums/user.status-code.enum';
import {
    IDatabaseAggregateOptions,
    IDatabaseCreateOptions,
    IDatabaseDeleteManyOptions,
    IDatabaseExistsOptions,
    IDatabaseFindAllAggregateOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseSaveOptions,
    IDatabaseSoftDeleteOptions,
    IDatabaseUpdateOptions,
} from '@common/database/interfaces/database.interface';
import { HelperDateService } from '@common/helper/services/helper.date.service';
import { ConfigService } from '@nestjs/config';
import { IAuthPassword } from '@modules/auth/interfaces/auth.interface';
import { plainToInstance } from 'class-transformer';
import { IUserService } from '@modules/user/interfaces/user.service.interface';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';
import {
    UserDoc,
    UserEntity,
} from '@modules/user/repository/entities/user.entity';
import { IUserDoc, IUserEntity } from '@modules/user/interfaces/user.interface';
import {
    ENUM_USER_INACTIVE_REASON,
    ENUM_USER_SIGN_UP_FROM,
    ENUM_USER_STATUS,
} from '@modules/user/enums/user.enum';
import { UserCreateRequestDto } from '@modules/user/dtos/request/user.create.request.dto';
import { UserUpdatePasswordAttemptRequestDto } from '@modules/user/dtos/request/user.update-password-attempt.request.dto';
import { UserUpdateRequestDto } from '@modules/user/dtos/request/user.update.request.dto';
import { UserProfileResponseDto } from '@modules/user/dtos/response/user.profile.response.dto';
import { UserListResponseDto } from '@modules/user/dtos/response/user.list.response.dto';
import { UserShortResponseDto } from '@modules/user/dtos/response/user.short.response.dto';
import { UserGetResponseDto } from '@modules/user/dtos/response/user.get.response.dto';
import { HelperStringService } from '@common/helper/services/helper.string.service';
import { UserUpdateStatusRequestDto } from '@modules/user/dtos/request/user.update-status.request.dto';
import { DatabaseHelperQueryContain } from '@common/database/decorators/database.decorator';
import { UserCensorResponseDto } from '@modules/user/dtos/response/user.censor.response.dto';
import { DatabaseService } from '@common/database/services/database.service';
import { HelperPasswordService } from '@common/helper/services/helper.password.service';
import { AuthUpdateProfileRequestDto } from '@modules/auth/dtos/request/auth.update-profile.request.dto';

@Injectable()
export class UserService implements IUserService {
    private readonly usernamePrefix: string;
    private readonly usernamePattern: RegExp;
    private readonly uploadPath: string;

    constructor(
        private readonly userRepository: UserRepository,
        private readonly helperDateService: HelperDateService,
        private readonly configService: ConfigService,
        private readonly helperPasswordService: HelperPasswordService,
        private readonly helperStringService: HelperStringService,
        private readonly databaseService: DatabaseService,
    ) {
        this.usernamePrefix = this.configService.get<string>(
            'user.usernamePrefix'
        );
        this.usernamePattern = this.configService.get<RegExp>(
            'user.usernamePattern'
        );
        this.uploadPath = this.configService.get<string>('user.uploadPath');
    }
    updatePhoto(_repository: UserDoc, _photo: any, _options?: IDatabaseSaveOptions): Promise<UserDoc> {
        throw new Error('Method not implemented.');
    }

    convertToObjectId(id: string) {
        return id;
    }

    async findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<UserDoc[]> {
        return this.userRepository.findAll<UserDoc>(find, options);
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return this.userRepository.getTotal(find, options);
    }

    async findAllWithRoleAndCountry(
        find?: Record<string, any>,
        options?: IDatabaseFindAllAggregateOptions
    ): Promise<IUserEntity[]> {
        return this.userRepository.findAll<IUserEntity>(find, {
            ...options,
            join: true,
        });
    }

    async getTotalWithRoleAndCountry(
        find?: Record<string, any>,
        options?: IDatabaseAggregateOptions
    ): Promise<number> {
        return this.userRepository.getTotal(find, {
            ...options,
            join: true,
        });
    }

    async findOneById(
        _id: any,
        options?: IDatabaseFindOneOptions
    ): Promise<UserDoc> {
        return this.userRepository.findOneById<UserDoc>(_id, options);
    }

    async findOneByIdWithPassword(
        _id: any,
        options?: IDatabaseFindOneOptions
    ): Promise<UserDoc> {
        return this.userRepository.findOneByIdWithPassword(_id);
    }

    async findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<UserDoc> {
        return this.userRepository.findOne<UserDoc>(find, options);
    }

    async findOneByEmail(
        email: string,
        options?: IDatabaseFindOneOptions
    ): Promise<UserDoc> {
        return this.userRepository.findOne<UserDoc>(
            DatabaseHelperQueryContain('email', email, { fullWord: true }),
            options
        );
    }

    async findOneByEmailWithPassword(
        email: string,
        options?: IDatabaseFindOneOptions
    ): Promise<UserDoc> {
        return this.userRepository.findOne<UserDoc>(
            DatabaseHelperQueryContain('email', email, { fullWord: true }),
            options
        );
    }

    async findOneUserByEmailWithPassword(email: string): Promise<UserDoc> {
        return this.userRepository.findOneByEmailWithPassword(email);
    }

    async findOneWithRoleAndCountryById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<IUserDoc> {
        return this.userRepository.findOneById<IUserDoc>(_id, {
            ...options,
            join: true,
        });
    }

    async findAllActiveWithRoleAndCountry(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<IUserDoc[]> {
        return this.userRepository.findAll<IUserDoc>(
            { ...find, status: ENUM_USER_STATUS.ACTIVE },
            options
        );
    }

    async getTotalActive(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return this.userRepository.getTotal(
            { ...find, status: ENUM_USER_STATUS.ACTIVE },
            options
        );
    }

    async findOneActiveById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<IUserDoc> {
        return this.userRepository.findOne<IUserDoc>(
            { _id: _id, status: ENUM_USER_STATUS.ACTIVE },
            options
        );
    }

    async findOneActiveByEmail(
        email: string,
        options?: IDatabaseFindOneOptions
    ): Promise<IUserDoc> {
        return this.userRepository.findOne<IUserDoc>(
            {
                ...DatabaseHelperQueryContain('email', email, {
                    fullWord: true,
                }),
                status: ENUM_USER_STATUS.ACTIVE,
            },
            options
        );
    }

    async findOneActiveByMobileNumber(
        mobileNumber: string,
        options?: IDatabaseFindOneOptions
    ): Promise<IUserDoc> {
        return this.userRepository.findOne<IUserDoc>(
            {
                'mobileNumber.number': mobileNumber,
                status: ENUM_USER_STATUS.ACTIVE,
            },
            options
        );
    }

    async findOneByReferalCode(
        referalCode: string,
        options?: IDatabaseFindOneOptions
    ): Promise<UserDoc> {
        return this.userRepository.findOne<UserDoc>(
            { referal_code: referalCode },
            options
        );
    }

    async findOneActiveAgentByReferalCode(
        referalCode: string,
    ): Promise<UserDoc> {
        return this.userRepository.findOneByReferalCode(referalCode);
    }

    async findOneActiveByReferalCode(
        referalCode: string,
        options?: IDatabaseFindOneOptions
    ): Promise<boolean> {
        return this.userRepository.isExistsByReferalCode(referalCode);
    }

    async create(
        {
            email,
            name,
            first_name,
            last_name,
            role,
            gender,
            country_code,
            mobile,
            status,
            companyId,
            roleLevel,
            commission,
            referal_code,
            photo,
            selected_country,
            timezone,
            location_id,
            employee_code,
            designation,
            department,
            employment_type,
            date_of_joining,
            date_of_birth,
            reporting_to,
            address_line1,
            address_line2,
            city,
            state,
            postcode,
            country
        }: UserCreateRequestDto,
        { passwordExpired, passwordHash, salt, passwordCreated }: IAuthPassword,
        signUpFrom: ENUM_USER_SIGN_UP_FROM,
        options?: IDatabaseCreateOptions
    ): Promise<UserDoc> {
        try {
            const create: UserEntity = new UserEntity();
            create.name = name;
            create.first_name = first_name;
            create.last_name = last_name;
            create.email = email.toLowerCase();
            create.role = this.convertToObjectId(role);
            create.country_code = country_code;
            create.mobile = mobile;
            create.gender = gender;
            create.status = status || ENUM_USER_STATUS.ACTIVE;
            create.password = passwordHash;
            create.salt = salt;
            create.passwordExpired = passwordExpired;
            create.passwordCreated = passwordCreated;
            create.passwordAttempt = 0;
            create.signUpDate = this.helperDateService.create();
            create.signUpFrom = signUpFrom;
            create.companyId = companyId;
            create.referal_code = referal_code;
            create.commission = commission;

            // Set roleLevel to 1 by default, will be updated after role is populated
            create.roleLevel = roleLevel ?? 3;

            create.photo = photo ?? null;
            create.selected_country = selected_country;
            create.timezone = timezone;

            // Set employee fields (skip empty strings to avoid enum validation errors)
            if (location_id) {
                create.location_id = this.convertToObjectId(location_id);
                create.locationId = location_id; // Backward compatibility
            }
            if (employee_code) create.employee_code = employee_code;
            if (designation) create.designation = designation;
            if (department) create.department = department;
            if (employment_type && employment_type.trim()) create.employment_type = employment_type;
            else create.employment_type = undefined; // Avoid storing empty string which fails enum validation
            if (date_of_joining) create.date_of_joining = new Date(date_of_joining);
            if (date_of_birth) create.date_of_birth = new Date(date_of_birth);
            if (reporting_to) create.reporting_to = this.convertToObjectId(reporting_to);
            if (address_line1) create.address_line1 = address_line1;
            if (address_line2) create.address_line2 = address_line2;
            if (city) create.city = city;
            if (state) create.state = state;
            if (postcode) create.postcode = postcode;
            if (country) create.country = country;

            // Email is globally unique among NON-deleted users (partial index
            // `WHERE deleted = false`). If the email already belongs to a user
            // that is soft-deleted OR merely deactivated, reuse that row —
            // overwrite it with the incoming data and bring it back to life —
            // instead of hitting the DB duplicate-key constraint. Only a
            // genuinely ACTIVE user blocks re-use.
            const existing = await this.userRepository.findOne<UserDoc>(
                { email: email.toLowerCase() },
                { withDeleted: true, session: options?.session }
            );

            if (existing) {
                const isActive =
                    !(existing as any).deleted &&
                    existing.status === ENUM_USER_STATUS.ACTIVE;
                if (isActive) {
                    throw new ConflictException({
                        statusCode: ENUM_USER_STATUS_CODE_ERROR.EMAIL_EXIST,
                        message: 'user.error.emailExist',
                    });
                }

                // Revive / reactivate: keep the same row (_id + original
                // createdAt) but overwrite with the new data and clear the
                // soft-delete / inactive flags so the user is live again.
                create._id = (existing as any)._id;
                (create as any).createdAt = (existing as any).createdAt;
                (create as any).deleted = false;
                (create as any).deletedAt = null;
                (create as any).deletedBy = null;
                (create as any).inactive_reason = null;
                create.status = status || ENUM_USER_STATUS.ACTIVE;

                return this.userRepository.save(create, options);
            }

            // Create user in main database
            const createdUser = await this.userRepository.create<UserEntity>(create, options);

            return createdUser;
        } catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    }

    async existByRole(
        role: any,
        options?: IDatabaseExistsOptions
    ): Promise<boolean> {
        return this.userRepository.exists(
            {
                role,
            },
            options
        );
    }

    async existByEmail(
        email: string,
        options?: IDatabaseExistsOptions
    ): Promise<boolean> {
        // Escape special regex characters and use exact case-insensitive match
        // This prevents issues with emails containing +, ., etc.
        const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return this.userRepository.exists(
            { email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') } },
            options
        );
    }

    /**
     * True only when the email belongs to an ACTIVE, non-deleted user.
     * Soft-deleted / deactivated users do NOT block creation — those rows are
     * revived + overwritten by `create()`. Used by the create controllers so
     * they only reject genuine duplicates.
     */
    async existActiveByEmail(
        email: string,
        options?: IDatabaseExistsOptions
    ): Promise<boolean> {
        const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return this.userRepository.exists(
            {
                email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') },
                status: ENUM_USER_STATUS.ACTIVE,
            },
            options
        );
    }

    async isUserExistByEmailExceptId(
        email: string,
        exceptId?: string,
        options?: IDatabaseExistsOptions
    ): Promise<boolean> {
        // Escape special regex characters to prevent issues with emails containing +, ., etc.
        const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const filter = exceptId ? { _id: { $ne: exceptId } } : {};
        const user = await this.userRepository.findOne(
            {
                email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') },
                ...filter,
            },
            options
        );

        return !!user; // Convert to boolean
    }

    async updatePassword(
        repository: UserDoc,
        { passwordHash, passwordExpired, salt, passwordCreated }: IAuthPassword,
        options?: IDatabaseSaveOptions
    ): Promise<UserDoc> {
        repository.password = passwordHash;
        repository.passwordExpired = passwordExpired;
        repository.passwordCreated = passwordCreated;
        repository.salt = salt;
        repository.passwordAttempt = 0;

        return this.userRepository.save(repository, options);
    }

    async updateStatus(
        repository: UserDoc,
        { status }: UserUpdateStatusRequestDto,
        options?: IDatabaseSaveOptions,
        inactiveReason?: ENUM_USER_INACTIVE_REASON | null
    ): Promise<UserEntity> {
        repository.status = status;

        if (status === ENUM_USER_STATUS.INACTIVE) {
            repository.inactive_reason = inactiveReason ?? ENUM_USER_INACTIVE_REASON.MANUAL;
        } else if (status === ENUM_USER_STATUS.ACTIVE) {
            repository.inactive_reason = null;
        }

        return this.userRepository.save(repository, options);
    }

    async updatePasswordAttempt(
        repository: UserDoc,
        { passwordAttempt }: UserUpdatePasswordAttemptRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<UserDoc> {
        repository.passwordAttempt = passwordAttempt;

        return this.userRepository.save(repository, options);
    }

    async increasePasswordAttempt(
        repository: UserDoc,
        options?: IDatabaseUpdateOptions
    ): Promise<UserDoc> {
        return this.userRepository.updateRaw(
            { _id: repository._id },
            this.databaseService.aggregateIncrement('passwordAttempt', 1),
            options
        );
    }

    async resetPasswordAttempt(
        repository: UserDoc,
        options?: IDatabaseSaveOptions
    ): Promise<UserDoc> {
        repository.passwordAttempt = 0;

        return this.userRepository.save(repository, options);
    }

    async updatePasswordExpired(
        repository: UserDoc,
        passwordExpired: Date,
        options?: IDatabaseSaveOptions
    ): Promise<UserDoc> {
        repository.passwordExpired = passwordExpired;

        return this.userRepository.save(repository, options);
    }

    async save(
        repository: UserDoc,
        options?: IDatabaseSaveOptions
    ): Promise<UserDoc> {
        this.syncActiveStatus(repository);
        return this.userRepository.save(repository, options);
    }

    /**
     * Keep is_active and status in sync so that queries using either field
     * return consistent results.  is_active is the source of truth for
     * employees; status is the source of truth for non-employee user types
     * (login checks, admin flows, etc.).
     */
    private syncActiveStatus(user: UserDoc): void {
        if (user.is_active === true && user.status === ENUM_USER_STATUS.INACTIVE) {
            user.status = ENUM_USER_STATUS.ACTIVE;
        } else if (user.is_active === false && user.status === ENUM_USER_STATUS.ACTIVE) {
            user.status = ENUM_USER_STATUS.INACTIVE;
        }
    }

    async update(
        repository: UserDoc,
        {
            name,
            first_name,
            last_name,
            role='',
            gender=null,
            country_code,
            mobile,
            password,
            status,
            email,
            commission,
            photo,
            location_id,
            accessible_locations,
            employee_code,
            designation,
            department,
            employment_type,
            date_of_joining,
            date_of_birth,
            reporting_to,
            address_line1,
            address_line2,
            city,
            state,
            postcode,
            country,
            ni_number,
            nationality,
            marital_status,
            middle_name,
            home_telephone,
        }: UserUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<UserDoc> {
        if (name) repository.name = name;
        if (first_name !== undefined) repository.first_name = first_name;
        if (last_name !== undefined) repository.last_name = last_name;
        if (role) repository.role = this.convertToObjectId(role);
        if (gender) repository.gender = gender;
        if (status) {
            repository.status = status;
            // Keep the is_active flag in sync so screens that filter by
            // is_active (e.g. the Employees list) reflect the change too.
            repository.is_active = status === ENUM_USER_STATUS.ACTIVE;
        }
        if (commission) repository.commission = commission;
        if(photo) repository.photo = photo;

        // Update employee fields
        if (location_id !== undefined) {
            repository.location_id = location_id ? this.convertToObjectId(location_id) : null;
            repository.locationId = location_id || null; // Backward compatibility
        }
        if (accessible_locations !== undefined) {
            repository.accessible_locations = Array.isArray(accessible_locations) ? accessible_locations : [];
        }
        if (employee_code !== undefined) repository.employee_code = employee_code || null;
        if (designation !== undefined) repository.designation = designation || null;
        if (department !== undefined) repository.department = department || null;
        if (employment_type !== undefined) {
            // Set to undefined (unset) when empty string, otherwise set valid enum value
            repository.employment_type = (employment_type && employment_type.trim()) ? employment_type : undefined;
        } else if (repository.employment_type === '') {
            // Sanitize any existing empty string stored in DB - Mongoose enum rejects ''
            repository.employment_type = undefined;
        }
        if (date_of_joining !== undefined) repository.date_of_joining = date_of_joining ? new Date(date_of_joining) : null;
        if (date_of_birth !== undefined) repository.date_of_birth = date_of_birth ? new Date(date_of_birth) : null;
        if (reporting_to !== undefined) repository.reporting_to = reporting_to ? this.convertToObjectId(reporting_to) : null;
        if (address_line1 !== undefined) repository.address_line1 = address_line1 || null;
        if (address_line2 !== undefined) repository.address_line2 = address_line2 || null;
        if (city !== undefined) repository.city = city || null;
        if (state !== undefined) repository.state = state || null;
        if (postcode !== undefined) repository.postcode = postcode || null;
        if (country !== undefined) repository.country = country || null;

        // Personal detail fields
        if (ni_number !== undefined) (repository as any).ni_number = ni_number || null;
        if (nationality !== undefined) (repository as any).nationality = nationality || null;
        if (marital_status !== undefined) (repository as any).marital_status = marital_status || null;
        if (middle_name !== undefined) (repository as any).middle_name = middle_name || null;
        if (home_telephone !== undefined) (repository as any).home_telephone = home_telephone || null;

        if(email){
            const existingUser = await this.isExistsByEmailExceptId(email, repository._id.toString());
            if (existingUser) throw new BadRequestException(`User with email '${email}' already exists`);

            repository.email = email;
        }
        repository.name = repository.first_name.trim() + (repository.last_name ? ` ${repository.last_name.trim()}` : '');
        if (password) {
            const { passwordHash, passwordExpired, salt, passwordCreated }: IAuthPassword = this.helperPasswordService.createPassword(password);
            repository.password = passwordHash;
            repository.passwordExpired = passwordExpired;
            repository.passwordCreated = passwordCreated;
            repository.salt = salt;
            repository.passwordAttempt = 0;
        }

        if (country_code || country_code == null) {
            repository.country_code = country_code;
        }

        if (mobile || mobile == "") {
            repository.mobile = mobile;
        }

        this.syncActiveStatus(repository);
        return this.userRepository.save(repository, options);
    }

    async updateProfile(
        repository: UserDoc,
        dto: AuthUpdateProfileRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<UserDoc> {
        const { name, first_name, last_name, email, gender, country_code, mobile, photo,
          address_line1, address_line2, city, state, postcode, country,
          middle_name, date_of_birth, marital_status, nationality, home_telephone,
          kin_name, kin_relationship, kin_address, kin_postcode, kin_phone, kin_email,
          bank_name, account_holder_name, sort_code, account_number,
        } = dto;

        if (name) repository.name = name;
        if (first_name !== undefined) repository.first_name = first_name;
        if (last_name !== undefined) repository.last_name = last_name;
        if (email) repository.email = email;
        if (gender) repository.gender = gender;

        if (country_code || country_code == null) {
            repository.country_code = country_code;
        }

        if (mobile !== undefined) {
            repository.mobile = mobile;
        }

        if (photo) repository.photo = photo;

        // Address fields
        if (address_line1 !== undefined) repository.address_line1 = address_line1;
        if (address_line2 !== undefined) repository.address_line2 = address_line2;
        if (city !== undefined) repository.city = city;
        if (state !== undefined) repository.state = state;
        if (postcode !== undefined) repository.postcode = postcode;
        if (country !== undefined) repository.country = country;

        // Extended personal fields
        if (middle_name !== undefined) (repository as any).middle_name = middle_name;
        if (date_of_birth !== undefined) (repository as any).date_of_birth = date_of_birth;
        if (marital_status !== undefined) (repository as any).marital_status = marital_status;
        if (nationality !== undefined) (repository as any).nationality = nationality;
        if (home_telephone !== undefined) (repository as any).home_telephone = home_telephone;

        // Emergency contact
        if (kin_name !== undefined) (repository as any).kin_name = kin_name;
        if (kin_relationship !== undefined) (repository as any).kin_relationship = kin_relationship;
        if (kin_address !== undefined) (repository as any).kin_address = kin_address;
        if (kin_postcode !== undefined) (repository as any).kin_postcode = kin_postcode;
        if (kin_phone !== undefined) (repository as any).kin_phone = kin_phone;
        if (kin_email !== undefined) (repository as any).kin_email = kin_email;

        // Bank details
        if (bank_name !== undefined) (repository as any).bank_name = bank_name;
        if (account_holder_name !== undefined) (repository as any).account_holder_name = account_holder_name;
        if (sort_code !== undefined) (repository as any).sort_code = sort_code;
        if (account_number !== undefined) (repository as any).account_number = account_number;

        return this.userRepository.save(repository, options);
    }

    async updateCompanyId(
        repository: UserDoc,
        companyId: string,
        options?: IDatabaseSaveOptions
    ): Promise<UserDoc> {
        repository.companyId = companyId;
        return this.userRepository.save(repository, options);
    }

    async softDelete(
        repository: UserDoc,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<UserDoc> {
        return this.userRepository.softDelete(repository, options);
    }

    async deleteMany(
        find?: Record<string, any>,
        options?: IDatabaseDeleteManyOptions
    ): Promise<boolean> {
        await this.userRepository.deleteMany(find, options);

        return true;
    }

    async hardDelete(_id: string): Promise<boolean> {
        return this.userRepository.hardDelete(_id);
    }

    async join(repository: UserDoc): Promise<IUserDoc> {
        return this.userRepository.join(repository, this.userRepository._join!);
    }

    createRandomUsername(): string {
        const suffix = this.helperStringService.random(6);

        return `${this.usernamePrefix}-${suffix}`.toLowerCase();
    }

    checkUsernamePattern(username: string): boolean {
        return !!username.search(this.usernamePattern);
    }

    async checkUsernameBadWord(username: string): Promise<boolean> {
        const filterBadWordModule = await import('bad-words');
        const filterBadWord = new filterBadWordModule.Filter();
        return filterBadWord.isProfane(username);
    }

    mapProfile(user: IUserDoc | IUserEntity): UserProfileResponseDto {
        return plainToInstance(
            UserProfileResponseDto,
            (user as any).toObject ? (user as any).toObject() : user
        );
    }

    mapCensor(user: UserDoc | UserEntity): UserCensorResponseDto {
        const plainObject = (user as any).toObject ? (user as any).toObject() : user;
        plainObject.name = this.helperStringService.censor(plainObject.name);

        return plainToInstance(UserCensorResponseDto, plainObject);
    }

    mapList(users: IUserDoc[] | IUserEntity[]): UserListResponseDto[] {
        return plainToInstance(
            UserListResponseDto,
            users.map((u: IUserDoc | IUserEntity) =>
                (u as any).toObject ? (u as any).toObject() : u
            )
        );
    }

    mapShort(users: IUserDoc[] | IUserEntity[]): UserShortResponseDto[] {
        return plainToInstance(
            UserShortResponseDto,
            users.map((u: IUserDoc | IUserEntity) =>
                (u as any).toObject ? (u as any).toObject() : u
            )
        );
    }

    mapGet(user: IUserDoc | IUserEntity): UserGetResponseDto {
        return plainToInstance(
            UserGetResponseDto,
            (user as any).toObject ? (user as any).toObject() : user
        );
    }

    async isExistsByEmailExceptId(
        email: string,
        exceptId?: string,
        options?: IDatabaseExistsOptions
    ): Promise<boolean> {
        // Escape special regex characters to prevent issues with emails containing +, ., etc.
        const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const user = await this.userRepository.findOne({
            email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') },
            _id: { $ne: exceptId }
        }, options);

        return !!user; // Convert to boolean
    }
    // User Hierarchy Validation Methods

    /**
     * Validates if current user can manage target user based on hierarchy
     * Returns true if currentUserLevel <= targetUserLevel (lower number = higher authority)
     */
    validateUserHierarchy(currentUserLevel: number, targetUserLevel: number): boolean {
        return currentUserLevel <= targetUserLevel;
    }

    /**
     * Returns users that current user can manage based on hierarchy
     */
    async getUsersByRoleLevel(
        userLevel: number,
        options?: IDatabaseFindAllOptions
    ): Promise<UserDoc[]> {
        return this.userRepository.findAll(
            { 
                status: ENUM_USER_STATUS.ACTIVE,
                roleLevel: { $gte: userLevel }
            },
            options
        );
    }

    /**
     * Updates user's roleLevel when role is assigned/changed
     */
    async updateUserRoleLevel(
        userId: string, 
        roleLevel: number,
        options?: IDatabaseSaveOptions
    ): Promise<UserDoc> {
        const user = await this.findOneById(userId);
        if (!user) {
            throw new BadRequestException('User not found');
        }

        user.roleLevel = roleLevel;
        return this.userRepository.save(user, options);
    }

    /**
     * Updates multiple users' roleLevel by role (used when role level changes)
     */
    async updateManyByRole(
        roleId: string,
        updateData: { roleLevel: number },
        options?: IDatabaseUpdateOptions
    ): Promise<boolean> {
        await this.userRepository.updateMany(
            { role: roleId },
            updateData,
            options
        );
        return true;
    }

    /**
     * Updates user and synchronizes roleLevel with role level
     */
    async updateWithRoleLevel(
        repository: UserDoc,
        updateData: UserUpdateRequestDto & { roleLevel?: number },
        options?: IDatabaseSaveOptions
    ): Promise<UserDoc> {
        // If role is being updated, we need to get the role level
        if (updateData.role && updateData.role !== repository.role.toString()) {
            // This will be handled by the controller to fetch role level
            // and pass it in updateData.roleLevel
            if (updateData.roleLevel) {
                repository.roleLevel = updateData.roleLevel;
            }
        }

        return this.update(repository, updateData, options);
    }

    async generateRandomReferalString(length: number): Promise<string> {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';

      for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        result += chars[randomIndex];
      }

      return result;
    }

    /**
     * Bulk deactivate all company users with a specific reason.
     * Only deactivates currently ACTIVE users.
     * @param companyId - The company ID
     * @param reason - Why users are being deactivated
     * @param excludeCompanyAdmin - If true, excludes the company admin (user_id on company) from deactivation
     * @param companyAdminUserId - The company admin's user ID (required if excludeCompanyAdmin is true)
     */
    async deactivateCompanyUsers(
        companyId: string,
        reason: ENUM_USER_INACTIVE_REASON,
        excludeCompanyAdmin: boolean = false,
        companyAdminUserId?: string
    ): Promise<any> {
        const find: Record<string, any> = {
            companyId,
            status: ENUM_USER_STATUS.ACTIVE,
        };

        if (excludeCompanyAdmin && companyAdminUserId) {
            find['_id'] = { $ne: companyAdminUserId };
        }

        return this.userRepository.updateMany(
            find,
            { status: ENUM_USER_STATUS.INACTIVE, inactive_reason: reason }
        );
    }

    /**
     * Bulk reactivate company users that were deactivated for a specific reason.
     * Only reactivates users matching the given reason (preserves manual deactivations).
     * @param companyId - The company ID
     * @param reason - Only reactivate users with this specific inactive_reason
     */
    async reactivateCompanyUsers(
        companyId: string,
        reason: ENUM_USER_INACTIVE_REASON
    ): Promise<any> {
        return this.userRepository.updateMany(
            {
                companyId,
                status: ENUM_USER_STATUS.INACTIVE,
                inactive_reason: reason,
            },
            { status: ENUM_USER_STATUS.ACTIVE, inactive_reason: null }
        );
    }

    /**
     * Hard delete all users belonging to a company.
     * Used when a company is permanently deleted.
     * @param companyId - The company ID
     */
    async hardDeleteCompanyUsers(companyId: string): Promise<boolean> {
        return this.deleteMany({ companyId });
    }

}