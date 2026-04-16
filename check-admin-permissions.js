// Quick script to check Super Admin permissions
const mongoose = require('mongoose');

const uri = process.env.DATABASE_HOST || 'mongodb://localhost:27017/peoplegem';

async function checkPermissions() {
    try {
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        const Role = mongoose.connection.collection('roles');

        const adminRole = await Role.findOne({ name: 'Admin' });

        if (adminRole) {
            console.log('\n=== Super Admin Role ===');
            console.log('Category:', adminRole.category);
            console.log('\nLocation Permissions:', adminRole.permissions?.location);
            console.log('Employee Permissions:', adminRole.permissions?.employee);
            console.log('\nAll Permission Modules:', Object.keys(adminRole.permissions || {}));
        } else {
            console.log('Admin role not found!');
        }

        await mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkPermissions();
