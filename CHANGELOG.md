# Changelog

All notable changes to this project will be documented in this file.

## [1.3.0] - 2026-05-05
### Sửa lỗi nghiêm trọng
- **🔧 Sửa lỗi đăng nhập sai tài khoản (Session Isolation):** Khắc phục lỗi khi đăng nhập tài khoản A nhưng hiển thị tài khoản B. Nguyên nhân: cookies/session cũ của partition bị tái sử dụng khi tạo profile mới hoặc khi session bị lỗi.

### Tính năng mới
- **🔓 Nút "Đăng xuất & Đăng nhập lại":** Thêm nút đăng xuất trực tiếp trong modal chỉnh sửa tài khoản (click phải vào nick). Xóa sạch toàn bộ cookies, cache, localStorage, IndexedDB của profile đó và cho phép đăng nhập lại tài khoản khác ngay lập tức.
- **🧹 Tự động dọn session khi tạo profile mới:** Mỗi profile mới được tạo sẽ tự động xóa sạch session cũ (nếu có) trước khi mở trang đăng nhập, đảm bảo không bao giờ dùng lại cookie của tài khoản cũ.
- **🆔 ID Profile an toàn hơn:** Sử dụng `crypto.randomUUID()` thay vì `Date.now()` để tạo ID profile, tránh trùng lặp khi tạo nhiều nick liên tiếp.

### Cải tiến
- **Giao diện nút đăng xuất:** Thiết kế nút với icon, hiệu ứng hover, trạng thái loading (spinner) và phản hồi thành công/lỗi trực quan.
- **Xử lý logout toàn diện:** Khi đăng xuất, hệ thống sẽ: (1) Hủy BrowserView hiện tại, (2) Xóa sạch 8 loại storage data, (3) Xóa cache và auth cache, (4) Tạo lại BrowserView mới với session sạch.

## [1.2.1] - 2026-05-03
### Changed
- **Donate HWID-based:** Không còn mở trang donate mỗi lần khởi động. Kiểm tra HWID máy qua API, cache kết quả local. Chỉ hiện donate cho người chưa ủng hộ.
- **Dọn mã nguồn:** Loại bỏ file build cũ, ảnh demo khỏi thư mục gốc. Cấu trúc source sạch hơn.

## [1.2.0] - 2026-05-01
### Added
- **🔒 Khoá ứng dụng bằng PIN (App Lock):** Bảo mật tin nhắn với mã PIN 4 số. Hỗ trợ thiết lập/đổi/xoá PIN, tự động khoá sau thời gian idle (1/3/5/10/30 phút), khoá khi khởi động app, rate-limit 30s sau 5 lần sai. Giao diện PIN pad premium với animation pop/shake. Click nút 🔒 trên sidebar phải để khoá, click phải để mở cài đặt.
- **🔴 Badge riêng từng Profile:** Mỗi tài khoản trên sidebar trái hiển thị badge tin nhắn chưa đọc riêng biệt. Tự động đếm từ page title Messenger mỗi 3 giây. Tổng hợp badge hiển thị trên taskbar overlay.
- **Nút Khoá (🔒)** trên thanh công cụ bên phải.
- **Modal Cài đặt khoá:** Toggle bật/tắt, chọn thời gian auto-lock, đổi PIN, xoá PIN.
- **Hỗ trợ bàn phím** trên màn hình khoá: gõ số 0-9 và Backspace.
- **Idle Detection:** Phát hiện không hoạt động qua mousemove, keydown, scroll, touchstart để auto-lock.

## [1.1.1] - 2026-05-01
### Added
- **Thanh công cụ bên phải (Right Sidebar):** Tách riêng thanh công cụ sang phía bên phải giao diện, gồm: Trang chủ, Quay lại, Tải lại, Phóng to/Thu nhỏ, Chế độ tối/sáng, Toàn màn hình, Ghim cửa sổ.
- **Nút Trang chủ Messenger (Home):** Quay về trang chủ tin nhắn nhanh chóng khi đang ở các trang khác (trang cá nhân, nhóm, v.v.).
- **Nút Quay lại (Back):** Điều hướng quay lại trang trước đó trong lịch sử duyệt.
- **Cuộn danh sách tài khoản:** Hỗ trợ cuộn chuột (wheel), kéo chuột (drag), và nút mũi tên ▲▼ tự động hiện/ẩn khi danh sách nick tràn.

### Changed
- **Sidebar trái** chỉ chứa danh sách tài khoản (avatar) và nút Thêm tài khoản, tối ưu cho nhiều nick.
- **Ẩn scrollbar trang Messenger** bên trong BrowserView để giao diện gọn gàng hơn.
- Cập nhật `BrowserView` bounds để hỗ trợ layout 2 sidebar (trái 52px + phải 42px).

## [1.1.0] - 2026-04-30
### Added
- **Tính năng Bảo mật (Security Features):** 
  - Chặn hiển thị "Đã xem" (Block Read Receipts): Không cho người khác biết bạn đã đọc tin nhắn.
  - Chặn hiển thị "Đang nhập" (Block Typing Indicator): Ẩn trạng thái đang gõ phím của bạn.
  - Tích hợp trực tiếp vào Menu khay hệ thống (System Tray > Bảo mật), dễ dàng bật/tắt.
- **Tính năng Cập nhật tự động (Auto-Updater):**
  - Người dùng sẽ nhận được thông báo khi có bản cập nhật mới.
  - Cho phép tải về và cài đặt trực tiếp từ bên trong ứng dụng chỉ với một cú nhấp chuột, không cần tải thủ công file cài đặt mới.
  - Thêm nút "Kiểm tra cập nhật" trong Menu chuột phải ở khay hệ thống.

### Changed
- Cải thiện hệ thống bắt request mạng bằng `webRequest` API của Electron để can thiệp an toàn vào các tính năng bảo mật.
- Cấu hình lại `electron-builder` và `package.json` để hỗ trợ xuất bản và tải cập nhật từ GitHub Releases.
