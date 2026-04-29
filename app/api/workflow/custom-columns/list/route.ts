import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { loadCurrentLinkingProfile } from '@/lib/server/order-trip-linking';
import { loadWorkflowCustomColumns } from '@/lib/server/workflow-custom-columns';

export async function GET() {
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

  try {
    const profile = await loadCurrentLinkingProfile(serviceSupabase, user.id);
    const viewerOrganizationId =
      typeof profile.organization_id === 'string' && profile.organization_id.trim() !== ''
        ? profile.organization_id
        : '';

    if (!viewerOrganizationId) {
      return NextResponse.json(
        { error: 'User organization not found' },
        { status: 400 }
      );
    }

    const columns = await loadWorkflowCustomColumns(serviceSupabase, {
      viewerUserId: user.id,
      viewerOrganizationId,
    });

    return NextResponse.json({
      viewer_user_id: user.id,
      current_organization_id: viewerOrganizationId,
      custom_columns: columns,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load workflow custom columns',
      },
      { status: 500 }
    );
  }
}
