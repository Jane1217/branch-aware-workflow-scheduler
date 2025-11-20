# GitHub Deployment Guide

This guide will help you deploy this project to GitHub.

## Prerequisites

- GitHub account
- Git installed on your machine
- GitHub CLI (optional, but recommended) or access to GitHub web interface

## Step 1: Create GitHub Repository

### Option A: Using GitHub Web Interface

1. Go to [GitHub](https://github.com) and sign in
2. Click the "+" icon in the top right corner
3. Select "New repository"
4. Repository name: `branch-aware-workflow-scheduler` (or your preferred name)
5. Description: "Branch-Aware, Multi-Tenant Workflow Scheduler for Large-Image Inference"
6. Set visibility to **Public** (as required by the project)
7. **DO NOT** initialize with README, .gitignore, or license (we already have these)
8. Click "Create repository"

### Option B: Using GitHub CLI

```bash
gh repo create branch-aware-workflow-scheduler \
  --public \
  --description "Branch-Aware, Multi-Tenant Workflow Scheduler for Large-Image Inference"
```

## Step 2: Add Remote and Push

After creating the repository, GitHub will show you the commands. Run these in your project directory:

```bash
# Add the remote repository (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/branch-aware-workflow-scheduler.git

# Push to GitHub
git push -u origin main
```

If you're using SSH:

```bash
git remote add origin git@github.com:YOUR_USERNAME/branch-aware-workflow-scheduler.git
git push -u origin main
```

## Step 3: Verify Deployment

1. Go to your repository on GitHub
2. Verify all files are present
3. Check that:
   - README.md is visible
   - All source code files are present
   - .gitignore is working (no large files like .svs, .zarr, etc.)
   - No sensitive files (like .env) are committed

## Step 4: Add Repository Topics (Optional but Recommended)

On your GitHub repository page:
1. Click the gear icon next to "About"
2. Add topics: `fastapi`, `workflow-scheduler`, `multi-tenant`, `instanseg`, `image-processing`, `python`

## Step 5: Update README with Repository Link

After deployment, update the README.md to include:
- Repository link
- Live demo link (if applicable)
- Any additional setup instructions

## Troubleshooting

### Authentication Issues

If you encounter authentication issues:

1. **HTTPS**: Use a Personal Access Token instead of password
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Generate a token with `repo` scope
   - Use token as password when pushing

2. **SSH**: Set up SSH keys
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   # Then add the public key to GitHub Settings → SSH and GPG keys
   ```

### Large Files Warning

If you see warnings about large files:
- Check `.gitignore` is working correctly
- Remove any accidentally committed large files:
  ```bash
  git rm --cached path/to/large/file
  git commit -m "Remove large file"
  git push
  ```

## Next Steps

After successful deployment:

1. **Add a LICENSE file** (if not already present)
2. **Set up GitHub Actions** for CI/CD (optional)
3. **Add badges** to README (build status, license, etc.)
4. **Create releases** for version tags

## Repository Structure Verification

Your repository should contain:
- ✅ All Python source files in `app/`
- ✅ Frontend files in `frontend/`
- ✅ Configuration files (Dockerfile, docker-compose.yml, requirements.txt)
- ✅ Documentation (README.md, TESTING_GUIDE.md)
- ✅ .gitignore (excluding large files and sensitive data)
- ❌ No .svs, .zarr, or other large image files
- ❌ No .env files or sensitive credentials

