# 部署指南

本指南帮助你在腾讯云服务器上部署 QZ Site 个人网站项目。

---

## 一、服务器准备

你需要一台腾讯云服务器（推荐 Ubuntu 22.04 或更高版本），并确保以下端口已开放：

| 端口 | 用途 |
|------|------|
| 22   | SSH 远程登录 |
| 80   | HTTP 网站访问 |
| 443  | HTTPS 安全访问 |

### 1.1 安装 Docker

通过 SSH 登录服务器后，执行以下命令安装 Docker：

```bash
# 更新系统包
sudo apt update && sudo apt upgrade -y

# 安装 Docker
curl -fsSL https://get.docker.com | sh

# 将当前用户加入 docker 组（这样不用每次都加 sudo）
sudo usermod -aG docker $USER

# 使组权限立即生效
newgrp docker

# 验证安装
docker --version
```

### 1.2 配置 Docker 镜像加速（国内服务器必须）

国内服务器访问 Docker Hub 很慢，需要配置镜像加速：

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json << 'EOF'
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me"
  ]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
```

### 1.3 安装 Docker Compose

Docker 安装完成后，Docker Compose 通常已经自带。验证一下：

```bash
docker compose version
```

如果提示找不到命令，手动安装：

```bash
sudo apt install docker-compose-plugin -y
```

---

## 二、GitHub Secrets 配置

GitHub Actions 需要一些密钥才能自动部署到你的服务器。这些密钥存在 GitHub 仓库的 Secrets 里，安全且加密。

### 2.1 需要配置的 Secrets

在你的 GitHub 仓库页面，进入 **Settings → Secrets and variables → Actions**，点击 **New repository secret**，添加以下 4 个：

| Secret 名称 | 说明 | 示例值 |
|-------------|------|--------|
| `SERVER_HOST` | 服务器公网 IP 地址 | `203.195.208.172` |
| `SERVER_USER` | 服务器登录用户名 | `ubuntu` |
| `SERVER_SSH_KEY` | 服务器 SSH 私钥 | （见下方生成方法） |
| `SERVER_APP_DIR` | 项目在服务器上的目录 | `/home/ubuntu/个人网站` |

### 2.2 生成 SSH 密钥对（在 Windows 上操作）

这一步的目的是让 GitHub Actions 能自动登录你的服务器。原理：你在本地生成一对钥匙（公钥 + 私钥），公钥放到服务器上，私钥放到 GitHub Secrets 里。

在 Windows 上打开 **PowerShell**，执行：

```powershell
# 生成密钥对（一路回车，不设密码）
ssh-keygen -t ed25519 -C "github-actions" -f $env:USERPROFILE\.ssh\github-actions
```

这会在 `C:\Users\你的用户名\.ssh\` 下生成两个文件：
- `github-actions` — 私钥（给 GitHub Secrets 用）
- `github-actions.pub` — 公钥（放到服务器上）

### 2.3 把公钥放到服务器

方法一：用命令直接复制（推荐）

```powershell
# 把公钥追加到服务器的授权文件中
type $env:USERPROFILE\.ssh\github-actions.pub | ssh ubuntu@你的服务器IP "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

方法二：手动操作

1. 在 PowerShell 中查看公钥内容：
   ```powershell
   Get-Content $env:USERPROFILE\.ssh\github-actions.pub
   ```
2. 复制输出的内容
3. SSH 登录服务器，执行：
   ```bash
   mkdir -p ~/.ssh
   echo "粘贴刚才复制的公钥内容" >> ~/.ssh/authorized_keys
   ```

### 2.4 把私钥放到 GitHub Secrets

在 PowerShell 中查看私钥内容：

```powershell
Get-Content $env:USERPROFILE\.ssh\github-actions
```

复制从 `-----BEGIN OPENSSH PRIVATE KEY-----` 到 `-----END OPENSSH PRIVATE KEY-----` 的**全部内容**（包括这两行），粘贴到 GitHub 的 `SERVER_SSH_KEY` Secret 中。

### 2.5 验证 SSH 连接

在 PowerShell 中测试：

```powershell
ssh -i $env:USERPROFILE\.ssh\github-actions ubuntu@你的服务器IP
```

如果能成功登录服务器，说明配置正确。

---

## 三、首次部署

### 3.1 在服务器上创建项目目录

SSH 登录服务器后：

```bash
mkdir -p /home/ubuntu/个人网站
cd /home/ubuntu/个人网站
```

### 3.2 上传部署文件

服务器上不需要源码，只需要 `docker-compose.yml`、`.env` 和 `nginx/` 配置。

在 Windows PowerShell 中执行：

```powershell
# 上传 docker-compose.yml
scp docker-compose.yml ubuntu@你的服务器IP:"/home/ubuntu/个人网站/"

# 上传 nginx 配置
scp -r nginx ubuntu@你的服务器IP:"/home/ubuntu/个人网站/"
```

### 3.3 创建 .env 文件

SSH 登录服务器后：

```bash
cd /home/ubuntu/个人网站
cat > .env << 'EOF'
DB_NAME=blog
DB_USER=blog
DB_PASSWORD=替换为一个强密码
SESSION_SECRET=替换为32位以上随机字符串
NEXT_PUBLIC_SITE_URL=http://你的服务器IP
NEXT_PUBLIC_GITHUB_URL=https://github.com/666666999999666
EOF
```

> **生成随机密码的方法**（在服务器上执行）：
> ```bash
> openssl rand -base64 32
> ```

### 3.4 首次构建并启动

首次部署需要手动构建镜像（后续由 CI/CD 自动完成）：

```bash
cd /home/ubuntu/个人网站

# 从 GitHub 克隆源码（仅首次需要）
git clone https://github.com/666666999999666/Site.git src

# 构建镜像
docker compose build web

# 启动所有服务
docker compose up -d
```

> **注意**：首次构建在 2核4G 服务器上大约需要 5-8 分钟，构建期间服务器可能响应缓慢，这是正常现象。

查看运行状态：

```bash
docker compose ps
```

所有服务应该显示 `running` 或 `healthy`。

### 3.5 验证网站

在浏览器中访问 `http://你的服务器IP`，应该能看到网站首页。

---

## 四、CI/CD 自动部署

### 4.1 前提条件

确保已完成第二步的 GitHub Secrets 配置，然后推送代码即可触发自动部署。

### 4.2 部署流程

```
git push → GitHub Actions 构建镜像 → gzip 压缩 → SSH 管道传输到服务器 → docker load 加载 → docker compose up -d 重启
```

**关键优势**：
- 构建在 GitHub Actions 上完成（2分钟），不在服务器上构建
- 镜像通过 SSH 管道直接传输，不经过 ghcr.io（避免国内拉取慢的问题）
- 服务器只需加载镜像并重启（秒级完成）
- 使用 gzip 压缩传输，减少约 60% 传输量

### 4.3 日常更新

1. 在本地修改代码
2. 提交并推送到 GitHub：
   ```powershell
   git add .
   git commit -m "描述你改了什么"
   git push
   ```
3. GitHub Actions 会自动完成：构建新镜像 → 传输到服务器 → 重启服务

你可以在 GitHub 仓库的 **Actions** 页面查看部署进度和日志。

### 4.4 数据安全说明

每次部署只会更新 web 容器（你的 Next.js 应用），数据库容器不会被重建。
- 文章、Todo、设置等数据存在 `./data/postgres/` 目录（宿主机磁盘），不受容器更新影响
- 上传的图片存在 `./data/uploads/` 目录，同样不受影响
- `prisma db push` 只会添加新字段/新表，不会删除已有数据
- 即使万一出问题，自动备份（每天凌晨 4 点）也能恢复

---

## 五、HTTPS 配置（让网站更安全）

HTTPS 让你的网站显示小锁标志，数据传输加密。我们用 Let's Encrypt 免费证书。

### 5.1 安装 certbot

在服务器上执行：

```bash
sudo apt install certbot -y
```

### 5.2 申请证书

先确保域名已经指向服务器 IP（见第六步），然后：

```bash
# 停掉 nginx 容器，释放 80 端口
cd /home/ubuntu/个人网站
docker compose stop nginx

# 申请证书（把 yourdomain.com 换成你的域名）
sudo certbot certonly --standalone -d yourdomain.com

# 证书会保存在 /etc/letsencrypt/live/yourdomain.com/ 目录下
```

### 5.3 复制证书到项目目录

```bash
# 创建证书目录
mkdir -p /home/ubuntu/个人网站/nginx/certs

# 复制证书文件
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /home/ubuntu/个人网站/nginx/certs/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /home/ubuntu/个人网站/nginx/certs/

# 修改权限，让 nginx 容器能读取
sudo chmod 644 /home/ubuntu/个人网站/nginx/certs/*.pem
```

### 5.4 修改 nginx 配置支持 HTTPS

编辑 `/home/ubuntu/个人网站/nginx/conf.d/default.conf`，替换为以下内容：

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    client_max_body_size 10M;

    location /uploads/ {
        alias /var/www/uploads/;
        expires 7d;
        access_log off;
    }

    location / {
        proxy_pass http://web:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

> 记得把 `yourdomain.com` 替换成你的真实域名。

### 5.5 重启 nginx

```bash
cd /home/ubuntu/个人网站
docker compose up -d
```

浏览器访问 `https://你的域名`，确认有小锁标志。

### 5.6 设置证书自动续期

Let's Encrypt 证书有效期 90 天，需要定期续期。设置自动续期：

```bash
# 测试续期命令是否正常
sudo certbot renew --dry-run

# 添加定时任务
sudo crontab -e
```

在打开的文件末尾添加一行：

```
0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /home/ubuntu/个人网站/nginx/certs/ && cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /home/ubuntu/个人网站/nginx/certs/ && cd /home/ubuntu/个人网站 && docker compose restart nginx
```

> 这行配置的意思是：每天凌晨 3 点检查证书是否需要续期，如果续期成功就复制新证书并重启 nginx。

---

## 六、DNS 配置（让域名指向服务器）

1. 登录你的域名服务商（比如腾讯云、阿里云、Cloudflare）
2. 找到 DNS 解析设置
3. 添加一条 **A 记录**：

| 字段 | 值 |
|------|------|
| 主机记录 | `@`（代表根域名） |
| 记录类型 | A |
| 记录值 | 你的服务器公网 IP |
| TTL | 默认即可 |

4. 如果需要 `www.你的域名` 也能访问，再加一条：

| 字段 | 值 |
|------|------|
| 主机记录 | `www` |
| 记录类型 | CNAME |
| 记录值 | `你的域名` |
| TTL | 默认即可 |

5. 等待几分钟让 DNS 生效

> 验证 DNS 是否生效（在 PowerShell 中执行）：
> ```powershell
> nslookup 你的域名
> ```
> 如果返回的 IP 和你服务器 IP 一致，说明已生效。

---

## 七、数据备份

### 7.1 手动备份

在服务器上执行：

```bash
cd /home/ubuntu/个人网站

# 备份数据库
docker compose exec db pg_dump -U blog blog > backup_$(date +%Y%m%d_%H%M%S).sql

# 备份上传文件
tar czf uploads_backup_$(date +%Y%m%d_%H%M%S).tar.gz data/uploads/
```

### 7.2 自动备份（每天凌晨 4 点）

在服务器上创建备份脚本：

```bash
mkdir -p /home/ubuntu/backups
cat > /home/ubuntu/backups/backup.sh << 'SCRIPT'
#!/bin/bash
BACKUP_DIR="/home/ubuntu/backups"
APP_DIR="/home/ubuntu/个人网站"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 备份数据库
cd $APP_DIR
docker compose exec -T db pg_dump -U blog blog > "$BACKUP_DIR/db_$TIMESTAMP.sql"

# 备份上传文件
tar czf "$BACKUP_DIR/uploads_$TIMESTAMP.tar.gz" -C $APP_DIR data/uploads/

# 删除 7 天前的备份
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $TIMESTAMP"
SCRIPT

chmod +x /home/ubuntu/backups/backup.sh
```

添加定时任务：

```bash
crontab -e
```

在文件末尾添加：

```
0 4 * * * /home/ubuntu/backups/backup.sh >> /home/ubuntu/backups/backup.log 2>&1
```

### 7.3 恢复数据

```bash
# 恢复数据库
cd /home/ubuntu/个人网站
cat /home/ubuntu/backups/db_备份文件名.sql | docker compose exec -T db psql -U blog blog

# 恢复上传文件
cd /home/ubuntu/个人网站
tar xzf /home/ubuntu/backups/uploads_备份文件名.tar.gz
```

---

## 八、手动部署（备用方案）

如果 CI/CD 不可用，可以使用本地一键部署脚本：

```powershell
# 在项目根目录执行
.\deploy.ps1
```

该脚本会：本地构建镜像 → 保存为 tar → scp 上传到服务器 → 加载并重启

---

## 常见问题

### Q: 推送代码后 Actions 没有触发？

检查 `.github/workflows/deploy.yml` 中的分支名是否和你的默认分支一致（本项目使用 `main`）。

### Q: 网站打不开？

逐步排查：
```bash
cd /home/ubuntu/个人网站

# 查看容器状态
docker compose ps

# 查看 web 容器日志
docker compose logs web

# 查看 nginx 日志
docker compose logs nginx

# 查看数据库状态
docker compose logs db
```

### Q: 如何查看 GitHub Actions 构建日志？

进入 GitHub 仓库 → **Actions** 标签页 → 点击最近的 workflow run → 展开每个步骤查看日志。

### Q: 服务器上构建镜像太慢/卡死？

2核4G 服务器构建 Next.js 镜像需要 5-8 分钟，期间服务器可能响应缓慢。建议使用 CI/CD 自动部署（在 GitHub Actions 上构建），避免在服务器上构建。
