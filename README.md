# Messenger Premium

<p align="center">
  <img src="icon.png" width="64" height="64" alt="Messenger Premium" />
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

Ứng dụng Messenger Desktop cho Windows — chạy trên nhân Chrome (Chromium).

> Vì Meta đã ngừng hỗ trợ Messenger trên Windows, ứng dụng này sử dụng Electron để đóng gói giao diện web Messenger thành một app desktop chuyên nghiệp.

## ✨ Tính năng

- 💬 **Giao diện Messenger đầy đủ** — Chat, gọi video, gửi file, sticker, reaction...
- 🔔 **Thông báo Windows** — Nhận tin nhắn ngay trên Action Center
- 🔢 **Badge count** — Hiển thị số tin nhắn chưa đọc trên Taskbar
- 📌 **System Tray** — Thu nhỏ xuống khay hệ thống, chạy nền liên tục
- ⌨️ **Phím tắt toàn cục** — `Ctrl+Shift+M` để mở/ẩn nhanh
- 🎨 **Giao diện Dark Glass** — Phong cách tối sang trọng, ẩn các thành phần thừa của Facebook
- 🚀 **Khởi động cùng Windows** — Tùy chọn bật/tắt
- 🔒 **Chống chạy trùng lặp** — Chỉ cho phép 1 cửa sổ duy nhất
- 💾 **Nhớ vị trí cửa sổ** — Mở lại đúng chỗ bạn để lần trước
- 📋 **Menu chuột phải tiếng Việt** — Sao chép, dán, lưu ảnh, mở liên kết...

## 🛠️ Cài đặt

### Yêu cầu
- [Node.js](https://nodejs.org/) phiên bản LTS (20.x trở lên)

### Chạy thử
```bash
npm install
npm start
```

### Build file .exe
```bash
# Tạo file cài đặt (.exe)
npm run build

# Hoặc tạo bản portable (không cần cài đặt)
npm run build:portable
```

File cài đặt sẽ xuất hiện trong thư mục `dist/`.

## ⌨️ Phím tắt

| Phím tắt | Chức năng |
|---|---|
| `Ctrl+Shift+M` | Mở / Ẩn cửa sổ Messenger |
| `F12` | Mở Developer Tools |
| `Ctrl+R` | Tải lại trang |

## 📂 Cấu trúc dự án

| File | Mô tả |
|------|-------|
| `main.js` | Tiến trình chính (Electron) |
| `preload.js` | Cầu nối giữa web và app |
| `custom_style.css` | Giao diện tùy biến |
| `icon.png` | Biểu tượng ứng dụng |
| `package.json` | Cấu hình dự án |

## 🎨 Tùy biến giao diện

Chỉnh sửa file `custom_style.css` để thay đổi giao diện theo ý bạn:

- **Đổi màu nền**: Tìm `background-color: #0a0e1a` và thay bằng mã màu mong muốn
- **Độ mờ kính**: Thay đổi giá trị `blur()` trong `backdrop-filter`
- **Ẩn/hiện thành phần**: Dùng `display: none !important` cho bất kỳ phần tử nào

## ⚠️ Lưu ý

- Ứng dụng sử dụng giao diện web chính thức của Facebook — **không vi phạm bảo mật**
- Tất cả tin nhắn vẫn được mã hóa đầu cuối (E2EE)
- Chỉ sử dụng cho mục đích cá nhân

---

### ❤️ Ủng hộ

Nếu bạn thấy dự án hữu ích, hãy cân nhắc [ủng hộ truong.it](https://nct88.github.io/portfolio/donate/) để tôi tiếp tục tạo ra những sản phẩm giá trị cho cộng đồng.

---

*Bản quyền © 2026 bởi truong.it. Phát triển với đam mê.*
