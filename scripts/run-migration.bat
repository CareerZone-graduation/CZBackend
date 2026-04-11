@echo off
echo Running migration: Convert NEUTRAL jobs to PENDING...
node migrate-neutral-to-pending.js
pause
