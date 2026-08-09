# Nâng cấp: điều hướng mobile, sửa lỗi & 2 trang mới

## 1. Menu trang trên mobile
- Ở `src/routes/index.tsx`: dưới `sm`, thay thanh tab lưới bằng **một ô chọn sổ xuống** (Select) hiển thị icon + tên trang hiện tại; mở ra danh sách đủ 6 trang (nay là 8) kèm icon + tên tiếng Việt.
- Từ `sm` trở lên giữ nguyên thanh tab như hiện tại.

## 2. Danh sách học sinh
- Bỏ cột **Ca/ngày** khỏi bảng và khỏi menu ẩn/hiện cột.

## 3. Điểm danh
- Vẫn hiển thị học sinh có lịch trong ngày, cho phép điểm danh bất kỳ lúc nào.
- Ràng buộc duy nhất: trạng thái **"Đi học"** chỉ được đặt khi thời điểm hiện tại ≥ (giờ bắt đầu buổi − 20 phút). Trước mốc đó, tùy chọn "Đi học" bị khóa kèm chú thích "Chỉ điểm danh Đi học trước 20 phút".
- Tự động điểm danh áp dụng cùng mốc −20 phút.

## 4. Học phí — sửa "Dự kiến"
- "Dự kiến" của tháng = tổng học phí của các học sinh **đến hạn đóng trong tháng đó**, tức:
  - buổi cuối khóa (NKT thực tế) rơi trong tháng → đóng khóa mới, **cộng** học phí; hoặc
  - khóa mới bắt đầu trong tháng → **cộng** học phí.
- Học sinh đang giữa khóa (không có mốc nào trong tháng) **không** tính vào dự kiến, và không bị liệt kê là "chưa đóng".
- "Đã đóng / Chưa đóng" tính trên đúng nhóm đến hạn này.

## 5. Thời khóa biểu
- Trong ô lịch chỉ hiện **tên học sinh** (bỏ dòng giờ nhỏ), vì cột trái đã có khung giờ.

## 6. Trang mới: Nhật ký học tập
- Bảng mới `learning_logs`: `student_id` (có thể null với bài chung lớp Múa), `class_type`, `date`, `title` (tác phẩm/bài học), `content`, `attachments` (jsonb: link ảnh/video), `is_class_wide`.
- Giao diện:
  - **Hôm nay**: danh sách học sinh có lịch hôm nay, mỗi người 1 thẻ "Đang học: …" để nhập/sửa nhanh. Lớp **Múa** nhập 1 bài chung cho buổi, tự áp cho mọi học sinh Múa hôm đó; **Piano/Vẽ** nhập riêng từng học sinh.
  - **Lịch sử**: chọn học sinh → timeline theo buổi (ngày, khung giờ, tên bài, nội dung, đính kèm).
  - Đính kèm: nhập link ảnh/video (URL), hiển thị ảnh thu nhỏ / nút mở link.

## 7. Trang mới: Tài chính (Thu – Chi)
- Bảng `expense_categories` (danh mục chi cố định: Lương giáo viên, Mặt bằng, Điện, Nước, Thuế… kèm số tiền mặc định, bật/tắt).
- Bảng `finance_entries`: `month`, `kind` ('thu' | 'chi'), `category`, `amount`, `note`.
- Thu = học phí đã đóng trong tháng (từ `tuition_payments`) + khoản thu khác nhập tay.
- Chi = các danh mục cố định (tự sinh cho tháng đang xem theo số tiền mặc định, cho sửa) + khoản chi khác.
- Hiển thị: Tổng thu / Tổng chi / **Lợi nhuận**, bảng chi tiết, chọn tháng bất kỳ để xem lại; tab **theo năm** tổng hợp 12 tháng kèm biểu đồ cột thu–chi–lợi nhuận.

## 8. Nút "Xuất dữ liệu" ở tất cả các trang
- Xuất **Excel (.xlsx)** cho dữ liệu bảng: Học sinh, Điểm danh (theo ngày & theo học sinh), Học phí, Tài chính, Nhật ký học tập.
- Xuất thêm **PDF** cho các trang có bố cục: Thời khóa biểu tuần, Nhật ký học tập, báo cáo Tài chính tháng/năm.
- Tên file có ngày/tháng, tiếng Việt có dấu hiển thị đúng.

## Chi tiết kỹ thuật
- Migration mới: `learning_logs`, `expense_categories`, `finance_entries` (GRANT chỉ `service_role`, RLS bật, không mở anon/authenticated — đồng bộ với mô hình hiện tại truy cập qua server functions).
- Server functions mới: `src/lib/learning.functions.ts`, `src/lib/finance.functions.ts`; dùng `supabaseAdmin` như các file hiện có.
- Component mới: `src/components/tabs/LearningTab.tsx`, `src/components/tabs/FinanceTab.tsx`.
- Xuất file client-side: thêm `xlsx` (SheetJS) và `jspdf` + `jspdf-autotable` (nhúng font Unicode để hiển thị tiếng Việt); gom vào helper `src/lib/export.ts`.
- Học phí dự kiến: dùng `addScheduledDays(end_date, slots, reserve_days)` sẵn có để lấy NKT thực tế và so với tháng đang xem.
