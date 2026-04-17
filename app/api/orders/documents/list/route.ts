import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  ORDER_DOCUMENT_ZONES,
  normalizeOrderDocumentZone,
} from '@/lib/constants/order-documents';
import { loadOrderDocumentOrderContext } from '@/lib/server/order-documents';

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';

  return value.trim();
}

export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const orderId = normalizeText(searchParams.get('orderId'));

  if (!orderId) {
    return NextResponse.json({ error: 'Order id is required' }, { status: 400 });
  }

  try {
    const { order, canView, isSameOrganization, canManageAll } = await loadOrderDocumentOrderContext(
      serviceSupabase,
      user.id,
      orderId
    );

    if (!canView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await serviceSupabase
      .from('order_documents')
      .select(`
        id,
        order_id,
        organization_id,
        uploaded_by_organization_id,
        created_by,
        storage_bucket,
        storage_path,
        original_file_name,
        mime_type,
        file_size,
        document_zone,
        created_at,
        created_by_user:created_by (
          first_name,
          last_name
        )
      `)
      .eq('order_id', orderId)
      .eq('organization_id', order.organization_id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const visibleDocuments = (data || []).filter((document: any) => {
      const documentZone = normalizeOrderDocumentZone(document.document_zone, 'order');

      return isSameOrganization || documentZone !== 'order';
    });

    const signedUrls = await Promise.all(
      visibleDocuments.map(async (document: any) => {
        const { data: signedUrlData } = await serviceSupabase.storage
          .from(document.storage_bucket)
          .createSignedUrl(document.storage_path, 60 * 60);

        return {
          id: document.id,
          order_id: document.order_id,
          original_file_name: document.original_file_name,
          mime_type: document.mime_type,
          file_size: document.file_size,
          document_zone: normalizeOrderDocumentZone(document.document_zone, 'order'),
          uploaded_by_organization_id: document.uploaded_by_organization_id ?? null,
          created_at: document.created_at,
          signed_url: signedUrlData?.signedUrl ?? null,
          can_manage: canManageAll === true || document.created_by === user.id,
          created_by_user: Array.isArray(document.created_by_user)
            ? (document.created_by_user[0] ?? null)
            : document.created_by_user,
        };
      })
    );

    return NextResponse.json({
      documents: signedUrls,
      permissions: {
        is_same_organization: isSameOrganization,
        can_manage_all: canManageAll,
        can_upload_order_zone: isSameOrganization,
        visible_zones: isSameOrganization
          ? ORDER_DOCUMENT_ZONES
          : ORDER_DOCUMENT_ZONES.filter((zone) => zone !== 'order'),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
