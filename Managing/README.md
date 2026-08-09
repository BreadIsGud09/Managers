# Quanlyhocsinh

Hãy tạo một ứng dụng web quản lý học sinh bằng tiếng Việt cho 3 lớp: Piano, Múa, và Vẽ. Giao diện hiện đại, dễ dùng trên cả điện thoại và máy tính.

1. Quản lý dữ liệu học sinh:

Cho phép thêm/sửa/xóa học sinh với các trường: Tên học sinh, Tuổi, Lớp học (Piano/Múa/Vẽ), Học phí, Ngày bắt đầu, Ngày kết thúc, Trạng thái (Đang học / Nghỉ phép / Bảo lưu).

Logic bảo lưu: Khi chuyển trạng thái sang 'Bảo lưu', hệ thống tự động cộng thêm số ngày bảo lưu vào 'Ngày kết thúc'.

2. Thời khóa biểu & Điểm danh:

Lịch học trực quan theo tuần cho cả 3 lớp.

Sổ điểm danh theo ngày: Tích chọn Đi học, Nghỉ có phép, Nghỉ không phép.

3. Hệ thống thông báo kép (Hệ thống & Telegram):

Trên App: Tạo một tab 'Thông báo' hiển thị danh sách học sinh sắp hết hạn học phí (trước 5 ngày dựa trên Ngày kết thúc) và lịch học trong ngày.

Qua Telegram: Tích hợp tính năng cấu hình Telegram Bot Token và Chat ID của nhóm. Tạo một nút 'Gửi thông báo Telegram'. Khi bấm vào, hệ thống sẽ tự động soạn tin nhắn tiếng Việt (Ví dụ: 'Nhắc nhở: Lớp [Tên lớp] có lịch học vào lúc...' hoặc 'Học sinh [Tên] sắp đến hạn đóng học phí') và gửi thẳng vào nhóm Telegram thông qua Telegram Bot API."*

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6d4d879c-9d6c-4860-8a38-60157332325a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
