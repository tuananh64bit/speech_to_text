# Bilingual Speech-to-Text & Translation Web App 🎙️🌐

Một ứng dụng web thời gian thực (Real-time Web App) cho phép chuyển đổi Giọng Nào (Speech-to-Text) và Dịch thuật ngay lập tức (Translation). Dự án sử dụng WebSocket để xử lý luồng âm thanh trực tiếp với độ trễ cực thấp.

## Tính năng chính
- 🎤 **Real-time Speech-to-Text:** Nhận dạng giọng nói tiếng Anh, tiếng Hàn và tiếng Trung theo thời gian thực sử dụng API của **Deepgram**.
- 🌍 **Dịch thuật tự động:** Dịch văn bản vừa nhận dạng sang **Tiếng Việt** sử dụng **Google Translate Unofficial API** (hoàn toàn miễn phí, không giới hạn).
- ⚡ **Siêu tốc với WebSocket:** Xử lý âm thanh trực tiếp (streaming) thay vì thu âm toàn bộ rồi mới gửi đi.
- 🎨 **Giao diện hiện đại (UI/UX):** Phong cách thiết kế Glassmorphism, có Dark Mode và các hiệu ứng micro-animations.
- 🐳 **Docker Ready:** Được cung cấp sẵn `Dockerfile` và `docker-compose.yml` để dễ dàng triển khai (multi-stage build với Nginx).

## Công nghệ sử dụng
- **Frontend Core:** HTML5, Vanilla JavaScript, CSS3
- **Build Tool:** Vite.js
- **APIs:** 
  - Deepgram (Streaming Speech-to-Text)
  - Google Translate API (Dịch thuật)
- **Deployment:** Docker, Nginx

## Cài đặt và Chạy ở Local (Môi trường phát triển)

### 1. Yêu cầu hệ thống
- Node.js (phiên bản 18 trở lên)
- Một tài khoản Deepgram để lấy API Key (truy cập [Deepgram Console](https://console.deepgram.com/)).

### 2. Khởi tạo dự án
Clone dự án về máy:
```bash
git clone https://github.com/phungtuananh/speech_to_text.git
cd speech_to_text
```

Cài đặt các gói phụ thuộc:
```bash
npm install
```

### 3. Cấu hình Biến môi trường
Tạo file `.env` ở thư mục gốc của dự án và chèn Deepgram API Key của bạn vào:
```env
VITE_DEEPGRAM_API_KEY=your_deepgram_api_key_here
```
*(Nếu không điền trong `.env`, bạn vẫn có thể nhập trực tiếp trên giao diện của ứng dụng khi sử dụng)*

### 4. Chạy ứng dụng
```bash
npm run dev
```
Truy cập ứng dụng tại `http://localhost:5173`.

## Hướng dẫn Deploy lên VPS bằng Docker
Dự án được cấu hình sẵn để dễ dàng deploy lên bất kỳ VPS nào có cài đặt Docker & Docker Compose.

1. Bật Terminal/Cmd và copy bộ mã nguồn lên VPS (loại trừ node_modules):
```bash
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'dist' -e ssh ./ root@<IP_VPS>:/opt/speech_to_text/
```

2. Đăng nhập vào VPS và chạy Docker Compose:
```bash
ssh root@<IP_VPS>
cd /opt/speech_to_text
docker-compose up -d --build
```

Ứng dụng của bạn sẽ được Nginx phục vụ hoàn chỉnh qua Cổng `80` (http://<IP_VPS>).

## Bản quyền
Dự án được viết và tinh chỉnh phục vụ cho mục đích học tập/đồ án. Phát hành miễn phí.
