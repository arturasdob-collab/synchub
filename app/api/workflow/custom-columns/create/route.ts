import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { loadCurrentLinkingProfile } from '@/lib/server/order-trip-linking';
import {
  createWorkflowCustomColumn,
  isWorkflowCustomColumnVisibilityScope,
} from '@/lib/server/workflow-custom-columns';

export async function POST(req: Request) {
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

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const visibilityScope = body.visibility_scope;
  const organizationIds = Array.isArray(body.organization_ids)
    ? body.organization_ids
    : [];

  if (!name) {
    return NextResponse.json({ error: 'Column name is required' }, { status: 400 });
  }

  if (!isWorkflowCustomColumnVisibilityScope(visibilityScope)) {
    return NextResponse.json({ error: 'Invalid visibility scope' }, { status: 400 });
  }

  try {
    const profile = await loadCurrentLinkingProfile(serviceSupabase, user.id);
    const ownerOrganizationId =
      typeof profile.organization_id === 'string' && profile.organization_id.trim() !== ''
        ? profile.organization_id
        : '';

    if (!ownerOrganizationId) {
      return NextResponse.json(
        { error: 'User organization not found' },
        { status: 400 }
      );
    }

    const column = await createWorkflowCustomColumn(serviceSupabase, {
      ownerOrganizationId,
      createdBy: user.id,
      name,
      visibilityScope,
      organizationIds,
    });

    return NextResponse.json({
      success: true,
      custom_column: column,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create custom column';
    const status =
      message === 'Column name is required' ||
      message === 'Select at least one organization'
        ? 400
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
