import { Module } from '@nestjs/common';
import { UserRepositoryModule } from '@modules/user/repository/user.repository.module';
import { RoleRepositoryModule } from '@modules/role/repository/role.repository.module';
import { CreatorScopeService } from './creator-scope.service';
import { CreatorScopeController } from './controllers/creator-scope.controller';

// Leaf module — imports ONLY repository modules (no feature modules), so it
// stays acyclic no matter how many feature modules import it (mirrors
// DependencyCheckModule).
@Module({
    imports: [UserRepositoryModule, RoleRepositoryModule],
    controllers: [CreatorScopeController],
    providers: [CreatorScopeService],
    exports: [CreatorScopeService],
})
export class CreatorScopeModule {}
