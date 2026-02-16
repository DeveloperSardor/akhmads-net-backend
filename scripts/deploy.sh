#!/bin/bash

set -e

echo "🚀 AKHMADS.NET Deployment Script"
echo "================================="

# Load environment
export $(cat .env.production | xargs)

# 1. Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# 2. Install dependencies
echo "📦 Installing dependencies..."
npm ci --production

# 3. Generate Prisma Client
echo "🔧 Generating Prisma Client..."
npx prisma generate

# 4. Run migrations
echo "🗄️  Running database migrations..."
npx prisma migrate deploy

# 5. Seed initial data (if needed)
if [ "$SEED_DATABASE" = "true" ]; then
  echo "🌱 Seeding database..."
  npm run db:seed
fi

# 6. Build (if TypeScript)
# npm run build

# 7. Restart application
echo "🔄 Restarting application..."
pm2 reload ecosystem.config.js --env production

# 8. Health check
echo "🏥 Running health check..."
sleep 5
curl -f http://localhost:3000/health || exit 1

echo "✅ Deployment completed successfully!"