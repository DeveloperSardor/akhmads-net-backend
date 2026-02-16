#!/bin/bash

set -e

if [ -z "$1" ]; then
  echo "Usage: ./restore.sh <backup_date>"
  echo "Example: ./restore.sh 20260207_120000"
  exit 1
fi

BACKUP_DIR="/var/backups/akhmads"
DATE=$1

echo "🔄 Restoring backup from $DATE..."

# Restore PostgreSQL
gunzip < $BACKUP_DIR/postgres_$DATE.sql.gz | docker exec -i akhmads-postgres psql -U akhmads akhmads_prod

# Restore Redis
docker cp $BACKUP_DIR/redis_$DATE.rdb akhmads-redis:/data/dump.rdb
docker restart akhmads-redis

# Restore MinIO
docker cp $BACKUP_DIR/minio_$DATE.tar.gz akhmads-minio:/data/backup.tar.gz
docker exec akhmads-minio tar xzf /data/backup.tar.gz -C /

echo "✅ Restore completed!"