# Messlỏ

<p align="center">
  <img src="icon.png" width="64" height="64" alt="Messlỏ" />
</p>

<p align="center">
  <strong>Nguyễn Công Trường</strong><br>
  Digital Marketing Specialist · Retail Operations · Open Source Developer
</p>

<p align="center">
  <a href="https://nct88.github.io/portfolio/">🌐 Portfolio</a> ·
  <a href="https://nct88.github.io/portfolio/donate/">❤️ Ủng hộ</a> ·
  <a href="https://t.me/congtruongit">💬 Telegram</a> ·
  <a href="https://fb.me/congtruongit">📘 Facebook</a>
</p>

---

**Messlỏ** là ứng dụng quản lý Messenger đa tài khoản (Multi-Account) chuyên nghiệp dành cho Windows — được xây dựng trên nhân Chromium siêu tốc và bảo mật.

<p align="center">
  <img src="preview.png" alt="Messlỏ Preview" style="max-width: 100%; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);"/>
</p>

## ✨ Tính năng nổi bật (Bản cập nhật Multi-Account)

- 👥 **Quản lý Đa Tài Khoản (Multi-Account)** — Đăng nhập và sử dụng nhiều tài khoản Messenger cùng lúc.
- 🔄 **Chuyển Nick Siêu Nhanh** — Chuyển đổi giữa các tài khoản chỉ với 1 click qua thanh Sidebar chuyên dụng.
- 🛡️ **Cô lập Dữ liệu (Sandbox Partitions)** — Mỗi nick sử dụng một Session riêng biệt (Cookies, Cache, LocalStorage tách biệt hoàn toàn), không bao giờ bị dính tài khoản hay block chéo.
- 🖼️ **Auto-Fetch Ảnh Đại Diện** — Công cụ thông minh tự động bắt ảnh avatar từ HTML DOM của Messenger để hiển thị lên Sidebar mà không sợ bị Facebook Graph API chặn.
- 🔔 **Thông báo & Badge Độc Lập** — Nhận thông báo và số tin nhắn chưa đọc (Badge) cho TỪNG tài khoản riêng biệt.
- 🛠️ **Giao diện Quản lý (Modal UI)** — Thêm, Đổi tên, và Xóa tài khoản dễ dàng qua giao diện Modal cực kỳ trực quan và thanh lịch (Chuột phải vào Nick).
- 🚀 **Kiến trúc BrowserView Native** — Khung chat Messenger được chạy độc lập trên lớp native `BrowserView`, chống lỗi hiển thị đen thui của thẻ `<webview>` cũ, chạy mượt mà 100% phần cứng.
- 🎨 **Tối ưu Hóa Giao Diện** — Sidebar tùy chỉnh thu gọn, hỗ trợ Dark/Light mode đồng bộ.
- 🔒 **Khóa Mã Nguồn** — Khóa hoàn toàn DevTools (`F12`) trên bản build Production để bảo vệ bản quyền giao diện.

## 🛠️ Cài đặt & Sử dụng

### Yêu cầu
- [Node.js](https://nodejs.org/) phiên bản LTS (20.x trở lên)

### Chạy thử môi trường Dev
```bash
npm install
npm start
```

### Build phần mềm (.exe)
```bash
# Tạo file cài đặt (.exe)
npm run build

# Hoặc tạo bản portable (không cần cài đặt)
npm run build:portable
```

File thành phẩm sẽ xuất hiện trong thư mục `dist/`.

## 📂 Cấu trúc dự án

| File / Thư mục | Chức năng |
|------|-------|
| `main.js` | Quản lý vòng đời App, Hệ thống Partitions, BrowserView, IPC. |
| `renderer.js` | Logic điều khiển Sidebar đa tài khoản, Modal UI. |
| `index.html` | Khung Sidebar & Modal Overlay. |
| `preload.js` | Cầu nối an toàn bảo mật giữa DOM và Backend. |
| `custom_style.css`| Giao diện Dark Glass và ẩn quảng cáo Facebook. |
| `preview.png` | Ảnh Dummy giao diện hiển thị. |

## ⚠️ Lưu ý Bảo mật & Giới hạn
- Mọi dữ liệu (Session, Cookies) được mã hóa và lưu tại `AppData` của máy cá nhân. Messlỏ **KHÔNG** gửi bất kỳ dữ liệu nhạy cảm nào ra máy chủ bên ngoài.
- Dự án này đã sẵn sàng để phát triển thêm module check Server Key hoặc cấu hình Proxy tĩnh riêng cho mỗi nick (Phục vụ thương mại hóa/Nuôi nick số lượng lớn).

---

### ❤️ Ủng hộ tác giả

Nếu bạn thấy công cụ quản lý siêu tốc này giúp ích cho công việc của bạn, hãy cân nhắc [ủng hộ truong.it](https://nct88.github.io/portfolio/donate/) để tiếp thêm động lực cho mình duy trì và nâng cấp nhé!

---

*Bản quyền © 2026 bởi truong.it. Phát triển với đam mê.*

