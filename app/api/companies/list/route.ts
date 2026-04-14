import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

function getDisplayType(isClient: boolean, isCarrier: boolean) {
  if (isClient && isCarrier) {
    return 'Client / Carrier';
  }

  if (isClient) {
    return 'Client';
  }

  if (isCarrier) {
    return 'Carrier';
  }

  return '-';
}

function getCmrStatus(
  isCarrier: boolean,
  validFrom: string | null,
  validUntil: string | null
) {
  if (!isCarrier) {
    return null;
  }

  const today = new Date();
  const todayStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );

  const fromDate = validFrom ? new Date(`${validFrom}T00:00:00.000Z`) : null;
  const untilDate = validUntil ? new Date(`${validUntil}T23:59:59.999Z`) : null;

  const started = !fromDate || fromDate <= todayStart;
  const notExpired = !!untilDate && untilDate >= todayStart;

  return started && notExpired ? 'Valid' : 'Not valid';
}

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
    const { data: profile, error: profileError } = await serviceSupabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.organization_id) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const organizationId = profile.organization_id as string;

    const { data: companies, error: companiesError } = await serviceSupabase
      .from('companies')
      .select(
        `
          id,
          company_code,
          name,
          address,
          city,
          country,
          is_client,
          is_carrier,
          cmr_insurance_valid_from,
          cmr_insurance_valid_until,
          created_at,
          created_by_user:created_by (
            first_name,
            last_name
          )
        `
      )
      .eq('organization_id', organizationId)
      .order('name');

    if (companiesError) {
      return NextResponse.json({ error: companiesError.message }, { status: 500 });
    }

    const companyIds = (companies || []).map((company: any) => company.id).filter(Boolean);
    const ratingsByCompanyId = new Map<string, number | null>();

    if (companyIds.length > 0) {
      const { data: commentRows, error: commentsError } = await serviceSupabase
        .from('company_comments')
        .select('company_id, rating')
        .eq('organization_id', organizationId)
        .in('company_id', companyIds);

      if (commentsError) {
        return NextResponse.json({ error: commentsError.message }, { status: 500 });
      }

      for (const companyId of companyIds) {
        const ratings = (commentRows || [])
          .filter(
            (row: any) =>
              row.company_id === companyId &&
              typeof row.rating === 'number' &&
              row.rating > 0
          )
          .map((row: any) => row.rating as number);

        if (ratings.length === 0) {
          ratingsByCompanyId.set(companyId, null);
          continue;
        }

        const average =
          ratings.reduce((sum: number, current: number) => sum + current, 0) /
          ratings.length;

        ratingsByCompanyId.set(companyId, Number(average.toFixed(1)));
      }
    }

    const rows = (companies || []).map((company: any) => {
      const createdByUser = Array.isArray(company.created_by_user)
        ? company.created_by_user[0] ?? null
        : company.created_by_user;

      return {
        id: company.id,
        company_code: company.company_code ?? '',
        name: company.name ?? '',
        address: company.address ?? null,
        city: company.city ?? null,
        country: company.country ?? null,
        is_client: !!company.is_client,
        is_carrier: !!company.is_carrier,
        display_type: getDisplayType(!!company.is_client, !!company.is_carrier),
        rating: ratingsByCompanyId.get(company.id) ?? null,
        cmr_status: getCmrStatus(
          !!company.is_carrier,
          company.cmr_insurance_valid_from ?? null,
          company.cmr_insurance_valid_until ?? null
        ),
        created_at: company.created_at ?? null,
        created_by_user: createdByUser
          ? {
              first_name: createdByUser.first_name ?? null,
              last_name: createdByUser.last_name ?? null,
            }
          : null,
      };
    });

    return NextResponse.json({
      viewer_user_id: user.id,
      companies: rows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load companies' },
      { status: 500 }
    );
  }
}
