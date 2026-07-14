'use client';

import StudentDataCard, { type StudentRecord } from './StudentDataCard';

export default function TrashTab({
  records,
  busyId,
  onRestore,
}: {
  records: StudentRecord[];
  busyId: string | null;
  onRestore: (studentId: string, trashed: boolean) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-1">휴지통</h2>
      <p className="text-xs text-slate-400 mb-4">
        삭제한 학생 데이터입니다. 데이터베이스에서 지워지지 않으며, 복원하면 데이터 조회로 돌아갑니다.
      </p>
      {records.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">
          휴지통이 비어 있습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {records.map((record) => (
            <StudentDataCard
              key={record.student.id}
              record={record}
              mode="trash"
              busy={busyId === record.student.id}
              onToggleTrash={onRestore}
            />
          ))}
        </div>
      )}
    </div>
  );
}
