'use client';

import { useState, useTransition } from 'react';
import Modal from '@/components/ui/Modal';
import Badge, { RoleBadge, TeamBadge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { createUser, updateUser, deleteUser, advancePhase, setPhase, getUsers, assignMentor } from '@/actions/admin';
import { PHASES, PHASE_LABEL } from '@/lib/phases';
import type { User } from '@/types';

export default function UsersTab({ initialUsers, initialMentors }: { initialUsers: User[]; initialMentors: User[] }) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [mentors, setMentors] = useState<User[]>(initialMentors);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const [editUser, setEditUser] = useState<User | null>(null);
  const [setPhaseUser, setSetPhaseUser] = useState<User | null>(null);
  const [newPhase, setNewPhase] = useState('');
  const [assignUser, setAssignUser] = useState<User | null>(null);
  const [selectedMentorId, setSelectedMentorId] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);

  async function refresh() {
    const fresh = await getUsers();
    setUsers(fresh);
    const freshMentors = fresh.filter((u) => u.role === 'mentor');
    setMentors(freshMentors);
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await createUser(fd);
    if (res?.error) { showToast(res.error, 'error'); return; }
    showToast('계정이 생성되었습니다.', 'success');
    setCreateOpen(false);
    (e.target as HTMLFormElement).reset();
    await refresh();
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editUser) return;
    const fd = new FormData(e.currentTarget);
    fd.set('id', editUser.id);
    const res = await updateUser(fd);
    if (res?.error) { showToast(res.error, 'error'); return; }
    showToast('수정되었습니다.', 'success');
    setEditUser(null);
    await refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm(`계정 "${id}"를 삭제하시겠습니까?`)) return;
    const res = await deleteUser(id);
    if (res?.error) { showToast(res.error, 'error'); return; }
    showToast('삭제되었습니다.', 'success');
    await refresh();
  }

  async function handleAdvance(id: string) {
    const res = await advancePhase(id);
    if (res?.error) { showToast(res.error, 'error'); return; }
    showToast(`단계가 이동되었습니다.`, 'success');
    await refresh();
  }

  async function handleSetPhase() {
    if (!setPhaseUser || !newPhase) return;
    const res = await setPhase(setPhaseUser.id, newPhase);
    if (res?.error) { showToast(res.error, 'error'); return; }
    showToast('단계가 설정되었습니다.', 'success');
    setSetPhaseUser(null);
    await refresh();
  }

  async function handleAssignMentor() {
    if (!assignUser) return;
    const res = await assignMentor(assignUser.id, selectedMentorId || null);
    if (res?.error) { showToast(res.error, 'error'); return; }
    showToast('멘토가 배정되었습니다.', 'success');
    setAssignUser(null);
    await refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold text-slate-800">계정 관리</h2>
          <button
            onClick={() => setCreateOpen(true)}
            title="계정 추가"
            className="flex items-center justify-center w-6 h-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Users table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['아이디', '이름', '역할', '팀', '담당 멘토', '현재 단계', '단계설정', '관리'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{u.id}</td>
                  <td className="px-4 py-2.5 font-medium">{u.name}</td>
                  <td className="px-4 py-2.5"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-2.5"><TeamBadge team={u.team} /></td>
                  <td className="px-4 py-2.5 text-xs">
                    {u.role === 'student' && u.team === 'human' ? (
                      <button
                        onClick={() => { setAssignUser(u); setSelectedMentorId(u.mentor_id ?? ''); }}
                        className="group flex items-center gap-1 hover:text-indigo-600 transition-colors"
                      >
                        <span className={u.mentor_id ? 'text-indigo-600 font-medium' : 'text-slate-300'}>
                          {u.mentor_id ? (mentors.find((m) => m.id === u.mentor_id)?.name ?? u.mentor_id) : '미배정'}
                        </span>
                        <svg className="w-3 h-3 text-slate-300 group-hover:text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.415.586H9v-2.414a2 2 0 01.586-1.414L9 13z" />
                        </svg>
                      </button>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {PHASE_LABEL[u.current_phase as keyof typeof PHASE_LABEL] ?? u.current_phase}
                  </td>
                  <td className="px-4 py-2.5">
                    {u.role === 'student' && (
                      <div className="flex gap-1">
                        <button onClick={() => handleAdvance(u.id)}
                          className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-100 transition-colors">
                          → 다음
                        </button>
                        <button onClick={() => { setSetPhaseUser(u); setNewPhase(u.current_phase); }}
                          className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-100 transition-colors">
                          설정
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {u.id !== 'admin' && (
                      <div className="flex gap-1">
                        <button onClick={() => setEditUser(u)}
                          className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-100 transition-colors">
                          수정
                        </button>
                        <button onClick={() => handleDelete(u.id)}
                          className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 transition-colors">
                          삭제
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-slate-400 text-sm">계정이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="계정 추가">
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">아이디 *</label>
            <input name="id" required placeholder="로그인에 사용할 아이디"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">이름 *</label>
            <input name="name" required placeholder="표시될 이름"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">역할 *</label>
            <select name="role" required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="">선택</option>
              <option value="admin">관리자</option>
              <option value="mentor">멘토</option>
              <option value="student">학생</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">팀</label>
            <select name="team"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="">없음</option>
              <option value="chatbot">챗봇팀</option>
              <option value="human">휴먼팀</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setCreateOpen(false)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
              취소
            </button>
            <button type="submit"
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              추가
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="계정 수정">
        {editUser && (
          <form onSubmit={handleUpdate} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">이름</label>
              <input name="name" defaultValue={editUser.name} required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">역할</label>
              <select name="role" defaultValue={editUser.role}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="admin">관리자</option>
                <option value="mentor">멘토</option>
                <option value="student">학생</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">팀</label>
              <select name="team" defaultValue={editUser.team ?? ''}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">없음</option>
                <option value="chatbot">챗봇팀</option>
                <option value="human">휴먼팀</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setEditUser(null)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                취소
              </button>
              <button type="submit"
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                저장
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Assign mentor modal */}
      <Modal open={!!assignUser} onClose={() => setAssignUser(null)} title="멘토 배정">
        {assignUser && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              <span className="font-medium">{assignUser.name}</span> 학생에게 담당 멘토를 배정합니다.
            </p>
            <select
              value={selectedMentorId}
              onChange={(e) => setSelectedMentorId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">배정 없음</option>
              {mentors.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
              ))}
            </select>
            {mentors.length === 0 && (
              <p className="text-xs text-amber-600">등록된 멘토 계정이 없습니다.</p>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setAssignUser(null)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                취소
              </button>
              <button onClick={handleAssignMentor}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                저장
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Set phase modal */}
      <Modal open={!!setPhaseUser} onClose={() => setSetPhaseUser(null)} title="단계 설정">
        {setPhaseUser && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{setPhaseUser.name} 학생의 단계를 설정합니다.</p>
            <select value={newPhase} onChange={(e) => setNewPhase(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              {PHASES.map((p) => (
                <option key={p} value={p}>{PHASE_LABEL[p]}</option>
              ))}
            </select>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setSetPhaseUser(null)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                취소
              </button>
              <button onClick={handleSetPhase}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                설정
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
