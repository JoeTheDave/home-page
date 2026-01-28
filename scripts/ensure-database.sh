#!/bin/bash

# Ensure project database exists in shared PostgreSQL container
DATABASE_NAME="home_page_dev"
CONTAINER_NAME="home-page-postgres"

echo "📊 Ensuring database '$DATABASE_NAME' exists..."

# Create database if it doesn't exist
docker exec $CONTAINER_NAME psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$DATABASE_NAME'" | grep -q 1 || {
    echo "🏗️  Creating database '$DATABASE_NAME'..."
    docker exec $CONTAINER_NAME createdb -U postgres $DATABASE_NAME
    echo "✅ Database '$DATABASE_NAME' created successfully"
}

echo "✓ Database '$DATABASE_NAME' is ready"