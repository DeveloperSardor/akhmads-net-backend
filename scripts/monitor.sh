#!/bin/bash

# Simple monitoring script
while true; do
  echo "========== $(date) =========="
  
  # Check health
  curl -s http://localhost:3000/health | jq .
  
  # Check containers
  docker ps --filter "name=akhmads" --format "table {{.Names}}\t{{.Status}}"
  
  # Check disk space
  df -h | grep -E '(Filesystem|/dev/)'
  
  # Check memory
  free -h
  
  echo ""
  sleep 60
done