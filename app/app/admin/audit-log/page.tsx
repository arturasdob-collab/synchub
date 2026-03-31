import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/auth-helpers-nextjs';

type AuditUser = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
};

type AuditLogRow = {
  id: string;
  action: string;
  actor_id: string | null;
  target_id: string | null;
  organization_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  organization: { id: string; name: string | null }[] | null;
  actor: AuditUser[] | null;
  target: AuditUser[] | null;
};

export default async function AuditLogPage() {
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, email, is_super_admin, is_creator')
    .eq('id', user.id)
    .single();

    if (!profile || (!profile.is_super_admin && !profile.is_creator)) {
      redirect('/app/admin/users');
    }

  const { data, error } = await supabase
  .from('audit_logs')
  .select(`
    id,
    action,
    details,
    created_at,
    actor_id,
    target_id,
    organization_id,
    organization:organizations!audit_logs_organization_id_fkey (
      id,
      name
    ),
    actor:user_profiles!audit_logs_actor_id_fkey (
      id,
      email,
      first_name,
      last_name
    ),
    target:user_profiles!audit_logs_target_id_fkey (
      id,
      email,
      first_name,
      last_name
    )
  `)
  .order('created_at', { ascending: false })
  .limit(100);

  const logs: AuditLogRow[] = (data ?? []) as AuditLogRow[];
  console.log('AUDIT FIRST LOG:', logs[0]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground">
          System activity history for admin actions
        </p>
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="p-6">
          {error ? (
            <div className="text-sm text-red-500">
              Failed to load audit logs
            </div>
          ) : logs.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No audit log entries yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-3 pr-4">Time</th>
                    <th className="py-3 pr-4">Action</th>
                    <th className="py-3 pr-4">Actor</th>
                    <th className="py-3 pr-4">Target</th>
                    <th className="py-3 pr-4">Organization</th>
                    <th className="py-3 pr-4">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: AuditLogRow) => (<tr key={log.id} className="border-b align-top">
  <td className="py-3 pr-4 whitespace-nowrap">
    {new Date(log.created_at).toLocaleString()}
  </td>

  <td className="py-3 pr-4 font-medium">
  {log.action === 'role_change' && 'Role change'}
  {log.action === 'user_disable' && 'Account disabled'}
  {log.action === 'user_enable' && 'Account enabled'}
  {log.action === 'user_delete' && 'Account deleted'}
  {!['role_change', 'user_disable', 'user_enable', 'user_delete'].includes(log.action) && log.action}
</td>

  <td className="py-3 pr-4">
    {log.details?.actor_name || log.details?.actor_email ? (
      <div>
        <div className="font-medium">
          {(log.details?.actor_name as string) || '—'}
        </div>
        <div className="text-xs text-slate-500">
          {(log.details?.actor_email as string) || '-'}
        </div>
      </div>
    ) : (
      log.actor_id || '-'
    )}
  </td>

  <td className="py-3 pr-4">
    {log.details?.target_name || log.details?.target_email ? (
      <div>
        <div className="font-medium">
          {(log.details?.target_name as string) || '—'}
        </div>
        <div className="text-xs text-slate-500">
          {(log.details?.target_email as string) || '-'}
        </div>
      </div>
    ) : (
      log.target_id || '-'
    )}
  </td>

  <td className="py-3 pr-4">
  <div className="font-medium">
    {(log.details?.organization_name as string) || '-'}
  </div>
</td>

  <td className="py-3 pr-4">
    <div className="text-sm">
      {(log.details?.message as string) || '-'}
    </div>
  </td>
</tr>                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}