'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthProvider';

type Company = {
  id: string;
  company_code: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  is_client: boolean;
  is_carrier: boolean;
  rating: number | null;
};

export default function CompaniesPage() {
  const router = useRouter();
  const { profile } = useAuth();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true)
  const [ratingsMap, setRatingsMap] = useState<Record<string, number | null>>({});

  const [searchName, setSearchName] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [nameSuggestions, setNameSuggestions] = useState<any[]>([]);
  const [codeSuggestions, setCodeSuggestions] = useState<any[]>([]);

  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<'all' | 'client' | 'carrier'>('all');

  const limit = 20;
  const [clientCount, setClientCount] = useState(0);
  const [carrierCount, setCarrierCount] = useState(0);
  const [allCount, setAllCount] = useState(0);

  useEffect(() => {
    fetchCompanies(page);
  }, [page, typeFilter]);
  
  const fetchNameSuggestions = async (value: string) => {
    if (!profile?.organization_id || !value.trim()) {
      setNameSuggestions([]);
      return;
    }
  
    const { data, error } = await supabase
      .from('companies')
      .select('id, name')
      .eq('organization_id', profile.organization_id)
      .ilike('name', `%${value.trim()}%`)
      .order('name')
      .limit(5);
  
    if (error || !data) {
      setNameSuggestions([]);
      return;
    }
  
setNameSuggestions(data || []);
    };
  
  const fetchCodeSuggestions = async (value: string) => {
    if (!profile?.organization_id || !value.trim()) {
      setCodeSuggestions([]);
      return;
    }
  
    const { data, error } = await supabase
      .from('companies')
      .select('id, company_code')
      .eq('organization_id', profile.organization_id)
      .ilike('company_code', `%${value.trim()}%`)
      .order('company_code')
      .limit(5);
  
    if (error || !data) {
      setCodeSuggestions([]);
      return;
    }
  
    setCodeSuggestions(data || []);
};

  const fetchCompanies = async (targetPage = 1) => {
    if (!profile?.organization_id) return;
  
    setLoading(true);
  
    const from = (targetPage - 1) * limit;
    const to = targetPage * limit - 1;
  
    let query = supabase
      .from('companies')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .order('name')
      .range(from, to);
  
    if (searchName.trim()) {
      query = query.ilike('name', `%${searchName.trim()}%`);
    }
  
    if (searchCode.trim()) {
      query = query.ilike('company_code', `%${searchCode.trim()}%`);
    }
  
    if (typeFilter === 'client') {
      query = query.eq('is_client', true);
    }
  
    if (typeFilter === 'carrier') {
      query = query.eq('is_carrier', true);
    }
  
    const { data, error } = await query;
  
    if (error) {
      console.error('COMPANIES SEARCH ERROR:', error);
      setCompanies([]);
      setLoading(false);
      return;
    }
  
    const companiesData = data || [];
    setCompanies(companiesData);
  
    const { count: totalCount } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id);
  
    const { count: totalClientCount } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)
      .eq('is_client', true);
  
    const { count: totalCarrierCount } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)
      .eq('is_carrier', true);
  
    setAllCount(totalCount || 0);
    setClientCount(totalClientCount || 0);
    setCarrierCount(totalCarrierCount || 0);
  
    if (companiesData.length > 0) {
      const ids = companiesData.map((c) => c.id);
  
      const { data: commentsData } = await supabase
        .from('company_comments')
        .select('company_id, rating')
        .in('company_id', ids);
  
      const map: Record<string, number | null> = {};
  
      ids.forEach((id) => {
        const ratings = (commentsData || [])
          .filter((c) => c.company_id === id && c.rating > 0)
          .map((c) => c.rating);
  
        if (!ratings.length) {
          map[id] = null;
        } else {
          const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
          map[id] = Number(avg.toFixed(1));
        }
      });
  
      setRatingsMap(map);
    } else {
      setRatingsMap({});
    }
  
    setLoading(false);
  };

  const openCompany = (id: string) => {
    router.push(`/app/companies/${id}`);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      <div className="flex items-center justify-between">

        <h1 className="text-3xl font-bold">Companies</h1>

        <button
          onClick={() => router.push('/app/companies/new')}
          className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-md"
        >
          <Plus size={16} />
          Add Company
        </button>

      </div>

      <div className="flex gap-4">
  <div className="relative">
    <input
      placeholder="Search company name"
      value={searchName}
      onChange={(e) => {
        const value = e.target.value;
        setSearchName(value);
        fetchNameSuggestions(value);
      }}
      className="border rounded-md px-3 py-2 text-sm w-48"
    />

    {nameSuggestions.length > 0 && (
      <div className="border rounded-md mt-1 bg-white shadow w-48 absolute z-10">
{nameSuggestions.map((item, i) => (
  <div
    key={i}
    onClick={() => {
      setSearchName(item.name);
      setNameSuggestions([]);
      router.push(`/app/companies/${item.id}`);
    }}
    className="px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
  >
    {item.name}
  </div>
))}
      </div>
    )}
  </div>

  <div className="relative">
    <input
      placeholder="Search company code"
      value={searchCode}
      onChange={(e) => {
        const value = e.target.value;
        setSearchCode(value);
        fetchCodeSuggestions(value);
      }}
      className="border rounded-md px-3 py-2 text-sm w-48"
    />

    {codeSuggestions.length > 0 && (
      <div className="border rounded-md mt-1 bg-white shadow w-48 absolute z-10">
{codeSuggestions.map((item, i) => (
  <div
    key={i}
    onClick={() => {
      setSearchCode(item.company_code);
      setCodeSuggestions([]);
      router.push(`/app/companies/${item.id}`);
    }}
    className="px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
  >
    {item.company_code}
  </div>
))}
      </div>
    )}
  </div>

  <button
    onClick={() => {
      setPage(1);
      fetchCompanies(1);
    }}
    className="border px-4 py-2 rounded-md text-sm"
  >
    Search
  </button>
</div>
      <div className="flex gap-3">
  <button
    onClick={() => {
      setTypeFilter('all');
      setPage(1);
    }}
    className={`px-4 py-2 rounded-md text-sm border ${
      typeFilter === 'all'
        ? 'bg-slate-900 text-white border-slate-900'
        : 'bg-white text-slate-700 border-slate-300'
    }`}
  >
    All ({allCount})
  </button>

  <button
    onClick={() => {
      setTypeFilter('client');
      setPage(1);
    }}
    className={`px-4 py-2 rounded-md text-sm border ${
      typeFilter === 'client'
        ? 'bg-slate-900 text-white border-slate-900'
        : 'bg-white text-slate-700 border-slate-300'
    }`}
  >
    Client ({clientCount})
  </button>

  <button
    onClick={() => {
      setTypeFilter('carrier');
      setPage(1);
    }}
    className={`px-4 py-2 rounded-md text-sm border ${
      typeFilter === 'carrier'
        ? 'bg-slate-900 text-white border-slate-900'
        : 'bg-white text-slate-700 border-slate-300'
    }`}
  >
    Carrier ({carrierCount})
  </button>
</div>

      <div className="border rounded-xl overflow-hidden">

        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm">

            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-3">Company Code</th>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Address</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Rating</th>
              </tr>
            </thead>

            <tbody>

              {companies.map((c) => {

                const type = [
                  c.is_client ? 'Client' : null,
                  c.is_carrier ? 'Carrier' : null,
                ]
                  .filter(Boolean)
                  .join(', ');

                const address =
                  `${c.address || ''} ${c.city || ''} ${c.country || ''}`;

                return (
                  <tr
                    key={c.id}
                    onClick={() => openCompany(c.id)}
                    className="border-b hover:bg-slate-50 cursor-pointer"
                  >

                    <td className="p-3">{c.company_code}</td>

                    <td className="p-3 font-medium">{c.name}</td>

                    <td className="p-3">{address}</td>

                    <td className="p-3">{type}</td>

                    <td className="p-3">
  {ratingsMap[c.id]
    ? '★'.repeat(Math.round(ratingsMap[c.id]!)) + ` (${ratingsMap[c.id]})`
    : '-'}
</td>
                  </tr>
                );
              })}

            </tbody>

          </table>
        )}

      </div>

      <div className="flex justify-center gap-4">

        <button
          onClick={() => setPage(page - 1)}
          disabled={page === 1}
          className="border px-4 py-2 rounded-md"
        >
          Prev
        </button>

        <div className="px-4 py-2">
          Page {page}
        </div>

        <button
          onClick={() => setPage(page + 1)}
          className="border px-4 py-2 rounded-md"
        >
          Next
        </button>

      </div>

    </div>
  );
}