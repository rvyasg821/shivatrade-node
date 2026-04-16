const mongoose = require('mongoose');

const uri = process.env.DATABASE_HOST || 'mongodb://localhost:27017/peoplegem';

async function fixAdminPermissions() {
    try {
        await mongoose.connect(uri);
        console.log('✅ Connected to MongoDB\n');

        const rolesCollection = mongoose.connection.collection('roles');

        // Update Super Admin role to remove location and employee permissions
        const result = await rolesCollection.updateOne(
            { name: 'Admin' },
            {
                $set: {
                    'permissions.location': {
                        can_all: false,
                        can_read: false,
                        can_add: false,
                        can_update: false,
                        can_delete: false
                    },
                    'permissions.employee': {
                        can_all: false,
                        can_read: false,
                        can_add: false,
                        can_update: false,
                        can_delete: false
                    }
                }
            }
        );

        console.log('📝 Updated Super Admin role:', result.modifiedCount, 'document(s)\n');

        // Verify the update
        const adminRole = await rolesCollection.findOne({ name: 'Admin' });

        console.log('=== Super Admin Permissions ===');
        console.log('Location:', adminRole.permissions?.location);
        console.log('Employee:', adminRole.permissions?.employee);
        console.log('\n✅ Super Admin can no longer access Location and Employee modules');

        await mongoose.connection.close();
        console.log('\n✅ Done! Now logout and login again to get fresh permissions.');
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixAdminPermissions();
