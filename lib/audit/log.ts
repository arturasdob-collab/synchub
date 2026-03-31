import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function logAuditEvent({
  action,
  actorId,
  targetId,
  organizationId,
  details,
}: {
  action: string;
  actorId: string;
  targetId?: string | null;
  organizationId?: string | null;
  details?: Record<string, unknown>;
}) {
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

  const { error } = await supabase.from('audit_logs').insert({
    action,
    actor_id: actorId,
    target_id: targetId ?? null,
    organization_id: organizationId ?? null,
    details: details ?? {},
  });

  if (error) {
    console.error('Audit log insert failed:', error);
  }
}