# 前端测试指南

## 前端页面结构

前端页面包含以下部分：
1. **用户ID输入** - 用于多租户隔离
2. **WebSocket连接按钮** - 连接实时进度更新
3. **创建工作流表单** - 创建包含多个任务的工作流
4. **我的工作流列表** - 显示所有工作流及其状态
5. **进度显示区域** - 显示实时进度和结果

## 完整测试流程

### 步骤1: 基本设置

1. **打开前端页面**
   - 访问 `http://localhost:8000`
   - 应该看到 "Branch-Aware Workflow Scheduler" 标题

2. **设置用户ID**
   - 在 "User ID" 输入框中输入用户ID（例如：`user-1`）
   - 点击 "Connect" 按钮连接WebSocket
   - 在 "Progress" 区域应该显示 "WebSocket connected"

### 步骤2: 创建简单工作流（单任务）

1. **填写工作流信息**
   - 在 "Workflow Name" 输入框中输入：`Test Cell Segmentation`
   - 点击 "Add Job" 按钮添加一个任务

2. **填写任务信息**
   - Job ID: `job-1`（或留空自动生成）
   - Job Type: 选择 `Cell Segmentation`
   - Image Path: 输入 `Aperio SVS/CMU-1-Small-Region.svs`（使用小文件测试）
   - Branch: 输入 `branch-1`
   - Depends On: 留空（无依赖）

3. **提交工作流**
   - 点击 "Submit Workflow" 按钮
   - 应该看到成功提示："Workflow created successfully!"
   - 表单会清空，工作流出现在 "My Workflows" 区域

4. **观察执行过程**
   - 在 "My Workflows" 区域，你应该看到：
     - 工作流名称和状态（RUNNING）
     - 进度条（从0%开始增长）
     - 任务状态（PENDING → RUNNING → SUCCEEDED）
   - 进度每2秒自动刷新
   - WebSocket会实时推送进度更新

5. **查看结果**
   - 等待任务完成（状态变为 SUCCEEDED）
   - 点击 "View Jobs" 展开任务详情
   - 点击 "View Results" 按钮查看分割结果
   - 在 "Progress" 区域会显示：
     - 检测到的细胞数量
     - 处理方式
     - 样本细胞数据
     - 下载链接

### 步骤3: 创建复杂工作流（多任务，有依赖）

1. **创建工作流**
   - Workflow Name: `Multi-Job Workflow`

2. **添加第一个任务**
   - Job ID: `job-1`
   - Job Type: `Cell Segmentation`
   - Image Path: `Aperio SVS/CMU-1-Small-Region.svs`
   - Branch: `branch-1`
   - Depends On: 留空

3. **添加第二个任务**
   - 点击 "Add Job" 添加第二个任务
   - Job ID: `job-2`
   - Job Type: `Tissue Mask`
   - Image Path: `Aperio SVS/CMU-1-Small-Region.svs`
   - Branch: `branch-1`
   - Depends On: `job-1`（依赖第一个任务）

4. **提交并观察**
   - 提交工作流
   - 观察：job-1 先执行，job-2 等待 job-1 完成后才开始
   - 这验证了依赖关系功能

### 步骤4: 测试分支感知调度

1. **创建两个不同分支的工作流**
   - 使用用户 `user-1` 创建一个工作流，任务在 `branch-1`
   - 使用用户 `user-1` 创建另一个工作流，任务在 `branch-2`
   - 观察：不同分支的任务可以并行执行

2. **创建同一分支的多个任务**
   - 在同一工作流中添加多个 `branch-1` 的任务
   - 观察：同一分支的任务串行执行（一个接一个）

### 步骤5: 测试多租户隔离

1. **使用不同用户**
   - 在浏览器中打开两个标签页
   - 标签页1：用户ID = `user-1`
   - 标签页2：用户ID = `user-2`

2. **创建各自的工作流**
   - 每个用户创建自己的工作流
   - 验证：每个用户只能看到自己的工作流

### 步骤6: 测试活跃用户限制

1. **测试3个用户限制**
   - 打开4个浏览器标签页
   - 分别使用 `user-1`, `user-2`, `user-3`, `user-4`
   - 每个用户都创建工作流
   - 观察：前3个用户的工作流立即开始执行
   - 第4个用户的工作流会等待，直到前3个用户中有一个完成所有任务

## 预期效果

### 正常情况下的显示

1. **工作流列表**
   - 显示工作流名称、ID、状态
   - 显示进度条（0-100%）
   - 显示任务完成数/总任务数
   - 状态标签颜色：
     - PENDING: 橙色
     - RUNNING: 蓝色
     - SUCCEEDED: 绿色
     - FAILED: 红色

2. **任务详情**
   - 点击 "View Jobs" 展开
   - 显示每个任务的：
     - Job ID
     - Job Type
     - 状态
     - 进度百分比
   - 完成的任务有 "View Results" 按钮

3. **实时进度更新**
   - 进度条实时增长
   - WebSocket推送更新
   - 每2秒自动刷新工作流列表

4. **结果查看**
   - 显示检测到的细胞数量
   - 显示处理方式（direct 或 tiled）
   - 显示样本细胞数据（JSON格式）
   - 提供下载链接

## 常见问题排查

1. **WebSocket连接失败**
   - 检查后端是否运行
   - 检查用户ID是否已输入
   - 查看浏览器控制台错误信息

2. **工作流创建失败**
   - 检查图像路径是否正确
   - 检查用户ID是否已输入
   - 查看浏览器控制台错误信息

3. **任务一直PENDING**
   - 检查是否有活跃用户限制
   - 检查任务依赖是否满足
   - 查看后端日志

4. **进度不更新**
   - 检查WebSocket是否连接
   - 检查任务是否真正在执行
   - 查看后端日志

## 测试检查清单

- [ ] 前端页面正常加载
- [ ] WebSocket连接成功
- [ ] 可以创建单任务工作流
- [ ] 可以创建多任务工作流
- [ ] 任务依赖关系正确执行
- [ ] 进度实时更新
- [ ] 可以查看任务结果
- [ ] 多租户隔离正常工作
- [ ] 活跃用户限制正常工作
- [ ] 分支感知调度正常工作

