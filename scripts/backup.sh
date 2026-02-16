#!/bin/bash

set -e

BACKUP_DIR="/var/backups/akhmads"
DATE=$(date +%Y%m%d_%H%M%S)

echo "💾 Creating backup..."

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
docker exec akhmads-postgres pg_dump -U akhmads akhmads_prod | gzip > $BACKUP_DIR/postgres_$DATE.sql.gz

# Backup Redis
docker exec akhmads-redis redis-cli --rdb /data/dump.rdb
docker cp akhmads-redis:/data/dump.rdb $BACKUP_DIR/redis_$DATE.rdb

# Backup MinIO
docker exec akhmads-minio tar czf /data/backup.tar.gz /data
docker cp akhmads-minio:/data/backup.tar.gz $BACKUP_DIR/minio_$DATE.tar.gz

# Delete old backups (keep last 7 days)
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete
find $BACKUP_DIR -name "*.rdb" -mtime +7 -delete

echo "✅ Backup completed: $BACKUP_DIR"