# Sử dụng image chính thức của Puppeteer (đã cài sẵn Node.js, Chromium và các thư viện cần thiết)
FROM ghcr.io/puppeteer/puppeteer:latest

# Puppeteer image mặc định dùng user 'pptruser'. Ta đổi sang root một chút để cài pnpm
USER root
RUN npm install -g pnpm@latest

# Đặt thư mục làm việc và cấp quyền ngay từ đầu (lúc còn là root)
WORKDIR /app

# Ensure browser download is enabled in build and cache path is explicit.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV PUPPETEER_SKIP_DOWNLOAD=false
ENV PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer
RUN mkdir -p /home/pptruser/.pnpm-store /home/pptruser/.cache/puppeteer && \
    chown -R pptruser:pptruser /app /home/pptruser/.pnpm-store /home/pptruser/.cache

# Chuyển sang user pptruser ngay từ bây giờ
USER pptruser

# Copy file cấu hình với quyền pptruser luôn
COPY --chown=pptruser:pptruser package.json pnpm-lock.yaml ./

# Cài đặt dependencies với store nằm trong home của pptruser để tránh lỗi quyền trên một số môi trường BuildKit.
# RUN pnpm config set store-dir /home/pptruser/.pnpm-store && \
#     pnpm install --frozen-lockfile
# Cài đặt dependencies và cho phép chạy build script của các package cần thiết
RUN pnpm config set store-dir /home/pptruser/.pnpm-store && \
    pnpm install --frozen-lockfile --only-built-dependencies

# Download the exact Chrome version required by the installed Puppeteer package.
RUN pnpm exec puppeteer browsers install chrome

# Copy toàn bộ code còn lại với quyền pptruser
COPY --chown=pptruser:pptruser . .

# Expose port API
EXPOSE 5000

# Lệnh khởi chạy
CMD ["npm", "run", "prod"]
