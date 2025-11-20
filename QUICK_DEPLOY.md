# 快速部署到 GitHub

## 方法 1：使用自动化脚本（最简单）

运行部署脚本：

```bash
./deploy_to_github.sh
```

脚本会引导你完成整个过程。

## 方法 2：手动部署

### 步骤 1：在 GitHub 上创建仓库

1. 访问：https://github.com/new
2. **Repository name**: `branch-aware-workflow-scheduler`
3. **Description**: `Branch-Aware, Multi-Tenant Workflow Scheduler for Large-Image Inference`
4. **Visibility**: 选择 **Public**（项目要求）
5. **重要**: 不要勾选 "Add a README file"（我们已有 README）
6. 点击 **"Create repository"**

### 步骤 2：推送代码

在项目目录下运行以下命令（替换 `YOUR_USERNAME` 为你的 GitHub 用户名）：

```bash
# 添加远程仓库
git remote add origin https://github.com/YOUR_USERNAME/branch-aware-workflow-scheduler.git

# 推送到 GitHub
git push -u origin main
```

### 如果遇到认证问题

如果提示需要认证，使用 Personal Access Token：

1. 访问：https://github.com/settings/tokens
2. 点击 "Generate new token (classic)"
3. 选择 `repo` 权限
4. 生成并复制 token
5. 推送时，用户名输入你的 GitHub 用户名，密码输入 token

### 验证部署

1. 访问你的仓库：`https://github.com/YOUR_USERNAME/branch-aware-workflow-scheduler`
2. 确认所有文件都已上传
3. 确认 README.md 显示正确

## 完成！

你的项目现在已经部署到 GitHub 了！🎉

