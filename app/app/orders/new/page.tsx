'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { COUNTRIES } from '@/lib/constants/countries';
import {
  ORDER_DOCUMENT_ACCEPT_ATTRIBUTE,
  formatOrderDocumentFileSize,
} from '@/lib/constants/order-documents';
import {
  PAYMENT_TYPE_OPTIONS,
} from '@/lib/constants/payment-types';
import {
  detectOrderCargoFlagsFromValues,
  ORDER_LOAD_TYPES,
  parseOrderVatRate,
  resolveOrderLoadType,
  resolveOrderVatRate,
} from '@/lib/utils/order-fields';

type ClientOption = {
  id: string;
  name: string;
  company_code: string;
  payment_term_days: number | null;
  country: string | null;
};

type CompanyContactOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
};

type ManagerOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type OrganizationOption = {
  id: string;
  name: string;
};

type PartyAddressMatch = {
  id: string;
  party_role: 'shipper' | 'consignee';
  party_name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
};

type PendingOrderDocument = {
  id: string;
  file: File;
  importId: string | null;
  importStatus: string | null;
  matchResult: any | null;
  importError: string | null;
  reviewHandled: boolean;
};

type UploadedOrderImport = {
  id: string;
  status: string | null;
  match_result_json?: any;
  error_text?: string | null;
};

const currencyOptions = ['EUR', 'PLN', 'USD'] as const;
const vatRateOptions = ['0', '21'] as const;
const IMPORT_REQUIRED_FIELDS = new Set([
  'client_order_number',
  'client_company_id',
  'received_from_name',
  'received_from_contact',
  'loading_date',
  'loading_address',
  'loading_city',
  'loading_postal_code',
  'loading_country',
  'unloading_date',
  'unloading_address',
  'unloading_city',
  'unloading_postal_code',
  'unloading_country',
  'shipper_name',
  'consignee_name',
  'cargo_description',
  'cargo_quantity',
  'cargo_kg',
  'cargo_ldm',
  'price',
]);

function formatContactName(contact: CompanyContactOption) {
  return `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || '-';
}

function formatContactValue(contact: CompanyContactOption) {
  return [contact.phone, contact.email].filter(Boolean).join(' | ');
}

function formatContactOptionLabel(contact: CompanyContactOption) {
  const name = formatContactName(contact);
  const details = [contact.position, contact.phone, contact.email]
    .filter(Boolean)
    .join(' | ');

  return details ? `${name} (${details})` : name;
}

function findMatchingContactId(
  contacts: CompanyContactOption[],
  receivedFromName: string,
  receivedFromContact: string
) {
  const normalizedName = receivedFromName.trim();
  const normalizedContact = receivedFromContact.trim();

  const match = contacts.find((contact) => {
    return (
      formatContactName(contact) === normalizedName &&
      formatContactValue(contact) === normalizedContact
    );
  });

  return match?.id ?? '';
}

function formatManagerLabel(manager: ManagerOption) {
  return `${manager.first_name || ''} ${manager.last_name || ''}`.trim() || '-';
}

function getOrderFormFlags(source: {
  has_ex1?: boolean;
  has_t1?: boolean;
  has_adr?: boolean;
  has_sent?: boolean;
}) {
  return {
    has_ex1: !!source.has_ex1,
    has_t1: !!source.has_t1,
    has_adr: !!source.has_adr,
    has_sent: !!source.has_sent,
  };
}

function getOrderLoadTypeValues(source: {
  cargo_description?: string;
  notes?: string;
  loading_customs_info?: string;
  unloading_customs_info?: string;
  loading_reference?: string;
  unloading_reference?: string;
}) {
  return [
    source.cargo_description,
    source.notes,
    source.loading_customs_info,
    source.unloading_customs_info,
    source.loading_reference,
    source.unloading_reference,
  ];
}

function splitFullName(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim() : '';

  if (!normalized) {
    return {
      first_name: '',
      last_name: '',
    };
  }

  const parts = normalized.split(/\s+/);

  if (parts.length === 1) {
    return {
      first_name: parts[0],
      last_name: '',
    };
  }

  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
  };
}

function normalizePaymentTermValue(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  const match = trimmed.match(/\d{1,3}/);

  if (match) {
    return match[0];
  }

  return trimmed;
}

function normalizePartyMatchText(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function joinClassNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export default function NewOrderPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [managersLoading, setManagersLoading] = useState(true);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [contacts, setContacts] = useState<CompanyContactOption[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [currentOrganizationId, setCurrentOrganizationId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [managerSearch, setManagerSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState('');
  const [vatRateTouched, setVatRateTouched] = useState(false);
  const [loadTypeTouched, setLoadTypeTouched] = useState(false);
  const [importingDocuments, setImportingDocuments] = useState(false);
  const [pendingDocuments, setPendingDocuments] = useState<PendingOrderDocument[]>([]);
  const [pendingImportedCompanyCreate, setPendingImportedCompanyCreate] = useState<any | null>(null);
  const [pendingImportedContactCreate, setPendingImportedContactCreate] = useState<any | null>(null);
  const [hasImportedPrefill, setHasImportedPrefill] = useState(false);
  const [shipperMatches, setShipperMatches] = useState<PartyAddressMatch[]>([]);
  const [consigneeMatches, setConsigneeMatches] = useState<PartyAddressMatch[]>([]);
  const pendingDocumentsRef = useRef<PendingOrderDocument[]>([]);

  const [form, setForm] = useState({
    client_order_number: '',
    shared_manager_user_id: '',
    shared_organization_id: '',
    client_company_id: '',
    loading_date: '',
    loading_time_from: '',
    loading_time_to: '',
    loading_address: '',
    loading_city: '',
    loading_postal_code: '',
    loading_country: '',
    loading_contact: '',
    loading_reference: '',
    loading_customs_info: '',
    unloading_date: '',
    unloading_time_from: '',
    unloading_time_to: '',
    unloading_address: '',
    unloading_city: '',
    unloading_postal_code: '',
    unloading_country: '',
    unloading_contact: '',
    unloading_reference: '',
    unloading_customs_info: '',
    shipper_name: '',
    consignee_name: '',
    received_from_name: '',
    received_from_contact: '',
    cargo_kg: '',
    cargo_quantity: '',
    cargo_description: '',
    cargo_ldm: '',
    load_type: '',
    has_ex1: false,
    has_t1: false,
    has_adr: false,
    has_sent: false,
    price: '',
    vat_rate: '21',
    currency: 'EUR',
    payment_term_text: '',
    payment_type: '',
    notes: '',
  });

  const update = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    fetchClients();
    fetchShareOrganizations();
  }, []);

  useEffect(() => {
    const effectiveOrganizationId =
      form.shared_organization_id || currentOrganizationId;

    if (!effectiveOrganizationId) {
      setManagers([]);
      return;
    }

    void fetchManagers(effectiveOrganizationId);
  }, [currentOrganizationId, form.shared_organization_id]);

  useEffect(() => {
    if (!form.client_company_id) {
      setContacts([]);
      setSelectedContactId('');
      return;
    }

    fetchContacts(form.client_company_id);
  }, [form.client_company_id]);

  useEffect(() => {
    if (!contacts.length || selectedContactId) {
      return;
    }

    const matchingContactId = findMatchingContactId(
      contacts,
      form.received_from_name,
      form.received_from_contact
    );

    if (matchingContactId) {
      setSelectedContactId(matchingContactId);
    }
  }, [
    contacts,
    form.received_from_contact,
    form.received_from_name,
    selectedContactId,
  ]);

  useEffect(() => {
    pendingDocumentsRef.current = pendingDocuments;
  }, [pendingDocuments]);

  useEffect(() => {
    const query = form.shipper_name.trim();

    if (query.length < 2) {
      setShipperMatches([]);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetchPartyAddressMatches('shipper', query);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [form.shipper_name]);

  useEffect(() => {
    const query = form.consignee_name.trim();

    if (query.length < 2) {
      setConsigneeMatches([]);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetchPartyAddressMatches('consignee', query);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [form.consignee_name]);

  const fetchClients = async () => {
    try {
      setClientsLoading(true);

      const { data, error } = await supabase
        .from('companies')
        .select('id, name, company_code, payment_term_days, country')
        .eq('is_client', true)
        .order('name', { ascending: true });

      if (error) {
        toast.error('Failed to load clients');
        setClients([]);
        return;
      }

      setClients((data || []) as ClientOption[]);
    } catch (error) {
      toast.error('Failed to load clients');
      setClients([]);
    } finally {
      setClientsLoading(false);
    }
  };

  const fetchShareOrganizations = async () => {
    try {
      const res = await fetch('/api/organizations/share-targets', {
        method: 'GET',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to load organizations');
        setOrganizations([]);
        return;
      }

      setOrganizations(data.organizations || []);
      setCurrentOrganizationId(data.current_organization_id || '');
      setForm((prev) => ({
        ...prev,
        shared_organization_id:
          prev.shared_organization_id || data.current_organization_id || '',
      }));
    } catch (error) {
      toast.error('Failed to load organizations');
      setOrganizations([]);
    }
  };

  const fetchManagers = async (organizationId: string) => {
    try {
      setManagersLoading(true);

      const searchParams = new URLSearchParams();
      searchParams.set('organizationId', organizationId);

      const res = await fetch(`/api/organization/managers?${searchParams.toString()}`, {
        method: 'GET',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to load managers');
        setManagers([]);
        return;
      }

      setManagers(data.managers || []);
    } catch (error) {
      toast.error('Failed to load managers');
      setManagers([]);
    } finally {
      setManagersLoading(false);
    }
  };

  const fetchContacts = async (companyId: string) => {
    try {
      setContactsLoading(true);

      const { data, error } = await supabase
        .from('company_contacts')
        .select('id, first_name, last_name, position, phone, email')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Failed to load client contacts');
        setContacts([]);
        return;
      }

      setContacts((data || []) as CompanyContactOption[]);
    } catch (error) {
      toast.error('Failed to load client contacts');
      setContacts([]);
    } finally {
      setContactsLoading(false);
    }
  };

  const fetchPartyAddressMatches = async (
    role: 'shipper' | 'consignee',
    query: string
  ) => {
    try {
      const searchParams = new URLSearchParams({
        role,
        q: query.trim(),
      });

      const res = await fetch(
        `/api/orders/party-addresses/search?${searchParams.toString()}`,
        { method: 'GET' }
      );

      const data = await res.json();

      if (!res.ok) {
        return;
      }

      if (role === 'shipper') {
        setShipperMatches(data.matches || []);
      } else {
        setConsigneeMatches(data.matches || []);
      }
    } catch (error) {
      // Keep this lookup non-blocking for the form.
    }
  };

  const applyPartyAddressMatch = (
    role: 'shipper' | 'consignee',
    match: PartyAddressMatch
  ) => {
    setForm((prev) =>
      role === 'shipper'
        ? {
            ...prev,
            shipper_name: match.party_name || prev.shipper_name,
            loading_address: match.address || '',
            loading_city: match.city || '',
            loading_postal_code: match.postal_code || '',
            loading_country: match.country || '',
          }
        : {
            ...prev,
            consignee_name: match.party_name || prev.consignee_name,
            unloading_address: match.address || '',
            unloading_city: match.city || '',
            unloading_postal_code: match.postal_code || '',
            unloading_country: match.country || '',
          }
    );
  };

  const resolveStoredPartyAddress = async (
    role: 'shipper' | 'consignee',
    name: string
  ) => {
    const normalizedName = name.trim();

    if (normalizedName.length < 2) {
      return;
    }

    try {
      const searchParams = new URLSearchParams({
        role,
        q: normalizedName,
      });

      const res = await fetch(
        `/api/orders/party-addresses/search?${searchParams.toString()}`,
        { method: 'GET' }
      );

      const data = await res.json();

      if (!res.ok) {
        return;
      }

      if (role === 'shipper') {
        setShipperMatches(data.matches || []);
      } else {
        setConsigneeMatches(data.matches || []);
      }

      if (data.exact_match) {
        applyPartyAddressMatch(role, data.exact_match as PartyAddressMatch);
      }
    } catch (error) {
      // Keep this lookup non-blocking for the form.
    }
  };

  const applyClientContact = (contactId: string) => {
    setSelectedContactId(contactId);

    const contact = contacts.find((item) => item.id === contactId);

    if (!contact) {
      return;
    }

    update('received_from_name', formatContactName(contact));
    update('received_from_contact', formatContactValue(contact));
  };

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();

    if (!q) return clients.slice(0, 20);

    return clients
      .filter((client) =>
        client.name?.toLowerCase().includes(q) ||
        client.company_code?.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [clients, clientSearch]);

  const selectedClient = clients.find((client) => client.id === form.client_company_id);
  const selectedClientLabel = selectedClient
    ? `${selectedClient.name}${selectedClient.company_code ? ` (${selectedClient.company_code})` : ''}`
    : '';

  const selectedManager = managers.find(
    (manager) => manager.id === form.shared_manager_user_id
  );
  const selectedManagerLabel = selectedManager
    ? formatManagerLabel(selectedManager)
    : '';
  const selectedSharedOrganizationId =
    form.shared_organization_id || currentOrganizationId;

  useEffect(() => {
    if (!selectedClient || form.payment_term_text.trim() !== '') {
      return;
    }

    if (
      selectedClient.payment_term_days !== null &&
      selectedClient.payment_term_days !== undefined
    ) {
      update(
        'payment_term_text',
        normalizePaymentTermValue(String(selectedClient.payment_term_days))
      );
    }
  }, [form.payment_term_text, selectedClient?.id, selectedClient?.payment_term_days]);

  useEffect(() => {
    if (vatRateTouched) {
      return;
    }

    const nextVatRate = String(
      resolveOrderVatRate({
        clientCountry:
          selectedClient?.country || pendingImportedCompanyCreate?.country || null,
        flags: getOrderFormFlags(form),
        customsValues: [
          form.loading_customs_info,
          form.unloading_customs_info,
          form.loading_reference,
          form.unloading_reference,
          form.cargo_description,
          form.notes,
        ],
      })
    );

    if (form.vat_rate !== nextVatRate) {
      update('vat_rate', nextVatRate);
    }
  }, [
    form.cargo_description,
    form.has_adr,
    form.has_ex1,
    form.has_sent,
    form.has_t1,
    form.loading_customs_info,
    form.loading_reference,
    form.notes,
    form.unloading_customs_info,
    form.unloading_reference,
    form.vat_rate,
    pendingImportedCompanyCreate?.country,
    selectedClient?.country,
    vatRateTouched,
  ]);

  useEffect(() => {
    if (loadTypeTouched) {
      return;
    }

    const numericCargoLdm =
      form.cargo_ldm.trim() === '' ? null : Number(form.cargo_ldm);
    const nextLoadType =
      resolveOrderLoadType({
        cargoLdm:
          numericCargoLdm !== null && Number.isFinite(numericCargoLdm)
            ? numericCargoLdm
            : null,
        values: getOrderLoadTypeValues(form),
      }) || '';

    if (form.load_type !== nextLoadType) {
      update('load_type', nextLoadType);
    }
  }, [
    form.cargo_description,
    form.cargo_ldm,
    form.loading_customs_info,
    form.loading_reference,
    form.notes,
    form.unloading_customs_info,
    form.unloading_reference,
    form.load_type,
    loadTypeTouched,
  ]);

  const filteredManagers = useMemo(() => {
    const q = managerSearch.trim().toLowerCase();

    if (q.length < 2) return [];

    return managers
      .filter((manager) =>
        formatManagerLabel(manager).toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [managerSearch, managers]);

  const hasImportedFieldValue = (field: string) => {
    if (!IMPORT_REQUIRED_FIELDS.has(field)) {
      return true;
    }

    if (field === 'client_company_id') {
      return !!(form.client_company_id || pendingImportedCompanyCreate);
    }

    const value = form[field as keyof typeof form];

    if (typeof value === 'string') {
      return value.trim() !== '';
    }

    if (typeof value === 'number') {
      return Number.isFinite(value);
    }

    return value !== null && value !== undefined;
  };

  const shouldHighlightImportedField = (field: string) =>
    hasImportedPrefill && IMPORT_REQUIRED_FIELDS.has(field) && !hasImportedFieldValue(field);

  const getFieldInputClass = (field: string, extraClasses = '') =>
    joinClassNames(
      'w-full border rounded-md px-3 py-2',
      shouldHighlightImportedField(field)
        ? 'border-red-200 bg-red-50 placeholder:text-red-300'
        : 'bg-white',
      extraClasses
    );

  const uploadImportDocument = async (file: File): Promise<UploadedOrderImport> => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/orders/imports/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to upload import');
    }

    return data.order_import as UploadedOrderImport;
  };

  const triggerImportProcessing = async (importId: string) => {
    const res = await fetch('/api/orders/imports/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: importId }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.error || 'Failed to process import');
    }

    return data?.order_import as UploadedOrderImport | undefined;
  };

  const addPendingDocuments = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    try {
      setImportingDocuments(true);

      const nextDocuments = await Promise.all(
        Array.from(files).map(async (file) => {
          try {
            const orderImport = await uploadImportDocument(file);

            if (orderImport?.id && orderImport.status === 'uploaded') {
              void triggerImportProcessing(orderImport.id)
                .then((processedImport) => {
                  if (!processedImport) {
                    return;
                  }

                  setPendingDocuments((prev) =>
                    prev.map((document) =>
                      document.importId === orderImport.id
                        ? {
                            ...document,
                            importStatus: processedImport.status ?? document.importStatus,
                            matchResult:
                              processedImport.match_result_json ?? document.matchResult,
                            importError:
                              processedImport.error_text ?? document.importError,
                          }
                        : document
                    )
                  );
                })
                .catch((error) => {
                  setPendingDocuments((prev) =>
                    prev.map((document) =>
                      document.importId === orderImport.id
                        ? {
                            ...document,
                            importError:
                              error instanceof Error
                                ? error.message
                                : 'Failed to process import',
                          }
                        : document
                    )
                  );
                });
            }

            return {
              id: crypto.randomUUID(),
              file,
              importId: orderImport?.id ?? null,
              importStatus: orderImport?.status ?? 'uploaded',
              matchResult: orderImport?.match_result_json ?? null,
              importError: orderImport?.error_text ?? null,
              reviewHandled: false,
            } as PendingOrderDocument;
          } catch (error) {
            return {
              id: crypto.randomUUID(),
              file,
              importId: null,
              importStatus: null,
              matchResult: null,
              importError:
                error instanceof Error ? error.message : 'Failed to upload import',
              reviewHandled: false,
            } as PendingOrderDocument;
          }
        })
      );

      setPendingDocuments((prev) => [...prev, ...nextDocuments]);
    } finally {
      setImportingDocuments(false);
    }
  };

  const removePendingDocument = async (documentId: string) => {
    const documentToRemove = pendingDocuments.find(
      (document) => document.id === documentId
    );

    setPendingDocuments((prev) =>
      prev.filter((document) => document.id !== documentId)
    );

    if (!documentToRemove?.importId) {
      return;
    }

    const res = await fetch('/api/orders/imports/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: documentToRemove.importId }),
    });

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || 'Failed to remove import');
    }
  };

  const uploadPendingDocuments = async (orderId: string) => {
    const failedFiles: string[] = [];
    let uploadedCount = 0;

    for (const document of pendingDocuments) {
      const formData = new FormData();
      formData.append('order_id', orderId);
      formData.append('file', document.file);
      if (document.importId) {
        formData.append('skip_order_import', '1');
      }

      const res = await fetch('/api/orders/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        failedFiles.push(document.file.name);
        continue;
      }

      uploadedCount += 1;

      if (document.importId) {
        await fetch('/api/orders/imports/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: document.importId }),
        });
      }
    }

    return { uploadedCount, failedFiles };
  };

  const applyImportedPrefill = (matchResult: any, createNewCompany: boolean) => {
    const prefill = matchResult?.suggested_order_prefill || {};
    const companyMatch = matchResult?.company_match?.primary || null;
    const matchedContact = matchResult?.contact_match?.match || null;
    const contactCreate = matchResult?.suggested_contact_create || null;
    const companyCreate = matchResult?.suggested_company_create || null;
    const nextShipperName = prefill.shipper_name || form.shipper_name;
    const nextConsigneeName = prefill.consignee_name || form.consignee_name;
    const importedFlags = detectOrderCargoFlagsFromValues([
      prefill.cargo_description,
      prefill.loading_customs_info,
      prefill.unloading_customs_info,
      prefill.loading_reference,
      prefill.unloading_reference,
      prefill.notes,
    ]);
    const nextVatRate = String(
      resolveOrderVatRate({
        explicitVatRate: parseOrderVatRate(prefill.vat_rate),
        clientCountry: companyMatch?.country || companyCreate?.country || prefill.client_country,
        flags: {
          has_ex1: prefill.has_ex1 ?? importedFlags.has_ex1,
          has_t1: prefill.has_t1 ?? importedFlags.has_t1,
          has_adr: prefill.has_adr ?? importedFlags.has_adr,
          has_sent: prefill.has_sent ?? importedFlags.has_sent,
        },
        customsValues: [
          prefill.loading_customs_info,
          prefill.unloading_customs_info,
          prefill.loading_reference,
          prefill.unloading_reference,
          prefill.notes,
          prefill.cargo_description,
        ],
      })
    );
    const nextLoadType =
      resolveOrderLoadType({
        explicitLoadType: prefill.load_type,
        cargoLdm:
          prefill.cargo_ldm !== null && prefill.cargo_ldm !== undefined
            ? Number(prefill.cargo_ldm)
            : null,
        values: getOrderLoadTypeValues({
          cargo_description: prefill.cargo_description,
          notes: prefill.notes,
          loading_customs_info: prefill.loading_customs_info,
          unloading_customs_info: prefill.unloading_customs_info,
          loading_reference: prefill.loading_reference,
          unloading_reference: prefill.unloading_reference,
        }),
      }) || '';

    setVatRateTouched(false);
    setLoadTypeTouched(false);
    setHasImportedPrefill(true);

    setForm((prev) => ({
      ...prev,
      client_order_number:
        prefill.client_order_number || prev.client_order_number,
      client_company_id:
        createNewCompany
          ? ''
          : prefill.client_company_id || '',
      received_from_name: prefill.received_from_name || prev.received_from_name,
      received_from_contact:
        prefill.received_from_contact || prev.received_from_contact,
      loading_date: prefill.loading_date || prev.loading_date,
      loading_time_from:
        prefill.loading_time_from || prefill.loading_time || prev.loading_time_from,
      loading_time_to: prefill.loading_time_to || prev.loading_time_to,
      loading_address: prefill.loading_address || prev.loading_address,
      loading_city: prefill.loading_city || prev.loading_city,
      loading_postal_code:
        prefill.loading_postal_code || prev.loading_postal_code,
      loading_country: prefill.loading_country || prev.loading_country,
      loading_contact: prefill.loading_contact || prev.loading_contact,
      loading_reference: prefill.loading_reference || prev.loading_reference,
      loading_customs_info:
        prefill.loading_customs_info || prev.loading_customs_info,
      unloading_date: prefill.unloading_date || prev.unloading_date,
      unloading_time_from:
        prefill.unloading_time_from || prefill.unloading_time || prev.unloading_time_from,
      unloading_time_to: prefill.unloading_time_to || prev.unloading_time_to,
      unloading_address: prefill.unloading_address || prev.unloading_address,
      unloading_city: prefill.unloading_city || prev.unloading_city,
      unloading_postal_code:
        prefill.unloading_postal_code || prev.unloading_postal_code,
      unloading_country: prefill.unloading_country || prev.unloading_country,
      unloading_contact: prefill.unloading_contact || prev.unloading_contact,
      unloading_reference:
        prefill.unloading_reference || prev.unloading_reference,
      unloading_customs_info:
        prefill.unloading_customs_info || prev.unloading_customs_info,
      shipper_name: prefill.shipper_name || prev.shipper_name,
      consignee_name: prefill.consignee_name || prev.consignee_name,
      cargo_description: prefill.cargo_description || prev.cargo_description,
      cargo_quantity: prefill.cargo_quantity || prev.cargo_quantity,
      cargo_kg:
        prefill.cargo_kg !== null && prefill.cargo_kg !== undefined
          ? String(prefill.cargo_kg)
          : prev.cargo_kg,
      cargo_ldm:
        prefill.cargo_ldm !== null && prefill.cargo_ldm !== undefined
          ? String(prefill.cargo_ldm)
          : prev.cargo_ldm,
      load_type: nextLoadType || prev.load_type,
      has_ex1: prefill.has_ex1 ?? importedFlags.has_ex1 ?? prev.has_ex1,
      has_t1: prefill.has_t1 ?? importedFlags.has_t1 ?? prev.has_t1,
      has_adr: prefill.has_adr ?? importedFlags.has_adr ?? prev.has_adr,
      has_sent: prefill.has_sent ?? importedFlags.has_sent ?? prev.has_sent,
      price:
        prefill.price !== null && prefill.price !== undefined
          ? String(prefill.price)
          : prev.price,
      vat_rate: nextVatRate,
      currency: prefill.currency || prev.currency,
      payment_term_text:
        normalizePaymentTermValue(prefill.payment_term_text) ||
        prev.payment_term_text,
      payment_type: prefill.payment_type || prev.payment_type,
      notes: prefill.notes || prev.notes,
    }));

    if (nextShipperName) {
      void resolveStoredPartyAddress('shipper', nextShipperName);
    }

    if (nextConsigneeName) {
      void resolveStoredPartyAddress('consignee', nextConsigneeName);
    }

    if (createNewCompany && companyCreate) {
      const fallbackNameParts = splitFullName(
        contactCreate
          ? `${contactCreate.first_name || ''} ${contactCreate.last_name || ''}`.trim()
          : prefill.received_from_name || form.received_from_name
      );

      setPendingImportedCompanyCreate(companyCreate);
      setPendingImportedContactCreate({
        first_name: contactCreate?.first_name || fallbackNameParts.first_name,
        last_name: contactCreate?.last_name || fallbackNameParts.last_name,
        phone: contactCreate?.phone || '',
        email: contactCreate?.email || '',
      });
      setClientSearch('');
      setSelectedContactId('');
      return;
    }

    setPendingImportedCompanyCreate(null);
    setPendingImportedContactCreate(contactCreate);
    setSelectedContactId(matchedContact?.id || '');
    setClientSearch(
      companyMatch
        ? `${companyMatch.name || ''}${
            companyMatch.company_code ? ` (${companyMatch.company_code})` : ''
          }`
        : ''
    );
  };

  const handleReadyImportReview = async (documentId: string, matchResult: any) => {
    const requiresCompanyConfirm =
      !!matchResult?.ui_actions?.show_company_create_confirm;

    let confirmedCreate = false;

    if (requiresCompanyConfirm) {
      confirmedCreate = window.confirm(
        matchResult?.ui_actions?.company_create_confirm_message ||
          'Add new company?'
      );
    }

    applyImportedPrefill(matchResult, confirmedCreate);

    setPendingDocuments((prev) =>
      prev.map((document) =>
        document.id === documentId
          ? { ...document, reviewHandled: true }
          : document
      )
    );

    toast.success('Import data applied');
  };

  const refreshPendingImportStatuses = async () => {
    const currentDocuments = pendingDocumentsRef.current;
    const importIds = currentDocuments
      .map((document) => document.importId)
      .filter(Boolean) as string[];

    if (importIds.length === 0) {
      return;
    }

    const searchParams = new URLSearchParams({
      ids: importIds.join(','),
      mine: '1',
      limit: String(importIds.length),
    });

    const res = await fetch(`/api/orders/imports/list?${searchParams.toString()}`, {
      method: 'GET',
    });

    if (!res.ok) {
      return;
    }

    const data = await res.json();
    const importsById = new Map<string, any>(
      (data.order_imports || []).map((orderImport: any) => [orderImport.id, orderImport])
    );

    const nextDocuments = currentDocuments.map((document) => {
      const orderImport = document.importId
        ? importsById.get(document.importId)
        : null;

      if (!orderImport) {
        return document;
      }

      return {
        ...document,
        importStatus: orderImport.status,
        matchResult: orderImport.match_result_json ?? null,
        importError: orderImport.error_text ?? null,
      };
    });

    setPendingDocuments(nextDocuments);

    for (const document of nextDocuments) {
      if (
        document.importStatus === 'ready_for_review' &&
        document.matchResult &&
        !document.reviewHandled
      ) {
        await handleReadyImportReview(document.id, document.matchResult);
        break;
      }
    }
  };

  const trackedImportIdsKey = useMemo(
    () =>
      pendingDocuments
        .map((document) => document.importId)
        .filter(Boolean)
        .join('|'),
    [pendingDocuments]
  );

  useEffect(() => {
    const hasTrackedImports = trackedImportIdsKey !== '';

    if (!hasTrackedImports) {
      return;
    }

    void refreshPendingImportStatuses();

    const intervalId = window.setInterval(() => {
      void refreshPendingImportStatuses();
    }, 6000);

    return () => window.clearInterval(intervalId);
  }, [trackedImportIdsKey]);

  const ensureImportedCompanyAndContact = async () => {
    let clientCompanyId = form.client_company_id || null;

    if (!clientCompanyId && pendingImportedCompanyCreate?.company_code && pendingImportedCompanyCreate?.name) {
      const createCompanyRes = await fetch('/api/companies/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_code: pendingImportedCompanyCreate.company_code,
          name: pendingImportedCompanyCreate.name,
          vat_code: pendingImportedCompanyCreate.vat_code || null,
          country: pendingImportedCompanyCreate.country || null,
          postal_code: pendingImportedCompanyCreate.postal_code || null,
          city: pendingImportedCompanyCreate.city || null,
          address: pendingImportedCompanyCreate.address || null,
          phone: pendingImportedCompanyCreate.phone || null,
          email: pendingImportedCompanyCreate.email || null,
          website: null,
          payment_term_days: null,
          is_client: true,
          is_carrier: false,
          notes: 'Created from order import review',
        }),
      });

      const createCompanyData = await createCompanyRes.json();

      if (!createCompanyRes.ok) {
        throw new Error(createCompanyData.error || 'Failed to create company');
      }

      clientCompanyId = createCompanyData.company?.id || null;
      setPendingImportedCompanyCreate(null);
      setClientSearch(
        `${createCompanyData.company?.name || ''}${
          createCompanyData.company?.company_code
            ? ` (${createCompanyData.company.company_code})`
            : ''
        }`
      );
    }

    const pendingContact = pendingImportedContactCreate
      ? {
          first_name:
            typeof pendingImportedContactCreate.first_name === 'string'
              ? pendingImportedContactCreate.first_name.trim()
              : '',
          last_name:
            typeof pendingImportedContactCreate.last_name === 'string'
              ? pendingImportedContactCreate.last_name.trim()
              : '',
          phone:
            typeof pendingImportedContactCreate.phone === 'string'
              ? pendingImportedContactCreate.phone.trim()
              : '',
          email:
            typeof pendingImportedContactCreate.email === 'string'
              ? pendingImportedContactCreate.email.trim()
              : '',
        }
      : null;

    if (
      clientCompanyId &&
      pendingContact &&
      [
        pendingContact.first_name,
        pendingContact.last_name,
        pendingContact.phone,
        pendingContact.email,
      ].some(Boolean)
    ) {
      if (!pendingContact.first_name) {
        throw new Error('Manager first name is required for new company contact');
      }

      const createContactRes = await fetch('/api/company-contacts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: clientCompanyId,
          first_name: pendingContact.first_name,
          last_name: pendingContact.last_name || null,
          phone: pendingContact.phone || null,
          email: pendingContact.email || null,
        }),
      });

      const createContactData = await createContactRes.json();

      if (!createContactRes.ok) {
        throw new Error(createContactData.error || 'Failed to create contact');
      }

      setPendingImportedContactCreate(null);
    }

    return clientCompanyId;
  };

  const saveOrder = async () => {
    if (!form.client_order_number.trim()) {
      toast.error('Client order number is required');
      return;
    }

    setLoading(true);

    try {
      const ensuredClientCompanyId = await ensureImportedCompanyAndContact();

      const payload = {
        ...form,
        client_company_id: ensuredClientCompanyId,
        cargo_kg: form.cargo_kg === '' ? null : Number(form.cargo_kg),
        cargo_ldm: form.cargo_ldm === '' ? null : Number(form.cargo_ldm),
        load_type: form.load_type || null,
        price: form.price === '' ? null : Number(form.price),
        vat_rate: Number(form.vat_rate),
      };

      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to create order');
        return;
      }

      if (pendingDocuments.length > 0) {
        const { uploadedCount, failedFiles } = await uploadPendingDocuments(data.id);

        if (uploadedCount > 0) {
          toast.success(
            `Order created: ${data.internal_order_number}. Documents saved: ${uploadedCount}`
          );
        } else {
          toast.success(`Order created: ${data.internal_order_number}`);
        }

        if (failedFiles.length > 0) {
          toast.error(`Failed to save: ${failedFiles.join(', ')}`);
        }
      } else {
        toast.success(`Order created: ${data.internal_order_number}`);
      }

      setPendingDocuments([]);
      router.push('/app/orders');
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">New Order</h1>
      </div>

      <div className="rounded-2xl border bg-white p-6 space-y-6">
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_280px]">
          <div className="flex flex-col gap-2">
            <label className="block text-center text-sm font-medium mb-1">Client order number</label>
            <input
              placeholder="Client order number"
              value={form.client_order_number}
              onChange={(e) => update('client_order_number', e.target.value)}
              className={getFieldInputClass('client_order_number')}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="block text-center text-sm font-medium">Client</label>

            <input
              placeholder="Start typing client name or code..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className={getFieldInputClass('client_company_id')}
              disabled={clientsLoading}
            />

            {clientSearch.trim() !== '' && clientSearch !== selectedClientLabel && (
              <div className="border rounded-md bg-white max-h-56 overflow-y-auto">
                {filteredClients.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-500">No clients found</div>
                ) : (
                  filteredClients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => {
                        update('client_company_id', client.id);
                        update('received_from_name', '');
                        update('received_from_contact', '');
                        setSelectedContactId('');
                        setClientSearch(
                          `${client.name}${client.company_code ? ` (${client.company_code})` : ''}`
                        );
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b last:border-b-0"
                    >
                      {client.name}
                      {client.company_code ? ` (${client.company_code})` : ''}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="block text-center text-sm font-medium">Documents</label>

            <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-md border bg-white px-4 py-2 text-sm hover:bg-slate-50">
              {importingDocuments ? 'Adding...' : 'Add order'}
              <input
                type="file"
                accept={ORDER_DOCUMENT_ACCEPT_ATTRIBUTE}
                multiple
                className="hidden"
                onChange={(e) => {
                  void addPendingDocuments(e.target.files);
                  e.currentTarget.value = '';
                }}
              />
            </label>

            {pendingDocuments.length > 0 ? (
              <div className="space-y-1">
                {pendingDocuments.map((document) => (
                  <div
                    key={document.id}
                    className="flex items-start gap-2 rounded-md border bg-slate-50 px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-slate-700">
                        {document.file.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                          {document.importStatus === 'ready_for_review'
                            ? 'Ready'
                            : document.importError
                              ? 'Error'
                              : 'Added'}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {formatOrderDocumentFileSize(document.file.size)}
                        </span>
                      </div>
                      {document.importError ? (
                        <div className="mt-0.5 text-[10px] text-red-600">
                          {document.importError}
                        </div>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => void removePendingDocument(document.id)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-red-600 hover:bg-red-50"
                      aria-label={`Remove ${document.file.name}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="text-center text-sm font-semibold text-slate-700">
            Received From
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <select
              value={selectedContactId}
              onChange={(e) => applyClientContact(e.target.value)}
              className="w-full border rounded-md px-3 py-2 bg-white"
              disabled={!form.client_company_id || contactsLoading}
            >
              <option value="">
                {form.client_company_id ? 'Select existing contact' : 'Select client first'}
              </option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {formatContactOptionLabel(contact)}
                </option>
              ))}
            </select>

            <input
              placeholder="Name, Surname"
              value={form.received_from_name}
              onChange={(e) => {
                setSelectedContactId('');
                update('received_from_name', e.target.value);
              }}
              className={getFieldInputClass('received_from_name')}
            />

            <input
              placeholder="Contact"
              value={form.received_from_contact}
              onChange={(e) => {
                setSelectedContactId('');
                update('received_from_contact', e.target.value);
              }}
              className={getFieldInputClass('received_from_contact')}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[120px_minmax(0,280px)_110px_90px] xl:items-end">
            <div>
              <label className="mb-1 block text-center text-sm font-medium">Price</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Price"
                value={form.price}
                onChange={(e) => update('price', e.target.value)}
                className={getFieldInputClass('price')}
              />
            </div>

            <div>
              <label className="mb-1 block text-center text-sm font-medium">
                Payment term and type
              </label>
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                <input
                  placeholder="30"
                  value={form.payment_term_text}
                  onChange={(e) =>
                    update('payment_term_text', normalizePaymentTermValue(e.target.value))
                  }
                  className="w-full border rounded-md px-3 py-2 bg-white"
                />
                <select
                  value={form.payment_type}
                  onChange={(e) => update('payment_type', e.target.value)}
                  className="w-full border rounded-md px-3 py-2 bg-white"
                >
                  <option value="">Type</option>
                  {PAYMENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-center text-sm font-medium">Currency</label>
              <select
                value={form.currency}
                onChange={(e) => update('currency', e.target.value)}
                className="w-full border rounded-md px-3 py-2 bg-white"
              >
                {currencyOptions.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-center text-sm font-medium">PVM</label>
              <select
                value={form.vat_rate}
                onChange={(e) => {
                  setVatRateTouched(true);
                  update('vat_rate', e.target.value);
                }}
                className="w-full border rounded-md px-3 py-2 bg-white"
              >
                {vatRateOptions.map((vatRate) => (
                  <option key={vatRate} value={vatRate}>
                    {vatRate}%
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start">
          <label className="text-sm font-medium lg:pt-2">Show order to manager</label>
          <div className="space-y-2">
            <select
              value={selectedSharedOrganizationId}
              onChange={(e) => {
                update('shared_organization_id', e.target.value);
                update('shared_manager_user_id', '');
                setManagerSearch('');
              }}
              className="w-full border rounded-md px-3 py-2 bg-white"
            >
              <option value="">Select organization</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>

            <input
              placeholder="Type manager name..."
              value={managerSearch}
              onChange={(e) => {
                update('shared_manager_user_id', '');
                setManagerSearch(e.target.value);
              }}
              className="w-full border rounded-md px-3 py-2"
              disabled={managersLoading || !selectedSharedOrganizationId}
            />

            {managerSearch.trim().length >= 2 &&
              managerSearch !== selectedManagerLabel && (
                <div className="border rounded-md bg-white max-h-56 overflow-y-auto">
                  {filteredManagers.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-500">
                      No managers found
                    </div>
                  ) : (
                    filteredManagers.map((manager) => (
                      <button
                        key={manager.id}
                        type="button"
                        onClick={() => {
                          update('shared_manager_user_id', manager.id);
                          setManagerSearch(formatManagerLabel(manager));
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b last:border-b-0"
                      >
                        {formatManagerLabel(manager)}
                      </button>
                    ))
                  )}
                </div>
              )}
          </div>
        </div>

        {pendingImportedCompanyCreate ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900 space-y-3">
            <div>
              New client company will be created on Save: {pendingImportedCompanyCreate.name}
              {pendingImportedCompanyCreate.company_code
                ? ` (${pendingImportedCompanyCreate.company_code})`
                : ''}
            </div>

            <div className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <input
                placeholder="Manager name"
                value={pendingImportedContactCreate?.first_name || ''}
                onChange={(e) =>
                  setPendingImportedContactCreate((prev: any) => ({
                    first_name: e.target.value,
                    last_name: prev?.last_name || '',
                    phone: prev?.phone || '',
                    email: prev?.email || '',
                  }))
                }
                className="w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm"
              />

              <input
                placeholder="Manager surname"
                value={pendingImportedContactCreate?.last_name || ''}
                onChange={(e) =>
                  setPendingImportedContactCreate((prev: any) => ({
                    first_name: prev?.first_name || '',
                    last_name: e.target.value,
                    phone: prev?.phone || '',
                    email: prev?.email || '',
                  }))
                }
                className="w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm"
              />

              <input
                placeholder="Tel. nr."
                value={pendingImportedContactCreate?.phone || ''}
                onChange={(e) =>
                  setPendingImportedContactCreate((prev: any) => ({
                    first_name: prev?.first_name || '',
                    last_name: prev?.last_name || '',
                    phone: e.target.value,
                    email: prev?.email || '',
                  }))
                }
                className="w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm"
              />

              <input
                placeholder="Email"
                value={pendingImportedContactCreate?.email || ''}
                onChange={(e) =>
                  setPendingImportedContactCreate((prev: any) => ({
                    first_name: prev?.first_name || '',
                    last_name: prev?.last_name || '',
                    phone: prev?.phone || '',
                    email: e.target.value,
                  }))
                }
                className="w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="text-center text-sm font-semibold text-slate-900">Loading</div>

            <div className="grid grid-cols-[minmax(0,1fr)_88px_88px] items-center gap-2">
              <input
                type="date"
                value={form.loading_date}
                onChange={(e) => update('loading_date', e.target.value)}
                className={getFieldInputClass('loading_date')}
              />
              <input
                type="text"
                value={form.loading_time_from}
                onChange={(e) => update('loading_time_from', e.target.value)}
                inputMode="numeric"
                maxLength={5}
                placeholder="08:30"
                className="w-full border rounded-md px-3 py-2"
              />
              <input
                type="text"
                value={form.loading_time_to}
                onChange={(e) => update('loading_time_to', e.target.value)}
                inputMode="numeric"
                maxLength={5}
                placeholder="16:30"
                className="w-full border rounded-md px-3 py-2"
              />
            </div>

            <input
              placeholder="Loading address"
              value={form.loading_address}
              onChange={(e) => update('loading_address', e.target.value)}
              className={getFieldInputClass('loading_address')}
            />

            <input
              placeholder="Loading city"
              value={form.loading_city}
              onChange={(e) => update('loading_city', e.target.value)}
              className={getFieldInputClass('loading_city')}
            />

            <input
              placeholder="Loading postal code"
              value={form.loading_postal_code}
              onChange={(e) => update('loading_postal_code', e.target.value)}
              className={getFieldInputClass('loading_postal_code')}
            />

            <div>
              <input
                list="order-country-options"
                placeholder="Loading country"
                value={form.loading_country}
                onChange={(e) => update('loading_country', e.target.value)}
                className={getFieldInputClass('loading_country')}
              />

              <datalist id="order-country-options">
                {COUNTRIES.map((country) => (
                  <option key={country} value={country} />
                ))}
              </datalist>
            </div>

            <input
              placeholder="Loading contact"
              value={form.loading_contact}
              onChange={(e) => update('loading_contact', e.target.value)}
              className="w-full border rounded-md px-3 py-2"
            />

            <input
              placeholder="Loading reference"
              value={form.loading_reference}
              onChange={(e) => update('loading_reference', e.target.value)}
              className="w-full border rounded-md px-3 py-2"
            />

            <textarea
              placeholder="Loading customs info"
              value={form.loading_customs_info}
              onChange={(e) => update('loading_customs_info', e.target.value)}
              className="w-full border rounded-md px-3 py-2 min-h-[90px]"
            />
          </div>

          <div className="space-y-4">
            <div className="text-center text-sm font-semibold text-slate-900">Unloading</div>

            <div className="grid grid-cols-[minmax(0,1fr)_88px_88px] items-center gap-2">
              <input
                type="date"
                value={form.unloading_date}
                onChange={(e) => update('unloading_date', e.target.value)}
                className={getFieldInputClass('unloading_date')}
              />
              <input
                type="text"
                value={form.unloading_time_from}
                onChange={(e) => update('unloading_time_from', e.target.value)}
                inputMode="numeric"
                maxLength={5}
                placeholder="08:30"
                className="w-full border rounded-md px-3 py-2"
              />
              <input
                type="text"
                value={form.unloading_time_to}
                onChange={(e) => update('unloading_time_to', e.target.value)}
                inputMode="numeric"
                maxLength={5}
                placeholder="16:30"
                className="w-full border rounded-md px-3 py-2"
              />
            </div>

            <input
              placeholder="Unloading address"
              value={form.unloading_address}
              onChange={(e) => update('unloading_address', e.target.value)}
              className={getFieldInputClass('unloading_address')}
            />

            <input
              placeholder="Unloading city"
              value={form.unloading_city}
              onChange={(e) => update('unloading_city', e.target.value)}
              className={getFieldInputClass('unloading_city')}
            />

            <input
              placeholder="Unloading postal code"
              value={form.unloading_postal_code}
              onChange={(e) => update('unloading_postal_code', e.target.value)}
              className={getFieldInputClass('unloading_postal_code')}
            />

            <input
              list="order-country-options"
              placeholder="Unloading country"
              value={form.unloading_country}
              onChange={(e) => update('unloading_country', e.target.value)}
              className={getFieldInputClass('unloading_country')}
            />

            <input
              placeholder="Unloading contact"
              value={form.unloading_contact}
              onChange={(e) => update('unloading_contact', e.target.value)}
              className="w-full border rounded-md px-3 py-2"
            />

            <input
              placeholder="Unloading reference"
              value={form.unloading_reference}
              onChange={(e) => update('unloading_reference', e.target.value)}
              className="w-full border rounded-md px-3 py-2"
            />

            <textarea
              placeholder="Unloading customs info"
              value={form.unloading_customs_info}
              onChange={(e) => update('unloading_customs_info', e.target.value)}
              className="w-full border rounded-md px-3 py-2 min-h-[90px]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            placeholder="Shipper name"
            list="shipper-party-address-options"
            value={form.shipper_name}
            onChange={(e) => {
              const nextValue = e.target.value;
              update('shipper_name', nextValue);

              const exactMatch = shipperMatches.find(
                (match) =>
                  normalizePartyMatchText(match.party_name) ===
                  normalizePartyMatchText(nextValue)
              );

              if (exactMatch) {
                applyPartyAddressMatch('shipper', exactMatch);
              }
            }}
            onBlur={(e) => void resolveStoredPartyAddress('shipper', e.target.value)}
            className={getFieldInputClass('shipper_name')}
          />

          <input
            placeholder="Consignee name"
            list="consignee-party-address-options"
            value={form.consignee_name}
            onChange={(e) => {
              const nextValue = e.target.value;
              update('consignee_name', nextValue);

              const exactMatch = consigneeMatches.find(
                (match) =>
                  normalizePartyMatchText(match.party_name) ===
                  normalizePartyMatchText(nextValue)
              );

              if (exactMatch) {
                applyPartyAddressMatch('consignee', exactMatch);
              }
            }}
            onBlur={(e) => void resolveStoredPartyAddress('consignee', e.target.value)}
            className={getFieldInputClass('consignee_name')}
          />
        </div>

        <datalist id="shipper-party-address-options">
          {shipperMatches.map((match) => (
            <option key={match.id} value={match.party_name} />
          ))}
        </datalist>

        <datalist id="consignee-party-address-options">
          {consigneeMatches.map((match) => (
            <option key={match.id} value={match.party_name} />
          ))}
        </datalist>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="text-center text-sm font-semibold text-slate-700">
            Cargo Description
          </div>

          <textarea
            placeholder="Cargo description, e. g. 120x100x100 big bags"
            value={form.cargo_description}
            onChange={(e) => update('cargo_description', e.target.value)}
            className={getFieldInputClass('cargo_description', 'min-h-[72px]')}
          />

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_120px_120px_112px_auto] xl:items-center">
            <input
              placeholder="Quantity, e.g. x2"
              value={form.cargo_quantity}
              onChange={(e) => update('cargo_quantity', e.target.value)}
              className={getFieldInputClass('cargo_quantity')}
            />

            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={form.cargo_kg}
                onChange={(e) => update('cargo_kg', e.target.value)}
                className={getFieldInputClass('cargo_kg', 'pr-12')}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-500">
                KG
              </span>
            </div>

            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={form.cargo_ldm}
                onChange={(e) => update('cargo_ldm', e.target.value)}
                className={getFieldInputClass('cargo_ldm', 'pr-14')}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-500">
                LDM
              </span>
            </div>

            <select
              value={form.load_type}
              onChange={(e) => {
                setLoadTypeTouched(true);
                update('load_type', e.target.value);
              }}
              className="w-full border rounded-md px-3 py-2 bg-white"
            >
              <option value="">LTL / FTL</option>
              {ORDER_LOAD_TYPES.map((loadType) => (
                <option key={loadType} value={loadType}>
                  {loadType}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap items-center gap-2">
              {[
                ['has_ex1', 'EX1'],
                ['has_t1', 'T1'],
                ['has_adr', 'ADR'],
                ['has_sent', 'SENT'],
              ].map(([field, label]) => (
                <label
                  key={field}
                  className="flex items-center justify-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(form[field as keyof typeof form])}
                    onChange={(e) => update(field, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <textarea
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          className="w-full border rounded-md px-3 py-2 min-h-[120px]"
        />
      </div>

      <div className="flex gap-4">
        <button
          onClick={saveOrder}
          disabled={loading}
          className="bg-slate-900 text-white px-6 py-2 rounded-md"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin inline mr-2" size={16} />
              Saving...
            </>
          ) : (
            'Save'
          )}
        </button>

        <button
          onClick={() => router.push('/app/orders')}
          className="border px-6 py-2 rounded-md"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
