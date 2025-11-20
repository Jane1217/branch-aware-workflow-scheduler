#!/bin/bash
# GitHub Deployment Script
# This script helps you deploy the project to GitHub

echo "=========================================="
echo "GitHub Deployment Script"
echo "=========================================="
echo ""

# Check if remote already exists
if git remote get-url origin &>/dev/null; then
    echo "⚠️  Remote 'origin' already exists:"
    git remote get-url origin
    echo ""
    read -p "Do you want to update it? (y/n): " update_remote
    if [ "$update_remote" != "y" ]; then
        echo "Exiting. Please remove the existing remote manually if needed."
        exit 1
    fi
    git remote remove origin
fi

# Get GitHub username
echo "Please provide your GitHub username:"
read -p "GitHub Username: " github_username

if [ -z "$github_username" ]; then
    echo "❌ Error: GitHub username is required"
    exit 1
fi

# Repository name
repo_name="branch-aware-workflow-scheduler"
echo ""
echo "Repository name will be: $repo_name"
read -p "Use different name? (press Enter to use default, or type new name): " custom_name
if [ ! -z "$custom_name" ]; then
    repo_name="$custom_name"
fi

# Construct remote URL
remote_url="https://github.com/${github_username}/${repo_name}.git"

echo ""
echo "=========================================="
echo "Step 1: Create Repository on GitHub"
echo "=========================================="
echo ""
echo "Please follow these steps:"
echo "1. Open: https://github.com/new"
echo "2. Repository name: $repo_name"
echo "3. Description: Branch-Aware, Multi-Tenant Workflow Scheduler for Large-Image Inference"
echo "4. Set visibility to: PUBLIC"
echo "5. DO NOT check 'Initialize with README'"
echo "6. Click 'Create repository'"
echo ""
read -p "Press Enter after you've created the repository on GitHub..."

echo ""
echo "=========================================="
echo "Step 2: Adding Remote and Pushing"
echo "=========================================="
echo ""

# Add remote
echo "Adding remote: $remote_url"
git remote add origin "$remote_url"

if [ $? -ne 0 ]; then
    echo "❌ Failed to add remote"
    exit 1
fi

echo "✓ Remote added successfully"

# Push to GitHub
echo ""
echo "Pushing to GitHub..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ Success! Repository deployed to GitHub"
    echo "=========================================="
    echo ""
    echo "Repository URL: https://github.com/${github_username}/${repo_name}"
    echo ""
    echo "Next steps:"
    echo "1. Visit your repository: https://github.com/${github_username}/${repo_name}"
    echo "2. Verify all files are present"
    echo "3. Add repository topics (optional): fastapi, workflow-scheduler, multi-tenant"
    echo ""
else
    echo ""
    echo "❌ Push failed. Common issues:"
    echo "1. Repository not created on GitHub yet"
    echo "2. Authentication failed (use Personal Access Token)"
    echo "3. Network issues"
    echo ""
    echo "To retry manually:"
    echo "  git push -u origin main"
    echo ""
    exit 1
fi

