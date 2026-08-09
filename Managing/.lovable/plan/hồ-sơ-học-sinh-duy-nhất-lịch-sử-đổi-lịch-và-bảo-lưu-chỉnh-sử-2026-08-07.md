# Hồ sơ học sinh duy nhất, lịch sử đổi lịch, và bảo lưu chỉnh sửa được

## 1. Một học sinh — nhiều khóa, nhiều lớp

Hiện tại mỗi khóa học là một dòng riêng trong danh sách học sinh, nên cùng một bé học 2 khóa (hoặc học cả Piano lẫn Vẽ) bị hệ thống hiểu là 2 học sinh khác nhau: ô tìm kiếm và ô chọn học sinh hiện tên lặp lại.

Sẽ tách thành 2 lớp dữ liệu:

- **Hồ sơ học sinh** (mới): tên, tuổi, ghi chú — mỗi bé đúng một hồ sơ.
- **Khóa học**: mỗi dòng hiện tại trở thành một khóa gắn vào hồ sơ đó (lớp, học phí, lịch, ngày bắt đầu/kết thúc, trạng thái).

Dữ liệu cũ được gộp tự động theo **tên + tuổi**.

Thay đổi trên giao diện:

- Ô tìm kiếm ở Lịch học, Học phí, Điểm danh, Nhật ký: mỗi bé chỉ hiện **một lần**; chọn xong mới hiện các khóa của bé đó.
- Danh sách học sinh: thêm chế độ xem **Theo học sinh** (gộp, mở ra xem các khóa) bên cạnh chế độ **Theo khóa** hiện tại.
- Thêm khóa mới / Ghi nhận học phí "Khóa tiếp theo": chọn hồ sơ có sẵn thay vì so khớp theo tên.
- Trang học sinh hiển thị đủ các lớp bé đang học (ví dụ Piano K2 + Vẽ K1) mà không tách thành 2 bé.

## 2. Đổi lịch học có lưu lịch sử

Thêm bảng **Đổi lịch học** trong trang *Lịch học*:

- Nút "Đổi lịch": chọn khóa của học sinh, nhập **ngày hiệu lực** (do bạn chọn) và lịch mới.
- Lịch cũ **không bị ghi đè**: được đóng lại tại ngày hiệu lực và lưu vào lịch sử; lịch mới có hiệu lực từ ngày đó trở đi.
- Bảng lịch sử hiển thị: học sinh, khóa, ngày hiệu lực, lịch cũ → lịch mới, lý do, thời điểm tạo.
- **Ngày kết thúc khóa được tính lại tự động** theo số buổi còn lại và lịch mới.
- Thời khóa biểu tuần, điểm danh và nhật ký của các tuần **trong quá khứ** vẫn dựng theo lịch đang có hiệu lực tại thời điểm đó; buổi đã điểm danh giữ nguyên.

## 3. Bảng "Học sinh bảo lưu": sửa và xóa

- Mỗi dòng bảo lưu có nút **Sửa** (đổi ngày bắt đầu, số buổi, ghi chú) và **Xóa** (xóa cả đợt bảo lưu hoặc từng buổi).
- Xác nhận trước khi xóa.

## 4. Cột "Bảo lưu" luôn đồng bộ

- Cột "Bảo lưu" trong Danh sách học sinh lấy trực tiếp số buổi bảo lưu **trong khóa đang học** từ đúng nguồn dữ liệu của bảng "Học sinh bảo lưu".
- Sau khi thêm/sửa/xóa bảo lưu, số liệu ở Danh sách học sinh, Ngày kết thúc thực tế và Lịch học cập nhật ngay, không cần tải lại trang.

## Chi tiết kỹ thuật

- Migration:
  - `people(id, name, age, note, created_at, updated_at)` + GRANT + RLS (chỉ truy cập qua server functions như các bảng hiện có).
  - `students.person_id uuid references people(id)`; backfill gộp theo `lower(trim(name))` + `age`, sau đó đặt NOT NULL.
  - `schedule_changes(id, student_id, effective_from, old_slots jsonb, new_slots jsonb, reason, created_at)` + GRANT + RLS.
  - Cột `students.schedule_slots` vẫn là lịch hiện hành (để không phải viết lại toàn bộ UI); lịch sử dùng `schedule_changes` để dựng "lịch có hiệu lực tại ngày X".
- `src/lib/shared.ts`: thêm `slotsEffectiveOn(student, changes, dateISO)` và dùng nó trong `ScheduleTab`, `AttendanceTab` khi tính buổi của một ngày trong quá khứ; `computeEndDate` được gọi lại sau khi đổi lịch với số buổi còn lại (tổng buổi − buổi đã học/bảo lưu).
- `src/lib/students.functions.ts`: thêm `listPeople`, `upsertPerson`, `changeSchedule` (ghi `schedule_changes` + cập nhật `students.schedule_slots`, `schedule_days`, `sessions_per_day`, `end_date`), `deleteReserve`/`updateReserve` cho các bản ghi điểm danh trạng thái "Bảo lưu"; `upsertStudent` nhận `person_id`.
- `ScheduleTab.tsx`: thêm khối "Đổi lịch học" (bảng + dialog) và nút Sửa/Xóa trên bảng "Học sinh bảo lưu"; tất cả mutation `invalidateQueries` cho `students` + `attendance-range` để cột "Bảo lưu" đồng bộ tức thì.
- `StudentsTab.tsx`, `TuitionTab.tsx`, `AttendanceTab.tsx`, `LearningTab.tsx`: chọn/lọc theo `person_id` thay vì so khớp `name`.
