# 一键部署脚本
# 用法: .\deploy.ps1
# 1. 本地构建 Docker 镜像
# 2. 导出为 tar
# 3. scp 传到服务器
# 4. SSH 加载并重启
# 5. 清理临时文件

$SERVER = "ubuntu@203.195.208.172"
$REMOTE_DIR = "/home/ubuntu/个人网站"
$IMAGE_NAME = "qzsite:latest"
$TAR_FILE = "qzsite.tar"

Write-Host "=== Step 1/5: Building image ===" -ForegroundColor Green
docker build -t $IMAGE_NAME .
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed!" -ForegroundColor Red; exit 1 }

Write-Host "=== Step 2/5: Saving image to tar ===" -ForegroundColor Green
docker save $IMAGE_NAME -o $TAR_FILE

Write-Host "=== Step 3/5: Uploading to server ===" -ForegroundColor Green
scp $TAR_FILE "${SERVER}:${REMOTE_DIR}/"

Write-Host "=== Step 4/5: Loading and restarting on server ===" -ForegroundColor Green
ssh $SERVER "cd ${REMOTE_DIR} && docker load -i ${TAR_FILE} && docker compose up -d && rm ${TAR_FILE}"

Write-Host "=== Step 5/5: Cleaning up local tar ===" -ForegroundColor Green
Remove-Item $TAR_FILE -Force

Write-Host "=== Deploy complete! ===" -ForegroundColor Green
Write-Host "Visit: http://203.195.208.172"
