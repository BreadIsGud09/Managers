# Sửa buổi còn lại, nâng cấp Tài chính & giao diện ô chọn

## 1. Danh sách học sinh — "Buổi còn lại"

Hiện mỗi lần điểm danh chỉ được tính là 1 buổi, nên học sinh học 2 giờ/ngày bị tính thiếu.
Sửa: mỗi ngày điểm danh "Đi học" sẽ được quy đổi theo số giờ của các ca trong đúng thứ đó (1 giờ = 1 buổi). Áp dụng cùng cách tính cho số buổi "Bảo lưu" (đang dùng để dời ngày kết thúc thực tế) và cho dữ liệu xuất Excel.

## 2. Trang Tài chính

### Lọc theo lớp
Thêm ô chọn lớp (Tất cả lớp / Piano / Múa / Vẽ). Khi chọn một lớp: thu học phí chỉ tính học sinh lớp đó, các khoản thu/chi nhập tay được gắn lớp (hoặc "Chung" nếu áp cho cả trung tâm) và lọc theo đó.

### Hai mục thu tách bạch
- **Thu học phí**: lấy tự động từ các khoản đóng học phí của học sinh trong tháng (đã liên kết danh sách học sinh).
- **Thu khác**: các khoản nhập tay.
Cả hai hiển thị riêng trong bảng tổng hợp và trong bảng chi tiết.

### Nhập khoản thu học phí
Nút "Thêm khoản" khi chọn loại **Thu học phí** sẽ hỏi trước:
- **Học phí khóa tiếp theo** → chọn lớp, rồi chọn tên học sinh trong danh sách lớp đó; hệ thống tự điền học phí, tên khóa (K kế tiếp), kỳ học (từ ngày – đến ngày) và ngày đóng mặc định là ngày bắt đầu khóa; cho sửa lại.
- **Học phí khóa mới** (học sinh đăng ký mới) → nhập thủ công: Tên học sinh, Lớp, Tên khóa, Kỳ học (từ ngày – đến ngày), Số tiền, Ngày đóng.
Khoản này được ghi vào phần Thu học phí của tháng chứa ngày đóng, hiển thị ngay trong tháng tương ứng.

### Khoản chi mặc định
Hộp thoại thêm khoản chi luôn hiện sẵn danh sách: Tiền điện, Tiền nước, Lương giáo viên, Tiền thuế (bấm chọn là điền tên + số tiền mặc định), kèm ô nhập khoản chi khác.

## 3. Giao diện ô chọn

- Ô "Tất cả trạng thái" (Danh sách học sinh) bị cắt chữ → nới rộng và cho ô tự giãn theo nội dung.
- Ô chọn tháng ở Học phí và Tài chính bị che icon lịch → tăng chiều rộng và thêm khoảng đệm phải để icon hiển thị đủ.
- Rà lại các ô chọn còn lại trên các trang để không còn trường hợp cắt chữ trên màn hình nhỏ.

## Chi tiết kỹ thuật

- `StudentsTab.tsx`: dùng `slotsPerDayMap(s.schedule_slots)` để quy đổi mỗi bản ghi điểm danh theo `getDay()` của ngày → cộng số buổi tương ứng thay vì +1.
- Migration: thêm cột `class_type` (nullable) cho `finance_entries`; thêm bảng/cột phục vụ khoản thu học phí nhập tay (tên học sinh, lớp, tên khóa, ngày bắt đầu/kết thúc kỳ, ngày đóng) — dự kiến mở rộng `finance_entries` với `student_name`, `course_label`, `term_start`, `term_end`, `paid_date`, `income_type` ('hoc_phi' | 'khac'); seed 4 danh mục chi mặc định vào `expense_categories`.
- `finance.functions.ts`: cập nhật schema Zod và truy vấn theo các trường mới.
- `FinanceTab.tsx`: tách state lọc lớp, dựng lại `EntryDialog` theo luồng Thu học phí / Thu khác / Chi.
- Sửa class chiều rộng `SelectTrigger` và `Input type="month"` (`w-[170px] pr-2`) tại `StudentsTab.tsx`, `TuitionTab.tsx`, `FinanceTab.tsx`.
