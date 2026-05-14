type Variant = 'blue' | 'green' | 'purple' | 'orange' | 'gray' | 'red' | 'indigo';

const variants: Record<Variant, string> = {
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-emerald-100 text-emerald-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
  gray: 'bg-slate-100 text-slate-600',
  red: 'bg-red-100 text-red-700',
  indigo: 'bg-indigo-100 text-indigo-700',
};

export default function Badge({
  children,
  variant = 'gray',
}: {
  children: React.ReactNode;
  variant?: Variant;
}) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; variant: Variant }> = {
    admin: { label: '관리자', variant: 'red' },
    mentor: { label: '멘토', variant: 'purple' },
    student: { label: '학생', variant: 'blue' },
  };
  const { label, variant } = map[role] ?? { label: role, variant: 'gray' };
  return <Badge variant={variant}>{label}</Badge>;
}

export function TeamBadge({ team }: { team: string | null }) {
  if (!team) return <Badge variant="gray">없음</Badge>;
  if (team === 'chatbot') return <Badge variant="indigo">챗봇팀</Badge>;
  return <Badge variant="green">휴먼팀</Badge>;
}
