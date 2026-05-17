import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  CARGO_LEG_DOCUMENT_ZONES,
  normalizeCargoLegDocumentZone,
} from '@/lib/constants/cargo-leg-documents';
import { loadCargoLegDocumentCargoLegContext } from '@/lib/server/cargo-leg-documents';

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
  const cargoLegId = normalizeText(searchParams.get('cargoLegId'));

  if (!cargoLegId) {
    return NextResponse.json(
      { error: 'Cargo route step id is required' },
      { status: 400 }
    );
  }

  try {
    const { cargoLeg, canManageAll } = await loadCargoLegDocumentCargoLegContext(
      serviceSupabase,
      user.id,
      cargoLegId
    );

    const { data, error } = await serviceSupabase
      .from('cargo_leg_documents')
      .select(
        `
          id,
          cargo_leg_id,
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
        `
      )
      .eq('cargo_leg_id', cargoLegId)
      .eq('organization_id', cargoLeg.organization_id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const uploadedByOrganizationIds = Array.from(
      new Set(
        (data || [])
          .map((document: any) => document.uploaded_by_organization_id)
          .filter((value: string | null | undefined) => Boolean(value))
      )
    );

    const uploadedByOrganizationMap = new Map<string, string>();

    if (uploadedByOrganizationIds.length > 0) {
      const { data: organizations } = await serviceSupabase
        .from('organizations')
        .select('id, name')
        .in('id', uploadedByOrganizationIds);

      for (const organization of organizations || []) {
        uploadedByOrganizationMap.set(organization.id, organization.name || '-');
      }
    }

    const signedUrls = await Promise.all(
      (data || []).map(async (document: any) => {
        const { data: signedUrlData } = await serviceSupabase.storage
          .from(document.storage_bucket)
          .createSignedUrl(document.storage_path, 60 * 60);

        return {
          id: document.id,
          cargo_leg_id: document.cargo_leg_id,
          original_file_name: document.original_file_name,
          mime_type: document.mime_type,
          file_size: document.file_size,
          document_zone: normalizeCargoLegDocumentZone(
            document.document_zone,
            'additional'
          ),
          uploaded_by_organization_id: document.uploaded_by_organization_id ?? null,
          uploaded_by_organization_name: document.uploaded_by_organization_id
            ? uploadedByOrganizationMap.get(document.uploaded_by_organization_id) || '-'
            : '-',
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
        can_manage_all: canManageAll,
        visible_zones: [...CARGO_LEG_DOCUMENT_ZONES],
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
