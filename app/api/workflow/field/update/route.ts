import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  WORKFLOW_TRIP_CREATOR_ONLY_FIELDS,
  isWorkflowEditableFieldKey,
  isWorkflowRecordType,
} from '@/lib/constants/workflow-fields';
import {
  canAccessLinkedRecord,
  loadCurrentLinkingProfile,
  loadOrderLinkContext,
  loadTripLinkContext,
} from '@/lib/server/order-trip-linking';
import {
  canAccessOrderViaCargoRoute,
  canAccessTripViaCargoRoute,
} from '@/lib/server/cargo-legs';
import { upsertWorkflowFieldUpdate } from '@/lib/server/workflow-field-updates';

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
  const recordType = body.record_type;
  const recordId =
    typeof body.record_id === 'string' && body.record_id.trim() !== ''
      ? body.record_id.trim()
      : '';
  const fieldKey = body.field_key;

  if (!isWorkflowRecordType(recordType)) {
    return NextResponse.json({ error: 'Invalid record type' }, { status: 400 });
  }

  if (!recordId) {
    return NextResponse.json({ error: 'Record id is required' }, { status: 400 });
  }

  if (!isWorkflowEditableFieldKey(fieldKey)) {
    return NextResponse.json({ error: 'Invalid field key' }, { status: 400 });
  }

  const profile = await loadCurrentLinkingProfile(serviceSupabase, user.id);
  let organizationId = profile.organization_id as string;

  if (recordType === 'order') {
    const { order, sharedManagerUserId } = await loadOrderLinkContext(
      serviceSupabase,
      recordId
    );

    const canEditViaShare = canAccessLinkedRecord({
      profile,
      currentUserId: user.id,
      createdBy: order.created_by,
      sharedManagerUserId,
    });

    const canEditViaCargoRoute = await canAccessOrderViaCargoRoute(
      serviceSupabase,
      user.id,
      organizationId,
      recordId
    );

    if (!canEditViaShare && !canEditViaCargoRoute) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    organizationId = order.organization_id;
  } else {
    const { trip, sharedManagerUserId } = await loadTripLinkContext(
      serviceSupabase,
      recordId
    );

    const canEditViaShare = canAccessLinkedRecord({
      profile,
      currentUserId: user.id,
      createdBy: trip.created_by,
      sharedManagerUserId,
    });

    const canEditViaCargoRoute = await canAccessTripViaCargoRoute(
      serviceSupabase,
      user.id,
      organizationId,
      recordId
    );

    if (!canEditViaShare && !canEditViaCargoRoute) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (
      WORKFLOW_TRIP_CREATOR_ONLY_FIELDS.has(fieldKey) &&
      trip.created_by !== user.id
    ) {
      return NextResponse.json(
        { error: 'Only trip creator can edit this field' },
        { status: 403 }
      );
    }

    organizationId = trip.organization_id;
  }

  try {
    const saved = await upsertWorkflowFieldUpdate(serviceSupabase, {
      organizationId,
      recordType,
      recordId,
      fieldKey,
      value: body.value_text,
      updatedBy: user.id,
    });

    return NextResponse.json({
      success: true,
      field_update: saved,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to save workflow field',
      },
      { status: 500 }
    );
  }
}
