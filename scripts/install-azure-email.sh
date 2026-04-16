#!/bin/bash

echo "Installing Azure Email Service dependencies..."

# Install the required Azure MSAL package
if command -v yarn &> /dev/null; then
    echo "Using Yarn to install @azure/msal-node..."
    yarn add @azure/msal-node
elif command -v npm &> /dev/null; then
    echo "Using NPM to install @azure/msal-node..."
    npm install @azure/msal-node
else
    echo "Error: Neither Yarn nor NPM found. Please install one of them first."
    exit 1
fi

echo "Azure Email Service dependencies installed successfully!"
echo ""
echo "Next steps:"
echo "1. Configure your Azure App Registration (see README.md)"
echo "2. Add the required settings to your database"
echo "3. Test the configuration using the API endpoints"