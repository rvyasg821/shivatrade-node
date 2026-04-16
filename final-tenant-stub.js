const fs = require('fs');
const path = require('path');

const baseDir = '/home/strivedge-asus-2/Documents/Rahul/adorn/apgem/node';

// Files that have broken tenant code
const filesToFix = [
    'src/modules/auth/controllers/auth.shared.controller.ts',
    'src/modules/company/controllers/company.admin.controller.ts',
    'src/modules/role/controllers/role.admin.controller.ts',
    'src/modules/role/guards/permission.guard.ts',
    'src/modules/shared-users/commands/validate-migration.command.ts',
    'src/modules/shared-users/services/migration.service.ts',
    'src/modules/subscription/services/subscription-cleanup.service.ts',
    'src/modules/subscription/services/subscription.service.ts',
    'src/modules/subscription/services/subscription-tool-restoration.service.ts',
    'src/modules/subscription/services/tool-provisioning.service.ts',
    'src/modules/tools/services/cascade-operations.service.ts',
    'src/modules/user/guards/user.guard.ts',
];

for (const file of filesToFix) {
    const filePath = path.join(baseDir, file);

    if (!fs.existsSync(filePath)) {
        console.log(`Skipping ${file} - not found`);
        continue;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // Fix pattern: const variable = // Tenant service removed: ...
    // Replace with: const variable = null;
    content = content.replace(
        /const\s+(\w+)\s*=\s*\n?\s*\/\/ Tenant service removed:[^\n]+/g,
        'const $1 = null;'
    );

    // Fix pattern: if (!variable) where variable was set to commented line
    // These will now work because variable is null

    // Fix pattern: return await this.tenantService... that's commented
    // Replace entire return statement with return null
    content = content.replace(
        /return\s+\/\/ Tenant service removed:[^\n]+/g,
        'return null; // Tenant service removed'
    );

    // Fix blocks that try to use undefined variables from commented code
    // Pattern: reference to tenantUser, tenantConnection, etc that are now undefined
    // We need to replace usage of these with null checks that always fail

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✓ Fixed ${file}`);
    } else {
        console.log(`  No auto-fixes applied to ${file}`);
    }
}

console.log('\nFinal tenant stub complete! Manual fixes may still be needed.');
