# Sketch Flow backend

## Linux / EC2: `better-sqlite3` “Could not locate the bindings file”

`better-sqlite3` ships a **native addon** (`.node`). It must be built or downloaded for **the same OS, CPU architecture, and major Node version** as the machine that runs `pnpm dev`.

### Typical causes

1. **`node_modules` copied from a Mac or another arch** — always install on the server.
2. **No C++ build toolchain** — the package must compile when no prebuild exists (common on **Node 24** + **linux/arm64**).

### Fix on the EC2 instance

**1. Install build tools**

- **Amazon Linux 2023**: `sudo dnf install -y gcc-c++ make python3`
- **Amazon Linux 2**: `sudo yum groupinstall -y "Development Tools" && sudo yum install -y python3`

**2. Reinstall dependencies on that machine** (from `backend/`):

```bash
rm -rf node_modules
pnpm install
```

**3. If it still fails, force a native rebuild**

```bash
pnpm rebuild better-sqlite3
```

**4. Prefer Node 22 LTS on the server** (matches `Dockerfile` and often gets prebuilt binaries):

```bash
# example with nvm
nvm install 22
nvm use 22
rm -rf node_modules
pnpm install
```

You do **not** need Bun; the backend uses **pnpm** only.

### Alternative: Docker

The repo `Dockerfile` installs compilers and rebuilds `better-sqlite3` inside the image — useful if you want to avoid tuning the host.
