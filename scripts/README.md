# scripts

Utility scripts for server management.

## Files

- `restart*.ps1/sh` - Restart server scripts
- `stop.ps1/sh` - Stop server scripts

## Usage

```bash
# Windows PowerShell
.\scripts\restart127.0.0.1.ps1

# Windows Batch: force-restart standalone TypeScript server on 127.0.0.1:39866
.\scripts\restart-standalone-ts-server.bat

# Linux/macOS
./scripts/restart.sh
```
