const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function createSharedUsers() {
    const mongoUrl = "mongodb://localhost:27017/ransombloc?retryWrites=true&w=majority";

    console.log('🚀 Creating shared user entries for unified authentication');

    const client = new MongoClient(mongoUrl);

    try {
        await client.connect();
        const db = client.db();

        // Hash the password (same as used in seeding)
        const password = 'Admin@123';
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const sharedUsersCollection = db.collection('sharedusers');

        // Create shared user entries
        const sharedUsers = [
            {
                email: 'admin@peoplegem.io',
                password: hashedPassword,
                tenantId: null,
                userType: 'Admin',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            {
                email: 'company@admin.com',
                password: hashedPassword,
                tenantId: null, // Will be updated when company is created
                userType: 'Company Admin',
                createdAt: new Date(),
                updatedAt: new Date(),
            }
        ];

        for (const sharedUser of sharedUsers) {
            // Check if user already exists
            const existingUser = await sharedUsersCollection.findOne({ email: sharedUser.email });

            if (!existingUser) {
                console.log('');
                console.log('creating new shared user===');
                console.log('');
                await sharedUsersCollection.insertOne(sharedUser);
                console.log(`✅ Created shared user entry for: ${sharedUser.email} (${sharedUser.userType})`);
            } else {
                console.log('');
                console.log('shared user already Exists--->');
                console.log('');
                console.log(`⚠️ Shared user already exists for: ${sharedUser.email}`);
            }
        }

        console.log('🎉 Shared user entries created successfully!');
        console.log('');
        console.log('You can now login using the unified authentication system:');
        console.log('- admin@peoplegem.io/ Admin@123 (Super Admin)');
        console.log('- company@admin.com / Admin@123 (Company Admin)');

    } catch (error) {
        console.error('❌ Error creating shared users:', error);
        process.exit(1);
    } finally {
        await client.close();
    }
}

createSharedUsers();