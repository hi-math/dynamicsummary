'use client';

export default function ReadingPassagePanel({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 shrink-0">
        <h3 className="text-sm font-semibold text-slate-700">{title || '지시문'}</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        {content ? (
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{content}</p>
        ) : (
          <p className="text-sm text-slate-400 italic">지문이 등록되지 않았습니다.</p>
        )}
      </div>
    </div>
  );
}
