# Sử dụng image chính thức của Puppeteer (đã cài sẵn Node.js, Chromium và các thư viện cần thiết)
FROM ghcr.io/puppeteer/puppeteer:latest

# Puppeteer image mặc định dùng user 'pptruser'. Ta đổi sang root một chút để cài pnpm
USER root
RUN npm install -g pnpm@latest

# Đặt thư mục làm việc và cấp quyền cho pptruser
WORKDIR /app
RUN chown -R pptruser:pptruser /app

# Đổi lại user về pptruser để bảo mật
USER pptruser

# Copy package và cài đặt dependencies
COPY --chown=pptruser:pptruser package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy toàn bộ code
COPY --chown=pptruser:pptruser . .

# Expose port API
EXPOSE 5000

# Lệnh khởi chạy
CMD ["npm", "run", "dev"]
