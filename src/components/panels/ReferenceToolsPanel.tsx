export default function ReferenceToolsPanel() {
  const tools = [
    { label: 'Naver Dictionary', url: 'https://en.dict.naver.com/#/main', icon: 'N' },
    { label: 'SKELL', url: 'https://skell.sketchengine.eu/', icon: 'S' },
  ];

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 shrink-0">
        <h3 className="text-sm font-semibold text-slate-700">참고 도구</h3>
      </div>
      <div className="flex-1 p-3 flex flex-row gap-2">
        {tools.map((t) => (
          <a
            key={t.label}
            href={t.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 p-2.5 border border-slate-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 transition-colors group"
          >
            <span className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded font-bold text-xs flex items-center justify-center group-hover:bg-indigo-200 shrink-0">
              {t.icon}
            </span>
            <span className="text-sm text-slate-700 font-medium truncate">{t.label}</span>
            <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ))}
      </div>
    </div>
  );
}
