'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { ArrowLeft, FileText, Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { COUNTRIES } from '@/lib/constants/countries';
import {
  CARGO_LEG_TYPES,
  CARGO_LEG_TYPE_LABELS,
  type CargoLegType,
} from '@/lib/constants/cargo-leg-types';
import {
  ORDER_DOCUMENT_ACCEPT_ATTRIBUTE,
  ORDER_DOCUMENT_ZONE_LABELS,
  ORDER_DOCUMENT_ZONES,
  formatOrderDocumentFileSize,
  type OrderDocumentZone,
} from '@/lib/constants/order-documents';
import {
  PAYMENT_TYPE_OPTIONS,
  formatPaymentTypeLabel,
} from '@/lib/constants/payment-types';
import {
  ORDER_LOAD_TYPES,
  parseOrderVatRate,
  resolveOrderLoadType,
  resolveOrderVatRate,
} from '@/lib/utils/order-fields';

const orderStatusOptions = [
  'unconfirmed',
  'confirmed',
  'active',
  'completed',
] as const;

type OrderDetails = {
  id: string;
  internal_order_number: string;
  client_order_number: string;
  status: (typeof orderStatusOptions)[number];
  can_view_financials: boolean;
  loading_date: string | null;
  loading_time_from: string | null;
  loading_time_to: string | null;
  loading_address: string | null;
  loading_city: string | null;
  loading_postal_code: string | null;
  loading_country: string | null;
  loading_contact: string | null;
  loading_reference: string | null;
  loading_customs_info: string | null;
  unloading_date: string | null;
  unloading_time_from: string | null;
  unloading_time_to: string | null;
  unloading_address: string | null;
  unloading_city: string | null;
  unloading_postal_code: string | null;
  unloading_country: string | null;
  unloading_contact: string | null;
  unloading_reference: string | null;
  unloading_customs_info: string | null;
  shipper_name: string | null;
  consignee_name: string | null;
  received_from_name: string | null;
  received_from_contact: string | null;
  cargo_kg: number | null;
  cargo_quantity: string | null;
  cargo_description: string | null;
  cargo_ldm: number | null;
  load_type: 'LTL' | 'FTL' | null;
  has_ex1: boolean | null;
  has_t1: boolean | null;
  has_adr: boolean | null;
  has_sent: boolean | null;
  price: number | null;
  vat_rate: 0 | 21;
  currency: 'EUR' | 'PLN' | 'USD';
  payment_term_text: string | null;
  payment_type: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  client: {
    id?: string | null;
    name: string | null;
    company_code: string | null;
  } | null;
  assigned_manager: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  created_by_user: {
    first_name: string | null;
    last_name: string | null;
  } | null;
};

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
  type?: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  contact_phone: string | null;
  contact_email: string | null;
};

type OrganizationWarehouseOption = {
  id: string;
  organization_id: string;
  name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
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

type RouteTripOption = {
  id: string;
  trip_number: string;
  status: string | null;
  driver_name: string | null;
  truck_plate: string | null;
  trailer_plate: string | null;
  is_groupage: boolean | null;
  created_by: string | null;
  created_by_user: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  carrier: {
    name: string | null;
    company_code: string | null;
  } | null;
};

type CargoLegRow = {
  id: string;
  organization_id: string | null;
  responsible_organization_id: string | null;
  responsible_warehouse_id: string | null;
  show_to_all_managers: boolean;
  order_trip_link_id: string;
  linked_trip_id: string | null;
  leg_order: number;
  leg_type: CargoLegType;
  created_at: string | null;
  updated_at: string | null;
  responsible_organization: {
    id: string | null;
    name: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    country: string | null;
    contact_phone: string | null;
    contact_email: string | null;
  } | null;
  responsible_warehouse: {
    id: string | null;
    name: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    country: string | null;
  } | null;
  shared_managers: Array<{
    id: string | null;
    shared_organization_id: string | null;
    first_name: string | null;
    last_name: string | null;
  }>;
  linked_trip: RouteTripOption | null;
};

type LinkedTripRow = {
  link_id: string;
  trip_id: string;
  trip_number: string;
  status: string | null;
  driver_name: string | null;
  truck_plate: string | null;
  trailer_plate: string | null;
  created_at: string | null;
  carrier: {
    name: string | null;
    company_code: string | null;
  } | null;
  cargo_legs: CargoLegRow[];
};

type AvailableTripRow = {
  id: string;
  trip_number: string;
  status: string | null;
  driver_name: string | null;
  truck_plate: string | null;
  trailer_plate: string | null;
  created_at: string | null;
  carrier: {
    name: string | null;
    company_code: string | null;
  } | null;
};

const currencyOptions = ['EUR', 'PLN', 'USD'] as const;
const vatRateOptions = ['0', '21'] as const;

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

type OrderDocumentRow = {
  id: string;
  order_id: string;
  original_file_name: string;
  mime_type: string;
  file_size: number;
  document_zone: OrderDocumentZone;
  created_at: string | null;
  signed_url: string | null;
  can_manage: boolean;
  created_by_user:
    | {
        first_name: string | null;
        last_name: string | null;
      }
    | null;
};

type OrderDocumentPermissions = {
  is_same_organization: boolean;
  can_manage_all: boolean;
  can_upload_order_zone: boolean;
  visible_zones: OrderDocumentZone[];
};

type CargoSectionTabId = 'linked_trip' | 'cargo_route' | 'documents';

function formatPerson(
  person:
    | { first_name: string | null; last_name: string | null }
    | null
    | undefined
) {
  if (!person) return '-';

  const name = `${person.first_name || ''} ${person.last_name || ''}`.trim();
  return name || '-';
}

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

function formatManagerLabel(
  manager:
    | {
        id?: string | null;
        first_name: string | null;
        last_name: string | null;
      }
    | null
    | undefined
) {
  if (!manager) return '-';

  return `${manager.first_name || ''} ${manager.last_name || ''}`.trim() || '-';
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-slate-500">{label}</div>
      <div className="font-medium whitespace-pre-wrap">{value || '-'}</div>
    </div>
  );
}

function formatOrderTimeRange(
  date?: string | null,
  timeFrom?: string | null,
  timeTo?: string | null
) {
  const datePart = typeof date === 'string' && date.trim() !== '' ? date.trim() : null;
  const fromPart =
    typeof timeFrom === 'string' && timeFrom.trim() !== '' ? timeFrom.trim() : null;
  const toPart =
    typeof timeTo === 'string' && timeTo.trim() !== '' ? timeTo.trim() : null;
  const timePart = fromPart && toPart ? `${fromPart} - ${toPart}` : fromPart || toPart || null;

  if (datePart && timePart) {
    return `${datePart} / ${timePart}`;
  }

  return datePart || timePart || '-';
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

function normalizeOrderTimeInputValue(value?: string | null) {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);

  if (!match) {
    return trimmed;
  }

  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function formatOrderStatusLabel(status: OrderDetails['status']) {
  if (!status) return '-';

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getOrderStatusBadgeClass(status: OrderDetails['status']) {
  if (status === 'unconfirmed') {
    return 'bg-yellow-100 text-yellow-800';
  }

  if (status === 'confirmed') {
    return 'bg-blue-100 text-blue-800';
  }

  if (status === 'active') {
    return 'bg-indigo-100 text-indigo-800';
  }

  if (status === 'completed') {
    return 'bg-green-100 text-green-800';
  }

  return 'bg-slate-100 text-slate-800';
}

function formatCargoLegTypeLabel(type: CargoLegType | null | undefined) {
  if (!type) return '-';

  return CARGO_LEG_TYPE_LABELS[type] || type;
}

function formatOrganizationName(
  organization:
    | OrganizationOption
    | {
        id: string | null;
        name: string | null;
      }
    | null
    | undefined
) {
  if (!organization) return '-';

  return organization.name?.trim() || '-';
}

function formatOrganizationLocation(
  organization:
    | {
        address?: string | null;
        city?: string | null;
        postal_code?: string | null;
        country?: string | null;
      }
    | null
    | undefined
) {
  if (!organization) return '-';

  const parts = [
    organization.address,
    organization.city,
    organization.postal_code,
    organization.country,
  ]
    .filter(Boolean)
    .map((value) => value!.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : '-';
}

function formatCargoLegManagerNames(
  managers:
    | Array<{
        first_name: string | null;
        last_name: string | null;
      }>
    | null
    | undefined
) {
  if (!managers || managers.length === 0) {
    return '-';
  }

  return managers
    .map((manager) => formatManagerLabel(manager))
    .filter((value) => value !== '-')
    .join(', ');
}

function formatCargoLegVisibilitySummary(cargoLeg: CargoLegRow) {
  if (cargoLeg.show_to_all_managers) {
    return 'All';
  }

  const names = formatCargoLegManagerNames(cargoLeg.shared_managers);
  return names === '-' ? '-' : names;
}

function formatWarehouseLocation(
  warehouse:
    | {
        address?: string | null;
        city?: string | null;
        postal_code?: string | null;
        country?: string | null;
      }
    | null
    | undefined
) {
  if (!warehouse) return '-';

  const parts = [
    warehouse.address,
    warehouse.city,
    warehouse.postal_code,
    warehouse.country,
  ]
    .filter(Boolean)
    .map((value) => value!.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : '-';
}

function formatRouteTripMeta(trip: RouteTripOption | null | undefined) {
  if (!trip) return '-';

  const primary = [
    trip.carrier?.name || null,
    trip.truck_plate || null,
    trip.trailer_plate || null,
    trip.driver_name || null,
  ].filter(Boolean);

  return primary.length > 0 ? primary.join(' / ') : '-';
}

function getNextCargoLegOrder(cargoLegs: CargoLegRow[]) {
  if (cargoLegs.length === 0) return 1;

  return Math.max(...cargoLegs.map((cargoLeg) => cargoLeg.leg_order)) + 1;
}

export default function OrderPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [activeCargoTab, setActiveCargoTab] =
    useState<CargoSectionTabId | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [orderDocuments, setOrderDocuments] = useState<OrderDocumentRow[]>([]);
  const [orderDocumentPermissions, setOrderDocumentPermissions] =
    useState<OrderDocumentPermissions>({
      is_same_organization: true,
      can_manage_all: false,
      can_upload_order_zone: true,
      visible_zones: [...ORDER_DOCUMENT_ZONES],
    });
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [contacts, setContacts] = useState<CompanyContactOption[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [managersLoading, setManagersLoading] = useState(true);
  const [shipperMatches, setShipperMatches] = useState<PartyAddressMatch[]>([]);
  const [consigneeMatches, setConsigneeMatches] = useState<PartyAddressMatch[]>([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [vatRateTouched, setVatRateTouched] = useState(false);
  const [loadTypeTouched, setLoadTypeTouched] = useState(false);
  const [currentSharedManagerUserId, setCurrentSharedManagerUserId] = useState('');
  const [currentSharedOrganizationId, setCurrentSharedOrganizationId] = useState('');
  const [tripOptionsLoading, setTripOptionsLoading] = useState(true);
  const [linkedTrips, setLinkedTrips] = useState<LinkedTripRow[]>([]);
  const [availableTrips, setAvailableTrips] = useState<AvailableTripRow[]>([]);
  const [tripSearch, setTripSearch] = useState('');
  const [showTripOptionsDropdown, setShowTripOptionsDropdown] = useState(false);
  const [tripActionLoadingId, setTripActionLoadingId] = useState('');
  const [linkedTripManagerUserId, setLinkedTripManagerUserId] = useState('');
  const [linkedTripManagerSearch, setLinkedTripManagerSearch] = useState('');
  const [showLinkedTripManagerDropdown, setShowLinkedTripManagerDropdown] = useState(false);
  const [savingSharedManager, setSavingSharedManager] = useState(false);
  const [awaitingTripNumber, setAwaitingTripNumber] = useState(false);
  const [cargoLegSaving, setCargoLegSaving] = useState(false);
  const [cargoLegLookupLoading, setCargoLegLookupLoading] = useState(false);
  const [matchedCargoLegTrip, setMatchedCargoLegTrip] =
    useState<RouteTripOption | null>(null);
  const [cargoLegLookupMessage, setCargoLegLookupMessage] = useState('');
  const [cargoLegDeletingId, setCargoLegDeletingId] = useState('');
  const [creatingCargoLinkedTrip, setCreatingCargoLinkedTrip] = useState(false);
  const [cargoLegOrganizationSearch, setCargoLegOrganizationSearch] = useState('');
  const [showCargoLegOrganizationDropdown, setShowCargoLegOrganizationDropdown] =
    useState(false);
  const [cargoLegManagers, setCargoLegManagers] = useState<ManagerOption[]>([]);
  const [cargoLegManagersLoading, setCargoLegManagersLoading] = useState(false);
  const [cargoLegManagerSearch, setCargoLegManagerSearch] = useState('');
  const [showCargoLegManagerDropdown, setShowCargoLegManagerDropdown] =
    useState(false);
  const [cargoLegWarehouses, setCargoLegWarehouses] = useState<
    OrganizationWarehouseOption[]
  >([]);
  const [cargoLegWarehousesLoading, setCargoLegWarehousesLoading] = useState(false);
  const [cargoLegWarehouseSearch, setCargoLegWarehouseSearch] = useState('');
  const [showCargoLegWarehouseDropdown, setShowCargoLegWarehouseDropdown] =
    useState(false);
  const [uploadingDocuments, setUploadingDocuments] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState('');
  const [cargoLegEditorLinkId, setCargoLegEditorLinkId] = useState<string | null>(null);
  const [editingCargoLegId, setEditingCargoLegId] = useState<string | null>(null);
  const [cargoLegForm, setCargoLegForm] = useState({
    leg_order: '1',
    leg_type: 'international_trip' as CargoLegType,
    responsible_organization_id: '',
    responsible_warehouse_id: '',
    manager_user_ids: [] as string[],
    show_to_all_managers: false,
    linked_trip_number: '',
  });

  const [form, setForm] = useState({
    id: '',
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
    fetchOrder();
  }, [orderId]);

  useEffect(() => {
    fetchDocuments();
  }, [orderId]);

  useEffect(() => {
    fetchTripOptions();
  }, [orderId, linkedTripManagerUserId, tripSearch]);

  useEffect(() => {
    if (!currentSharedManagerUserId) {
      return;
    }

    setLinkedTripManagerUserId((prev) => prev || currentSharedManagerUserId);
  }, [currentSharedManagerUserId]);

  useEffect(() => {
    if (activeCargoTab !== 'linked_trip') {
      setShowTripOptionsDropdown(false);
      setShowLinkedTripManagerDropdown(false);
    }

    if (activeCargoTab !== 'cargo_route') {
      setShowCargoLegOrganizationDropdown(false);
      setShowCargoLegManagerDropdown(false);
    }
  }, [activeCargoTab]);

  useEffect(() => {
    fetchClients();
    fetchShareOrganizations();
  }, []);

  useEffect(() => {
    if (!currentSharedOrganizationId) {
      setManagers([]);
      return;
    }

    void fetchManagers(currentSharedOrganizationId);
  }, [currentSharedOrganizationId]);

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
    if (!editing) {
      return;
    }

    const query = form.shipper_name.trim();

    if (query.length < 2) {
      setShipperMatches([]);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetchPartyAddressMatches('shipper', query);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [editing, form.shipper_name]);

  useEffect(() => {
    if (!editing) {
      return;
    }

    const query = form.consignee_name.trim();

    if (query.length < 2) {
      setConsigneeMatches([]);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetchPartyAddressMatches('consignee', query);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [editing, form.consignee_name]);

  useEffect(() => {
    if (!cargoLegEditorLinkId) {
      setMatchedCargoLegTrip(null);
      setCargoLegLookupMessage('');
      setCargoLegLookupLoading(false);
      return;
    }

    const query = cargoLegForm.linked_trip_number.trim();

    if (!query) {
      setMatchedCargoLegTrip(null);
      setCargoLegLookupMessage('');
      setCargoLegLookupLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      lookupCargoLegTrip(cargoLegEditorLinkId, query);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [
    cargoLegEditorLinkId,
    editingCargoLegId,
    cargoLegForm.linked_trip_number,
    cargoLegForm.responsible_organization_id,
  ]);

  useEffect(() => {
    if (!cargoLegEditorLinkId || !cargoLegForm.responsible_organization_id) {
      setCargoLegManagers([]);
      setCargoLegManagerSearch('');
      setShowCargoLegManagerDropdown(false);
      return;
    }

    void fetchCargoLegManagers(cargoLegForm.responsible_organization_id);
  }, [cargoLegEditorLinkId, cargoLegForm.responsible_organization_id]);

  useEffect(() => {
    if (!cargoLegEditorLinkId || !cargoLegForm.responsible_organization_id) {
      setCargoLegWarehouses([]);
      setCargoLegWarehouseSearch('');
      setShowCargoLegWarehouseDropdown(false);
      return;
    }

    void fetchCargoLegWarehouses(cargoLegForm.responsible_organization_id);
  }, [cargoLegEditorLinkId, cargoLegForm.responsible_organization_id]);

  useEffect(() => {
    if (!matchedCargoLegTrip?.created_by) {
      return;
    }

    if (!cargoLegForm.responsible_organization_id) {
      return;
    }

    if (cargoLegForm.show_to_all_managers || cargoLegForm.manager_user_ids.length > 0) {
      return;
    }

    const creatorIsSelectable = cargoLegManagers.some(
      (manager) => manager.id === matchedCargoLegTrip.created_by
    );

    if (!creatorIsSelectable) {
      return;
    }

    setCargoLegForm((prev) => {
      if (
        prev.show_to_all_managers ||
        prev.manager_user_ids.length > 0 ||
        prev.responsible_organization_id !== cargoLegForm.responsible_organization_id
      ) {
        return prev;
      }

      return {
        ...prev,
        manager_user_ids: [matchedCargoLegTrip.created_by!],
      };
    });
  }, [
    cargoLegManagers,
    cargoLegForm.manager_user_ids.length,
    cargoLegForm.responsible_organization_id,
    cargoLegForm.show_to_all_managers,
    matchedCargoLegTrip?.created_by,
  ]);

  const fetchOrder = async () => {
    try {
      setLoading(true);

      const orderResponse = await fetch(`/api/orders/details?orderId=${orderId}`, {
        method: 'GET',
      });
      const orderData = await orderResponse.json();

      if (!orderResponse.ok || !orderData?.order) {
        toast.error(orderData?.error || 'Failed to load order');
        return;
      }

      const normalized = orderData.order as OrderDetails;
      const sharedManagerUserId = orderData.shared_manager_user_id ?? '';
      const sharedOrganizationId = orderData.shared_organization_id ?? '';

      setOrder(normalized);
      setForm({
        id: normalized.id,
        client_order_number: normalized.client_order_number ?? '',
        shared_manager_user_id: sharedManagerUserId,
        shared_organization_id: sharedOrganizationId,
        client_company_id: normalized.client?.id ?? '',
        loading_date: normalized.loading_date ?? '',
        loading_time_from: normalizeOrderTimeInputValue(
          normalized.loading_time_from ?? (normalized as any).loading_time ?? ''
        ),
        loading_time_to: normalizeOrderTimeInputValue(normalized.loading_time_to ?? ''),
        loading_address: normalized.loading_address ?? '',
        loading_city: normalized.loading_city ?? '',
        loading_postal_code: normalized.loading_postal_code ?? '',
        loading_country: normalized.loading_country ?? '',
        loading_contact: normalized.loading_contact ?? '',
        loading_reference: normalized.loading_reference ?? '',
        loading_customs_info: normalized.loading_customs_info ?? '',
        unloading_date: normalized.unloading_date ?? '',
        unloading_time_from: normalizeOrderTimeInputValue(
          normalized.unloading_time_from ?? (normalized as any).unloading_time ?? ''
        ),
        unloading_time_to: normalizeOrderTimeInputValue(normalized.unloading_time_to ?? ''),
        unloading_address: normalized.unloading_address ?? '',
        unloading_city: normalized.unloading_city ?? '',
        unloading_postal_code: normalized.unloading_postal_code ?? '',
        unloading_country: normalized.unloading_country ?? '',
        unloading_contact: normalized.unloading_contact ?? '',
        unloading_reference: normalized.unloading_reference ?? '',
        unloading_customs_info: normalized.unloading_customs_info ?? '',
        shipper_name: normalized.shipper_name ?? '',
        consignee_name: normalized.consignee_name ?? '',
        received_from_name: normalized.received_from_name ?? '',
        received_from_contact: normalized.received_from_contact ?? '',
        cargo_kg:
          normalized.cargo_kg !== null && normalized.cargo_kg !== undefined
            ? String(normalized.cargo_kg)
            : '',
        cargo_quantity: normalized.cargo_quantity ?? '',
        cargo_description: normalized.cargo_description ?? '',
        cargo_ldm:
          normalized.cargo_ldm !== null && normalized.cargo_ldm !== undefined
            ? String(normalized.cargo_ldm)
            : '',
        load_type: normalized.load_type ?? '',
        has_ex1: normalized.has_ex1 ?? false,
        has_t1: normalized.has_t1 ?? false,
        has_adr: normalized.has_adr ?? false,
        has_sent: normalized.has_sent ?? false,
        price:
          normalized.price !== null && normalized.price !== undefined
            ? String(normalized.price)
            : '',
        vat_rate: String(normalized.vat_rate ?? 21),
        currency: normalized.currency ?? 'EUR',
        payment_term_text: normalizePaymentTermValue(normalized.payment_term_text ?? ''),
        payment_type: normalized.payment_type ?? '',
        notes: normalized.notes ?? '',
      });
      setVatRateTouched(false);
      setLoadTypeTouched(false);
      setCurrentSharedManagerUserId(sharedManagerUserId);
      setCurrentSharedOrganizationId(sharedOrganizationId);
      setLinkedTripManagerUserId(sharedManagerUserId);
      setSelectedContactId('');
    } catch (error) {
      toast.error('Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  const fetchTripOptions = async () => {
    try {
      setTripOptionsLoading(true);

      const searchParams = new URLSearchParams({ orderId });
      const effectiveLinkedTripManagerUserId =
        linkedTripManagerUserId || currentSharedManagerUserId;

      if (effectiveLinkedTripManagerUserId) {
        searchParams.set('managerUserId', effectiveLinkedTripManagerUserId);
      }

      if (tripSearch.trim() !== '') {
        searchParams.set('q', tripSearch.trim());
      }

      const res = await fetch(`/api/orders/link-trip-options?${searchParams.toString()}`, {
        method: 'GET',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to load trip options');
        setLinkedTrips([]);
        setAvailableTrips([]);
        setAwaitingTripNumber(false);
        return;
      }

      setLinkedTrips(data.linked_trips || []);
      setAvailableTrips(data.available_trips || []);
      setAwaitingTripNumber(!!data.awaiting_trip_number);
    } catch (error) {
      toast.error('Failed to load trip options');
      setLinkedTrips([]);
      setAvailableTrips([]);
      setAwaitingTripNumber(false);
    } finally {
      setTripOptionsLoading(false);
    }
  };

  const fetchDocuments = async () => {
    try {
      setDocumentsLoading(true);

      const searchParams = new URLSearchParams({ orderId });
      const res = await fetch(
        `/api/orders/documents/list?${searchParams.toString()}`,
        {
          method: 'GET',
        }
      );

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to load documents');
        setOrderDocuments([]);
        setOrderDocumentPermissions({
          is_same_organization: true,
          can_manage_all: false,
          can_upload_order_zone: true,
          visible_zones: [...ORDER_DOCUMENT_ZONES],
        });
        return;
      }

      setOrderDocuments(data.documents || []);
      setOrderDocumentPermissions({
        is_same_organization: Boolean(data.permissions?.is_same_organization),
        can_manage_all: Boolean(data.permissions?.can_manage_all),
        can_upload_order_zone: Boolean(data.permissions?.can_upload_order_zone),
        visible_zones: Array.isArray(data.permissions?.visible_zones)
          ? data.permissions.visible_zones
          : [...ORDER_DOCUMENT_ZONES],
      });
    } catch (error) {
      toast.error('Failed to load documents');
      setOrderDocuments([]);
      setOrderDocumentPermissions({
        is_same_organization: true,
        can_manage_all: false,
        can_upload_order_zone: true,
        visible_zones: [...ORDER_DOCUMENT_ZONES],
      });
    } finally {
      setDocumentsLoading(false);
    }
  };

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, company_code, payment_term_days, country')
      .eq('is_client', true)
      .order('name', { ascending: true });

    if (error) {
      toast.error('Failed to load clients');
      return;
    }

    setClients((data || []) as ClientOption[]);
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
      setCurrentSharedOrganizationId((prev) => prev || data.current_organization_id || '');
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

  const fetchCargoLegManagers = async (organizationId: string) => {
    try {
      setCargoLegManagersLoading(true);

      const searchParams = new URLSearchParams();
      searchParams.set('organizationId', organizationId);

      const res = await fetch(
        `/api/organization/managers?${searchParams.toString()}`,
        {
          method: 'GET',
        }
      );

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to load route managers');
        setCargoLegManagers([]);
        return;
      }

      setCargoLegManagers(data.managers || []);
    } catch (error) {
      toast.error('Failed to load route managers');
      setCargoLegManagers([]);
    } finally {
      setCargoLegManagersLoading(false);
    }
  };

  const fetchCargoLegWarehouses = async (organizationId: string) => {
    try {
      setCargoLegWarehousesLoading(true);

      const searchParams = new URLSearchParams();
      searchParams.set('organizationId', organizationId);

      const res = await fetch(
        `/api/organizations/warehouses?${searchParams.toString()}`,
        {
          method: 'GET',
        }
      );

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to load warehouses');
        setCargoLegWarehouses([]);
        return;
      }

      setCargoLegWarehouses(data.warehouses || []);
    } catch (error) {
      toast.error('Failed to load warehouses');
      setCargoLegWarehouses([]);
    } finally {
      setCargoLegWarehousesLoading(false);
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

  const applyClientContact = (contactId: string) => {
    setSelectedContactId(contactId);

    const contact = contacts.find((item) => item.id === contactId);

    if (!contact) {
      return;
    }

    update('received_from_name', formatContactName(contact));
    update('received_from_contact', formatContactValue(contact));
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

  const hasCargoLegTripQuery = cargoLegForm.linked_trip_number.trim() !== '';
  const cargoSectionTabs: Array<{ id: CargoSectionTabId; label: string }> = [
    { id: 'linked_trip', label: 'Linked Trip' },
    { id: 'cargo_route', label: 'Cargo Route' },
    { id: 'documents', label: 'Documents' },
  ];

  const uploadOrderDocuments = async (
    documentZone: OrderDocumentZone,
    files: FileList | null
  ) => {
    if (!files || files.length === 0) {
      return;
    }

    try {
      setUploadingDocuments(true);

      let uploadedCount = 0;
      const failedFiles: string[] = [];

      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('order_id', orderId);
        formData.append('document_zone', documentZone);
        formData.append('file', file);

        const res = await fetch('/api/orders/documents/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          failedFiles.push(file.name);
          continue;
        }

        uploadedCount += 1;
      }

      if (uploadedCount > 0) {
        toast.success(`${ORDER_DOCUMENT_ZONE_LABELS[documentZone]} saved: ${uploadedCount}`);
      }

      if (failedFiles.length > 0) {
        toast.error(`Failed to save: ${failedFiles.join(', ')}`);
      }

      await fetchDocuments();
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setUploadingDocuments(false);
    }
  };

  const deleteDocument = async (documentId: string) => {
    const confirmed = window.confirm('Delete this document?');

    if (!confirmed) {
      return;
    }

    try {
      setDeletingDocumentId(documentId);

      const res = await fetch('/api/orders/documents/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: documentId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to delete document');
        return;
      }

      toast.success('Document deleted');
      await fetchDocuments();
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setDeletingDocumentId('');
    }
  };

  const linkTrip = async (tripId: string) => {
    try {
      setTripActionLoadingId(tripId);

      const res = await fetch('/api/orders/link-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          trip_id: tripId,
          typed_trip_number: tripSearch.trim().toUpperCase(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to link trip');
        return;
      }

      toast.success('Trip linked to order');
      await Promise.all([fetchOrder(), fetchTripOptions()]);
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setTripActionLoadingId('');
    }
  };

  const unlinkTrip = async (tripId: string) => {
    try {
      setTripActionLoadingId(tripId);

      const res = await fetch('/api/orders/unlink-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          trip_id: tripId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to unlink trip');
        return;
      }

      toast.success('Trip unlinked from order');
      await Promise.all([fetchOrder(), fetchTripOptions()]);
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setTripActionLoadingId('');
    }
  };

  const resetCargoLegEditor = () => {
    setCargoLegEditorLinkId(null);
    setEditingCargoLegId(null);
    setMatchedCargoLegTrip(null);
    setCargoLegLookupMessage('');
    setCargoLegLookupLoading(false);
    setCargoLegOrganizationSearch('');
    setShowCargoLegOrganizationDropdown(false);
    setCargoLegWarehouseSearch('');
    setShowCargoLegWarehouseDropdown(false);
    setCargoLegManagerSearch('');
    setShowCargoLegManagerDropdown(false);
    setCargoLegForm({
      leg_order: '1',
      leg_type: 'international_trip',
      responsible_organization_id: currentSharedOrganizationId || '',
      responsible_warehouse_id: '',
      manager_user_ids: [],
      show_to_all_managers: false,
      linked_trip_number: '',
    });
  };

  const openNewCargoLegEditor = (linkedTrip: LinkedTripRow) => {
    setCargoLegEditorLinkId(linkedTrip.link_id);
    setEditingCargoLegId(null);
    setMatchedCargoLegTrip(null);
    setCargoLegLookupMessage('');
    setCargoLegLookupLoading(false);
    setCargoLegOrganizationSearch('');
    setShowCargoLegOrganizationDropdown(false);
    setCargoLegWarehouseSearch('');
    setShowCargoLegWarehouseDropdown(false);
    setCargoLegManagerSearch('');
    setShowCargoLegManagerDropdown(false);
    setCargoLegForm({
      leg_order: String(getNextCargoLegOrder(linkedTrip.cargo_legs || [])),
      leg_type: 'international_trip',
      responsible_organization_id: currentSharedOrganizationId || form.shared_organization_id || '',
      responsible_warehouse_id: '',
      manager_user_ids: [],
      show_to_all_managers: false,
      linked_trip_number: '',
    });
  };

  const openExistingCargoLegEditor = (
    linkedTrip: LinkedTripRow,
    cargoLeg: CargoLegRow
  ) => {
    setCargoLegEditorLinkId(linkedTrip.link_id);
    setEditingCargoLegId(cargoLeg.id);
    setMatchedCargoLegTrip(cargoLeg.linked_trip);
    setCargoLegLookupMessage('');
    setCargoLegLookupLoading(false);
    setCargoLegOrganizationSearch('');
    setShowCargoLegOrganizationDropdown(false);
    setCargoLegWarehouseSearch('');
    setShowCargoLegWarehouseDropdown(false);
    setCargoLegManagerSearch('');
    setShowCargoLegManagerDropdown(false);
    setCargoLegForm({
      leg_order: String(cargoLeg.leg_order),
      leg_type: cargoLeg.leg_type,
      responsible_organization_id: cargoLeg.responsible_organization_id ?? '',
      responsible_warehouse_id: cargoLeg.responsible_warehouse_id ?? '',
      manager_user_ids: (cargoLeg.shared_managers || [])
        .map((manager) => manager.id)
        .filter((value): value is string => typeof value === 'string' && value !== ''),
      show_to_all_managers: !!cargoLeg.show_to_all_managers,
      linked_trip_number: cargoLeg.linked_trip?.trip_number ?? '',
    });
  };

  const lookupCargoLegTrip = async (orderTripLinkId: string, query: string) => {
    try {
      setCargoLegLookupLoading(true);
      setCargoLegLookupMessage('');

      const searchParams = new URLSearchParams({
        orderTripLinkId,
        q: query.trim().toUpperCase(),
      });

      if (editingCargoLegId) {
        searchParams.set('cargoLegId', editingCargoLegId);
      }

      if (cargoLegForm.responsible_organization_id) {
        searchParams.set(
          'responsibleOrganizationId',
          cargoLegForm.responsible_organization_id
        );
      }

      const res = await fetch(`/api/cargo-legs/trip-options?${searchParams.toString()}`, {
        method: 'GET',
      });

      const data = await res.json();

      if (!res.ok) {
        setMatchedCargoLegTrip(null);
        setCargoLegLookupMessage(data.error || 'Failed to find trip');
        return;
      }

      if (data.matched_trip) {
        setMatchedCargoLegTrip(data.matched_trip);
        setCargoLegLookupMessage('');
        return;
      }

      setMatchedCargoLegTrip(null);

      if (query.trim() !== '') {
        setCargoLegLookupMessage('Trip not found.');
      }
    } catch (error) {
      setMatchedCargoLegTrip(null);
      setCargoLegLookupMessage('Failed to find trip');
    } finally {
      setCargoLegLookupLoading(false);
    }
  };

  const updateCargoLegResponsibleOrganization = (organizationId: string) => {
    setMatchedCargoLegTrip(null);
    setCargoLegLookupMessage('');
    setCargoLegOrganizationSearch('');
    setShowCargoLegOrganizationDropdown(false);
    setCargoLegWarehouseSearch('');
    setShowCargoLegWarehouseDropdown(false);
    setCargoLegManagerSearch('');
    setShowCargoLegManagerDropdown(false);
    setCargoLegForm((prev) => ({
      ...prev,
      responsible_organization_id: organizationId,
      responsible_warehouse_id: '',
      manager_user_ids: [],
      show_to_all_managers: false,
      linked_trip_number: '',
    }));
  };

  const addCargoLegManager = (manager: ManagerOption) => {
    setCargoLegForm((prev) => ({
      ...prev,
      show_to_all_managers: false,
      manager_user_ids: prev.manager_user_ids.includes(manager.id)
        ? prev.manager_user_ids
        : [...prev.manager_user_ids, manager.id],
    }));
    setCargoLegManagerSearch('');
    setShowCargoLegManagerDropdown(false);
  };

  const selectCargoLegWarehouse = (warehouseId: string) => {
    setCargoLegWarehouseSearch('');
    setShowCargoLegWarehouseDropdown(false);
    setCargoLegForm((prev) => ({
      ...prev,
      responsible_warehouse_id: warehouseId,
    }));
  };

  const clearCargoLegWarehouse = () => {
    setCargoLegWarehouseSearch('');
    setShowCargoLegWarehouseDropdown(false);
    setCargoLegForm((prev) => ({
      ...prev,
      responsible_warehouse_id: '',
    }));
  };

  const removeCargoLegManager = (managerId: string) => {
    setCargoLegForm((prev) => ({
      ...prev,
      manager_user_ids: prev.manager_user_ids.filter((id) => id !== managerId),
    }));
  };

  const clearCargoLegManagers = () => {
    setCargoLegManagerSearch('');
    setCargoLegForm((prev) => ({
      ...prev,
      show_to_all_managers: false,
      manager_user_ids: [],
    }));
  };

  const clearCargoLegOrganization = () => {
    setCargoLegOrganizationSearch('');
    setShowCargoLegOrganizationDropdown(false);
    updateCargoLegResponsibleOrganization('');
  };

  const toggleCargoLegAllManagers = () => {
    setCargoLegManagerSearch('');
    setShowCargoLegManagerDropdown(false);
    setCargoLegForm((prev) => ({
      ...prev,
      show_to_all_managers: !prev.show_to_all_managers,
      manager_user_ids: !prev.show_to_all_managers ? [] : prev.manager_user_ids,
    }));
  };

  const saveCargoLeg = async () => {
    if (!cargoLegEditorLinkId) {
      toast.error('Choose linked trip first');
      return;
    }

    if (!cargoLegForm.responsible_organization_id) {
      toast.error('Choose responsible organization');
      return;
    }

    if (!matchedCargoLegTrip) {
      toast.error('First choose trip');
      return;
    }

    if (cargoLegWarehouses.length > 0 && !cargoLegForm.responsible_warehouse_id) {
      toast.error('Choose warehouse');
      return;
    }

    if (
      !cargoLegForm.show_to_all_managers &&
      cargoLegForm.manager_user_ids.length === 0
    ) {
      toast.error('Choose route managers or All');
      return;
    }

    try {
      setCargoLegSaving(true);
      const requestedOrder = Number(cargoLegForm.leg_order);

      const payload = editingCargoLegId
        ? {
            id: editingCargoLegId,
            leg_order: requestedOrder,
            leg_type: cargoLegForm.leg_type,
            responsible_organization_id: cargoLegForm.responsible_organization_id,
            responsible_warehouse_id: cargoLegForm.responsible_warehouse_id,
            manager_user_ids: cargoLegForm.manager_user_ids,
            show_to_all_managers: cargoLegForm.show_to_all_managers,
            linked_trip_id: matchedCargoLegTrip.id,
          }
        : {
            order_trip_link_id: cargoLegEditorLinkId,
            leg_order: requestedOrder,
            leg_type: cargoLegForm.leg_type,
            responsible_organization_id: cargoLegForm.responsible_organization_id,
            responsible_warehouse_id: cargoLegForm.responsible_warehouse_id,
            manager_user_ids: cargoLegForm.manager_user_ids,
            show_to_all_managers: cargoLegForm.show_to_all_managers,
            linked_trip_id: matchedCargoLegTrip.id,
          };

      const res = await fetch(
        editingCargoLegId ? '/api/cargo-legs/update' : '/api/cargo-legs/create',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to save route');
        return;
      }

      toast.success(editingCargoLegId ? 'Route updated' : 'Route added');
      await fetchTripOptions();
      resetCargoLegEditor();
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setCargoLegSaving(false);
    }
  };

  const createCargoLinkedTrip = async () => {
    if (!cargoLegEditorLinkId) {
      toast.error('Choose linked trip first');
      return;
    }

    if (!cargoLegForm.responsible_organization_id) {
      toast.error('Choose responsible organization');
      return;
    }

    if (
      !cargoLegForm.show_to_all_managers &&
      cargoLegForm.manager_user_ids.length === 0
    ) {
      toast.error('Choose route managers or All');
      return;
    }

    if (cargoLegWarehouses.length > 0 && !cargoLegForm.responsible_warehouse_id) {
      toast.error('Choose warehouse');
      return;
    }

    try {
      setCreatingCargoLinkedTrip(true);
      const requestedOrder = Number(cargoLegForm.leg_order);

      const res = await fetch('/api/cargo-legs/create-linked-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_trip_link_id: cargoLegEditorLinkId,
          cargo_leg_id: editingCargoLegId,
          leg_order: requestedOrder,
          leg_type: cargoLegForm.leg_type,
          responsible_organization_id: cargoLegForm.responsible_organization_id,
          responsible_warehouse_id: cargoLegForm.responsible_warehouse_id,
          manager_user_ids: cargoLegForm.manager_user_ids,
          show_to_all_managers: cargoLegForm.show_to_all_managers,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to create trip');
        return;
      }

      toast.success(`Trip ${data.created_trip?.trip_number || ''} created`);
      await fetchTripOptions();
      resetCargoLegEditor();
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setCreatingCargoLinkedTrip(false);
    }
  };

  const deleteCargoLeg = async (cargoLegId: string) => {
    try {
      setCargoLegDeletingId(cargoLegId);

      const res = await fetch('/api/cargo-legs/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cargoLegId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to delete route');
        return;
      }

      toast.success('Route deleted');
      await fetchTripOptions();

      if (editingCargoLegId === cargoLegId) {
        resetCargoLegEditor();
      }
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setCargoLegDeletingId('');
    }
  };

  const saveSharedManager = async (managerUserId?: string) => {
    const nextManagerUserId =
      typeof managerUserId === 'string'
        ? managerUserId
        : form.shared_manager_user_id;

    try {
      setSavingSharedManager(true);
      const res = await fetch('/api/orders/set-shared-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          shared_manager_user_id: nextManagerUserId,
          shared_organization_id: currentSharedOrganizationId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to save manager');
        return;
      }

      toast.success('Order manager saved');
      setCurrentSharedManagerUserId(nextManagerUserId);
      setLinkedTripManagerUserId(nextManagerUserId);
      setForm((prev) => ({
        ...prev,
        shared_manager_user_id: nextManagerUserId,
        shared_organization_id: currentSharedOrganizationId,
      }));
      await Promise.all([fetchOrder(), fetchTripOptions()]);
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setSavingSharedManager(false);
    }
  };

  const save = async () => {
    try {
      setSaving(true);

      const payload = {
        ...form,
        client_company_id: form.client_company_id || null,
        cargo_kg: form.cargo_kg === '' ? null : Number(form.cargo_kg),
        cargo_ldm: form.cargo_ldm === '' ? null : Number(form.cargo_ldm),
        load_type: form.load_type || null,
        price: form.price === '' ? null : Number(form.price),
        vat_rate: Number(form.vat_rate),
      };

      const res = await fetch('/api/orders/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to update order');
        return;
      }

      toast.success('Order updated');
      setEditing(false);
      await fetchOrder();
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setSaving(false);
    }
  };

  const deleteOrder = async () => {
    const confirmed = window.confirm(
      `Delete order ${order?.internal_order_number || ''}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeleting(true);

      const res = await fetch('/api/orders/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to delete order');
        return;
      }

      toast.success('Order deleted');
      router.push('/app/orders');
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setDeleting(false);
    }
  };

  const sharedManager = managers.find(
    (manager) => manager.id === currentSharedManagerUserId
  );
  const selectedLinkedTripManager = managers.find(
    (manager) => manager.id === (linkedTripManagerUserId || currentSharedManagerUserId)
  );
  const selectedCargoLegOrganization = organizations.find(
    (organization) => organization.id === cargoLegForm.responsible_organization_id
  );
  const selectedCargoLegWarehouse = cargoLegWarehouses.find(
    (warehouse) => warehouse.id === cargoLegForm.responsible_warehouse_id
  );
  const selectedCargoLegManagers = cargoLegManagers.filter((manager) =>
    cargoLegForm.manager_user_ids.includes(manager.id)
  );
  const selectedCargoLegLocation = selectedCargoLegWarehouse
    ? formatWarehouseLocation(selectedCargoLegWarehouse)
    : formatOrganizationLocation(selectedCargoLegOrganization);
  const cargoLegOrganizationDisplayValue =
    selectedCargoLegOrganization?.name?.trim() || '';
  const cargoLegWarehouseDisplayValue =
    selectedCargoLegWarehouse?.name?.trim() || '';
  const cargoLegManagersDisplayValue = cargoLegForm.show_to_all_managers
    ? 'All'
    : selectedCargoLegManagers.length > 0
      ? selectedCargoLegManagers.map((manager) => formatManagerLabel(manager)).join(', ')
      : '';
  const selectedSharedOrganizationId = currentSharedOrganizationId;
  const selectedClient = clients.find((client) => client.id === form.client_company_id);
  const filteredLinkedTripManagers = useMemo(() => {
    const query = linkedTripManagerSearch.trim().toLowerCase();

    if (query.length < 2) {
      return [];
    }

    return managers.filter((manager) =>
      formatManagerLabel(manager).toLowerCase().includes(query)
    );
  }, [linkedTripManagerSearch, managers]);
  const filteredCargoLegManagers = useMemo(() => {
    const query = cargoLegManagerSearch.trim().toLowerCase();

    return cargoLegManagers.filter((manager) =>
      query === '' ? true : formatManagerLabel(manager).toLowerCase().includes(query)
    );
  }, [cargoLegForm.manager_user_ids, cargoLegManagerSearch, cargoLegManagers]);
  const filteredCargoLegOrganizations = useMemo(() => {
    const query = cargoLegOrganizationSearch.trim().toLowerCase();

    return organizations.filter((organization) =>
      query === '' ? true : organization.name.toLowerCase().includes(query)
    );
  }, [cargoLegOrganizationSearch, organizations]);
  const filteredCargoLegWarehouses = useMemo(() => {
    const query = cargoLegWarehouseSearch.trim().toLowerCase();

    return cargoLegWarehouses.filter((warehouse) => {
      if (query === '') {
        return true;
      }

      return [warehouse.name, warehouse.address, warehouse.city, warehouse.postal_code]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  }, [cargoLegWarehouseSearch, cargoLegWarehouses]);
  const documentsByZone = useMemo(() => {
    return ORDER_DOCUMENT_ZONES.reduce(
      (acc, zone) => {
        acc[zone] = orderDocuments.filter((document) => document.document_zone === zone);
        return acc;
      },
      {} as Record<OrderDocumentZone, OrderDocumentRow[]>
    );
  }, [orderDocuments]);
  const visibleDocumentZones = ORDER_DOCUMENT_ZONES;

  const renderCargoLegEditor = () => (
    <div className="rounded-lg border bg-white p-3 space-y-3">
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-[48px_128px_minmax(150px,0.9fr)_minmax(150px,0.9fr)_minmax(180px,1fr)_124px_96px] xl:items-end">
        <div>
          <label className="mb-1 block text-sm font-medium">No.</label>
          <input
            type="number"
            min="1"
            aria-label="Route order"
            value={cargoLegForm.leg_order}
            onChange={(e) =>
              setCargoLegForm((prev) => ({
                ...prev,
                leg_order: e.target.value,
              }))
            }
            className="w-full rounded-md border px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Type</label>
          <select
            value={cargoLegForm.leg_type}
            onChange={(e) =>
              setCargoLegForm((prev) => ({
                ...prev,
                leg_type: e.target.value as CargoLegType,
              }))
            }
            className="w-full rounded-md border px-3 py-2"
          >
            {CARGO_LEG_TYPES.map((type) => (
              <option key={type} value={type}>
                {formatCargoLegTypeLabel(type)}
              </option>
            ))}
          </select>
        </div>

        <div
          className="relative"
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              window.setTimeout(() => setShowCargoLegOrganizationDropdown(false), 0);
            }
          }}
        >
          <label className="mb-1 block text-sm font-medium">Organization</label>
          <input
            value={
              showCargoLegOrganizationDropdown
                ? cargoLegOrganizationSearch
                : cargoLegOrganizationDisplayValue
            }
            onFocus={() => setShowCargoLegOrganizationDropdown(true)}
            onClick={() => setShowCargoLegOrganizationDropdown(true)}
            onChange={(e) => {
              setCargoLegOrganizationSearch(e.target.value);
              setShowCargoLegOrganizationDropdown(true);
            }}
            placeholder="Organization"
            className="w-full rounded-md border px-3 py-2"
          />

          {showCargoLegOrganizationDropdown ? (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-md border bg-white shadow-sm">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => clearCargoLegOrganization()}
                className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                -
              </button>
              {filteredCargoLegOrganizations.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-500">No organizations found</div>
              ) : (
                filteredCargoLegOrganizations.map((organization) => (
                  <button
                    key={organization.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      updateCargoLegResponsibleOrganization(organization.id);
                      setShowCargoLegOrganizationDropdown(false);
                    }}
                    className={`block w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50 last:border-b-0 ${
                      cargoLegForm.responsible_organization_id === organization.id
                        ? 'bg-slate-50 font-medium'
                        : ''
                    }`}
                  >
                    {organization.name}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        <div
          className="relative"
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              window.setTimeout(() => setShowCargoLegWarehouseDropdown(false), 0);
            }
          }}
        >
          <label className="mb-1 block text-sm font-medium">Warehouse</label>
          <input
            value={
              showCargoLegWarehouseDropdown
                ? cargoLegWarehouseSearch
                : cargoLegWarehouseDisplayValue
            }
            onFocus={() => setShowCargoLegWarehouseDropdown(true)}
            onClick={() => setShowCargoLegWarehouseDropdown(true)}
            onChange={(e) => {
              setCargoLegWarehouseSearch(e.target.value);
              setShowCargoLegWarehouseDropdown(true);
            }}
            placeholder={
              cargoLegWarehousesLoading
                ? 'Loading...'
                : cargoLegWarehouses.length > 0
                  ? 'Warehouse'
                  : 'No warehouses'
            }
            className="w-full rounded-md border px-3 py-2"
            disabled={
              !cargoLegForm.responsible_organization_id || cargoLegWarehousesLoading
            }
          />

          {showCargoLegWarehouseDropdown && cargoLegForm.responsible_organization_id ? (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-md border bg-white shadow-sm">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => clearCargoLegWarehouse()}
                className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                -
              </button>
              {filteredCargoLegWarehouses.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-500">No warehouses found</div>
              ) : (
                filteredCargoLegWarehouses.map((warehouse) => (
                  <button
                    key={warehouse.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectCargoLegWarehouse(warehouse.id)}
                    className={`block w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50 last:border-b-0 ${
                      cargoLegForm.responsible_warehouse_id === warehouse.id
                        ? 'bg-slate-50 font-medium'
                        : ''
                    }`}
                  >
                    <div>{warehouse.name}</div>
                    <div className="truncate text-xs text-slate-500">
                      {formatWarehouseLocation(warehouse)}
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        <div
          className="relative"
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              window.setTimeout(() => setShowCargoLegManagerDropdown(false), 0);
            }
          }}
        >
          <label className="mb-1 block text-sm font-medium">Managers / All</label>
          <input
            value={
              showCargoLegManagerDropdown
                ? cargoLegManagerSearch
                : cargoLegManagersDisplayValue
            }
            onFocus={() => setShowCargoLegManagerDropdown(true)}
            onClick={() => setShowCargoLegManagerDropdown(true)}
            onChange={(e) => {
              if (cargoLegForm.show_to_all_managers) {
                setCargoLegForm((prev) => ({
                  ...prev,
                  show_to_all_managers: false,
                }));
              }
              setCargoLegManagerSearch(e.target.value);
              setShowCargoLegManagerDropdown(true);
            }}
            placeholder="Managers / All"
            className="w-full rounded-md border px-3 py-2"
            disabled={
              !cargoLegForm.responsible_organization_id || cargoLegManagersLoading
            }
          />

          {showCargoLegManagerDropdown && cargoLegForm.responsible_organization_id ? (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-md border bg-white shadow-sm">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => clearCargoLegManagers()}
                className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                -
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  toggleCargoLegAllManagers();
                  setShowCargoLegManagerDropdown(false);
                }}
                className={`block w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  cargoLegForm.show_to_all_managers ? 'bg-slate-50 font-medium' : ''
                }`}
              >
                All
              </button>
              {filteredCargoLegManagers.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-500">No managers found</div>
              ) : (
                filteredCargoLegManagers.map((manager) => {
                  const isSelected = cargoLegForm.manager_user_ids.includes(manager.id);

                  return (
                    <button
                      key={manager.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        if (isSelected) {
                          removeCargoLegManager(manager.id);
                        } else {
                          addCargoLegManager(manager);
                        }
                      }}
                      className={`block w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50 last:border-b-0 ${
                        isSelected ? 'bg-slate-50 font-medium' : ''
                      }`}
                    >
                      {formatManagerLabel(manager)}
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Trip number</label>
          <input
            placeholder="TR-000004"
            value={cargoLegForm.linked_trip_number}
            onChange={(e) =>
              setCargoLegForm((prev) => ({
                ...prev,
                linked_trip_number: e.target.value.toUpperCase(),
              }))
            }
            className="w-full rounded-md border px-3 py-2"
          />
        </div>

        {!matchedCargoLegTrip && (
          <button
            type="button"
            onClick={createCargoLinkedTrip}
            disabled={creatingCargoLinkedTrip || cargoLegSaving}
            className="h-10 rounded-md border px-2 py-2 text-xs hover:bg-slate-50 disabled:opacity-50"
          >
            {creatingCargoLinkedTrip ? 'Creating...' : 'Create Trip'}
          </button>
        )}
      </div>

      {matchedCargoLegTrip ? (
        <div className="flex flex-col gap-3 rounded-lg border bg-slate-50 px-3 py-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900">
              {matchedCargoLegTrip.trip_number}
            </div>
            <div className="truncate text-xs text-slate-500">
              {formatRouteTripMeta(matchedCargoLegTrip)}
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push(`/app/trips/${matchedCargoLegTrip.id}`)}
            className="rounded-md border px-3 py-2 text-sm hover:bg-white"
          >
            Open Trip
          </button>
        </div>
      ) : cargoLegLookupLoading ? (
        <div className="flex justify-center py-2">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : hasCargoLegTripQuery && cargoLegLookupMessage ? (
        <div className="rounded-lg border border-dashed px-3 py-2 text-center text-sm text-slate-500">
          {cargoLegLookupMessage}
        </div>
      ) : null}

      {selectedCargoLegOrganization ? (
        <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">
          <div className="truncate font-medium text-slate-900">
            {formatOrganizationName(selectedCargoLegOrganization)}
            {selectedCargoLegWarehouse?.name ? ` / ${selectedCargoLegWarehouse.name}` : ''}
            {cargoLegManagersDisplayValue ? ` / ${cargoLegManagersDisplayValue}` : ''}
            {matchedCargoLegTrip?.trip_number ? ` / ${matchedCargoLegTrip.trip_number}` : ''}
          </div>
          {selectedCargoLegLocation !== '-' ? (
            <div className="truncate text-slate-600">{selectedCargoLegLocation}</div>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={saveCargoLeg}
          disabled={cargoLegSaving || !matchedCargoLegTrip}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {cargoLegSaving ? 'Saving...' : 'Save'}
        </button>

        <button
          type="button"
          onClick={resetCargoLegEditor}
          disabled={cargoLegSaving}
          className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  useEffect(() => {
    if (selectedLinkedTripManager) {
      setLinkedTripManagerSearch(formatManagerLabel(selectedLinkedTripManager));
      return;
    }

    if (!linkedTripManagerUserId && !currentSharedManagerUserId) {
      setLinkedTripManagerSearch('');
    }
  }, [currentSharedManagerUserId, linkedTripManagerUserId, selectedLinkedTripManager]);

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
        clientCountry: selectedClient?.country || null,
        flags: {
          has_ex1: form.has_ex1,
          has_t1: form.has_t1,
          has_adr: form.has_adr,
          has_sent: form.has_sent,
        },
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
    selectedClient?.country,
    vatRateTouched,
  ]);

  useEffect(() => {
    if (!editing || loadTypeTouched) {
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
    editing,
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

  const cancelEdit = () => {
    if (!order) return;

    setForm({
      id: order.id,
      client_order_number: order.client_order_number ?? '',
      shared_manager_user_id: currentSharedManagerUserId,
      shared_organization_id: currentSharedOrganizationId,
      client_company_id: order.client?.id ?? '',
      loading_date: order.loading_date ?? '',
      loading_time_from: normalizeOrderTimeInputValue(
        order.loading_time_from ?? (order as any).loading_time ?? ''
      ),
      loading_time_to: normalizeOrderTimeInputValue(order.loading_time_to ?? ''),
      loading_address: order.loading_address ?? '',
      loading_city: order.loading_city ?? '',
      loading_postal_code: order.loading_postal_code ?? '',
      loading_country: order.loading_country ?? '',
      loading_contact: order.loading_contact ?? '',
      loading_reference: order.loading_reference ?? '',
      loading_customs_info: order.loading_customs_info ?? '',
      unloading_date: order.unloading_date ?? '',
      unloading_time_from: normalizeOrderTimeInputValue(
        order.unloading_time_from ?? (order as any).unloading_time ?? ''
      ),
      unloading_time_to: normalizeOrderTimeInputValue(order.unloading_time_to ?? ''),
      unloading_address: order.unloading_address ?? '',
      unloading_city: order.unloading_city ?? '',
      unloading_postal_code: order.unloading_postal_code ?? '',
      unloading_country: order.unloading_country ?? '',
      unloading_contact: order.unloading_contact ?? '',
      unloading_reference: order.unloading_reference ?? '',
      unloading_customs_info: order.unloading_customs_info ?? '',
      shipper_name: order.shipper_name ?? '',
      consignee_name: order.consignee_name ?? '',
      received_from_name: order.received_from_name ?? '',
      received_from_contact: order.received_from_contact ?? '',
      cargo_kg:
        order.cargo_kg !== null && order.cargo_kg !== undefined
          ? String(order.cargo_kg)
          : '',
      cargo_quantity: order.cargo_quantity ?? '',
      cargo_description: order.cargo_description ?? '',
      cargo_ldm:
        order.cargo_ldm !== null && order.cargo_ldm !== undefined
          ? String(order.cargo_ldm)
          : '',
      load_type: order.load_type ?? '',
      has_ex1: order.has_ex1 ?? false,
      has_t1: order.has_t1 ?? false,
      has_adr: order.has_adr ?? false,
      has_sent: order.has_sent ?? false,
      price:
        order.price !== null && order.price !== undefined
          ? String(order.price)
          : '',
      vat_rate: String(order.vat_rate ?? 21),
      currency: order.currency ?? 'EUR',
      payment_term_text: normalizePaymentTermValue(order.payment_term_text ?? ''),
      payment_type: order.payment_type ?? '',
      notes: order.notes ?? '',
    });
    setSelectedContactId('');
    setVatRateTouched(false);
    setLoadTypeTouched(false);
    setEditing(false);
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6 space-y-4">
        <button
          onClick={() => router.push('/app/orders')}
          className="inline-flex items-center gap-2 border px-4 py-2 rounded-md hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Back to Orders
        </button>

        <div className="rounded-2xl border bg-white p-6">
          <div className="text-lg font-semibold">Order not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-6">
      <button
        onClick={() => router.push('/app/orders')}
        className="inline-flex items-center gap-2 border px-4 py-2 rounded-md hover:bg-slate-50"
      >
        <ArrowLeft size={16} />
        Back to Orders
      </button>

      <div className="rounded-2xl border bg-white p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="space-y-3 text-center">
            <div className="flex items-center justify-center gap-3">
              <FileText className="h-6 w-6 text-slate-500" />
              <h1 className="text-3xl font-bold">{order.internal_order_number}</h1>
              <span
                className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${getOrderStatusBadgeClass(
                  order.status
                )}`}
              >
                {formatOrderStatusLabel(order.status)}
              </span>
            </div>
            <div className="flex flex-col items-center gap-y-2 text-sm text-slate-500 md:flex-row md:justify-center md:gap-x-10">
              <div className="space-y-1 text-center whitespace-nowrap md:text-left">
                <div>
                  Client order number{' '}
                  <span className="font-medium text-slate-700">{order.client_order_number || '-'}</span>
                </div>
                <div>
                  Received from{' '}
                  <span className="font-medium text-slate-700">{order.received_from_name || '-'}</span>
                </div>
              </div>
              <div className="space-y-1 text-center whitespace-nowrap md:text-left">
                <div>
                  Created by{' '}
                  <span className="font-medium text-slate-700">{formatPerson(order.created_by_user)}</span>{' '}
                  at{' '}
                  <span className="font-medium text-slate-700">
                    {order.created_at ? new Date(order.created_at).toLocaleString() : '-'}
                  </span>
                </div>
                <div>
                  Updated at{' '}
                  <span className="font-medium text-slate-700">
                    {order.updated_at ? new Date(order.updated_at).toLocaleString() : '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {!editing && order.can_view_financials ? (
            <div className="flex items-center justify-center gap-3 xl:justify-end">
              <button
                onClick={deleteOrder}
                disabled={deleting}
                className="inline-flex items-center gap-2 border px-4 py-2 rounded-md text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                Delete
              </button>
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 border px-4 py-2 rounded-md hover:bg-slate-50"
              >
                <Pencil size={16} />
                Edit
              </button>
            </div>
          ) : editing ? (
            <div className="flex items-center justify-center gap-3 xl:justify-end">
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </button>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {cargoSectionTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                const nextTab = activeCargoTab === tab.id ? null : tab.id;
                setActiveCargoTab(nextTab);
              }}
              className={
                activeCargoTab === tab.id
                  ? 'rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white'
                  : 'rounded-md border px-3 py-2 text-sm hover:bg-slate-50'
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="order-3 space-y-6">
        <div className="rounded-2xl border bg-white p-6 space-y-4">
          <h2 className="text-xl font-semibold text-center">Main Information</h2>

          {!editing ? (
            <div className="space-y-6 text-sm">
              <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="flex flex-col gap-2">
                  <label className="block text-center text-sm font-medium text-slate-700">
                    Client order number
                  </label>
                  <div className="rounded-md border bg-slate-50 px-3 py-2 text-slate-700">
                    {order.client_order_number || '-'}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="block text-center text-sm font-medium text-slate-700">
                    Client
                  </label>
                  <div className="rounded-md border bg-slate-50 px-3 py-2 text-slate-700">
                    {`${order.client?.name || '-'}${
                      order.client?.company_code ? ` (${order.client.company_code})` : ''
                    }`}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="block text-center text-sm font-medium text-slate-700">
                    Received From
                  </label>
                  <div className="rounded-md border bg-slate-50 px-3 py-2 text-slate-700">
                    {[
                      order.received_from_name || null,
                      order.received_from_contact || null,
                    ]
                      .filter(Boolean)
                      .join(' / ') || '-'}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[140px_minmax(0,420px)_120px_100px] xl:items-end">
                  <div>
                    <label className="mb-1 block text-center text-sm font-medium text-slate-700">
                      Price
                    </label>
                    <div className="rounded-md border bg-white px-3 py-2 text-slate-700">
                      {order.can_view_financials ? (
                        order.price !== null && order.price !== undefined ? order.price : '-'
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-center text-sm font-medium text-slate-700">
                      Payment term and type
                    </label>
                    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                      <div className="rounded-md border bg-white px-3 py-2 text-slate-700">
                        {order.can_view_financials ? (
                          order.payment_term_text || '-'
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </div>
                      <div className="rounded-md border bg-white px-3 py-2 text-slate-700">
                        {order.can_view_financials ? (
                          formatPaymentTypeLabel(order.payment_type)
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-center text-sm font-medium text-slate-700">
                      Currency
                    </label>
                    <div className="rounded-md border bg-white px-3 py-2 text-slate-700">
                      {order.can_view_financials ? (
                        order.currency || '-'
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-center text-sm font-medium text-slate-700">
                      PVM
                    </label>
                    <div className="rounded-md border bg-white px-3 py-2 text-slate-700">
                      {order.can_view_financials ? (
                        `${order.vat_rate ?? 21}%`
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <div className="space-y-6 text-sm">
              <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.35fr)]">
                <div className="flex flex-col gap-2">
                  <label className="block text-center text-sm font-medium text-slate-700">
                    Client order number
                  </label>
                  <input
                    value={form.client_order_number}
                    onChange={(e) => update('client_order_number', e.target.value)}
                    className="w-full border rounded-md px-3 py-2"
                    placeholder="Client order number"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="block text-center text-sm font-medium text-slate-700">
                    Client
                  </label>
                  <select
                    value={form.client_company_id}
                    onChange={(e) => {
                      update('client_company_id', e.target.value);
                      update('received_from_name', '');
                      update('received_from_contact', '');
                      setSelectedContactId('');
                    }}
                    className="w-full border rounded-md px-3 py-2"
                  >
                    <option value="">Select client</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                        {client.company_code ? ` (${client.company_code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-1 block text-center text-sm font-medium text-slate-700">
                    Received From
                  </div>
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
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
                    value={form.received_from_name}
                    onChange={(e) => {
                      setSelectedContactId('');
                      update('received_from_name', e.target.value);
                    }}
                    className="w-full border rounded-md px-3 py-2 bg-white"
                    placeholder="Name, Surname"
                  />

                  <input
                    value={form.received_from_contact}
                    onChange={(e) => {
                      setSelectedContactId('');
                      update('received_from_contact', e.target.value);
                    }}
                    className="w-full border rounded-md px-3 py-2 bg-white"
                    placeholder="Contact"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[140px_minmax(0,420px)_120px_100px] xl:items-end">
                  <div>
                    <label className="mb-1 block text-center text-sm font-medium text-slate-700">
                      Price
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.price}
                      onChange={(e) => update('price', e.target.value)}
                      className="w-full border rounded-md px-3 py-2 bg-white"
                      placeholder="Price"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-center text-sm font-medium text-slate-700">
                      Payment term and type
                    </label>
                    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                      <input
                        value={form.payment_term_text}
                        onChange={(e) =>
                          update('payment_term_text', normalizePaymentTermValue(e.target.value))
                        }
                        className="w-full border rounded-md px-3 py-2 bg-white"
                        placeholder="30"
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
                    <label className="mb-1 block text-center text-sm font-medium text-slate-700">
                      Currency
                    </label>
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
                    <label className="mb-1 block text-center text-sm font-medium text-slate-700">
                      PVM
                    </label>
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

            </div>
          )}
        </div>

      <div className="rounded-2xl border bg-slate-50 p-6 space-y-4">
        <div className="text-center text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
          Cargo Description
        </div>
        {!editing ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.7fr)_110px_120px_120px_auto] xl:items-center">
            <div className="rounded-md border bg-white px-3 py-2 text-slate-700">
              {order.cargo_description || '-'}
            </div>
            <div className="rounded-md border bg-white px-3 py-2 text-slate-700">
              {order.cargo_quantity || '-'}
            </div>
            <div className="rounded-md border bg-white px-3 py-2 text-slate-700">
              {order.cargo_kg !== null && order.cargo_kg !== undefined
                ? `${order.cargo_kg} KG`
                : '-'}
            </div>
            <div className="rounded-md border bg-white px-3 py-2 text-slate-700">
              {order.cargo_ldm !== null && order.cargo_ldm !== undefined
                ? `${order.cargo_ldm} LDM`
                : '-'}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                order.load_type || null,
                order.has_ex1 ? 'EX1' : null,
                order.has_t1 ? 'T1' : null,
                order.has_adr ? 'ADR' : null,
                order.has_sent ? 'SENT' : null,
              ]
                .filter(Boolean)
                .map((label) => (
                  <div
                    key={label}
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"
                  >
                    {label}
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              value={form.cargo_description}
              onChange={(e) => update('cargo_description', e.target.value)}
              className="w-full min-h-[72px] border rounded-md bg-white px-3 py-2"
              placeholder="Cargo description, e. g. 120x100x100 big bags"
            />
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_120px_120px_112px_auto] xl:items-center">
            <div className="relative">
              <input
                value={form.cargo_quantity}
                onChange={(e) => update('cargo_quantity', e.target.value)}
                className="w-full border rounded-md bg-white px-3 py-2 pr-14"
                placeholder="Quantity"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-500">
                QTY
              </span>
            </div>
            <div className="relative">
              <input type="number" min="0" step="0.01" value={form.cargo_kg} onChange={(e) => update('cargo_kg', e.target.value)} className="w-full border rounded-md bg-white px-3 py-2 pr-12" placeholder="0" />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-500">
                KG
              </span>
            </div>
            <div className="relative">
              <input type="number" min="0" step="0.01" value={form.cargo_ldm} onChange={(e) => update('cargo_ldm', e.target.value)} className="w-full border rounded-md bg-white px-3 py-2 pr-14" placeholder="0" />
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
              className="w-full rounded-md border bg-white px-3 py-2"
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
                <label key={field} className="flex items-center justify-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium text-slate-700">
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
        )}
      </div>
      </div>

      {activeCargoTab ? (
      <div id="order-cargo-sections" className="order-2 rounded-2xl border bg-white p-4 space-y-3">
        {!editing && activeCargoTab === 'linked_trip' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedSharedOrganizationId}
                onChange={(e) => {
                  setCurrentSharedOrganizationId(e.target.value);
                  setShowLinkedTripManagerDropdown(false);
                  setLinkedTripManagerSearch('');
                  setLinkedTripManagerUserId('');
                  setForm((prev) => ({
                    ...prev,
                    shared_manager_user_id: '',
                    shared_organization_id: e.target.value,
                  }));
                }}
                className="min-w-[220px] rounded-md border bg-slate-50 px-3 py-2 text-sm"
              >
                <option value="">Select organization</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>

              <div
                className="relative min-w-[240px] flex-1"
                onBlurCapture={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    window.setTimeout(() => setShowLinkedTripManagerDropdown(false), 0);
                  }
                }}
              >
                <input
                  value={linkedTripManagerSearch}
                  onFocus={() => setShowLinkedTripManagerDropdown(true)}
                  onClick={() => setShowLinkedTripManagerDropdown(true)}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setLinkedTripManagerSearch(nextValue);
                    setShowLinkedTripManagerDropdown(true);
                    setForm((prev) => ({
                      ...prev,
                      shared_manager_user_id: '',
                      shared_organization_id: selectedSharedOrganizationId,
                    }));

                    if (
                      selectedLinkedTripManager &&
                      nextValue.trim() !== formatManagerLabel(selectedLinkedTripManager)
                    ) {
                      setLinkedTripManagerUserId('');
                    }
                  }}
                  placeholder="Trip manager"
                  className="w-full rounded-md border bg-slate-50 px-3 py-2 text-sm"
                  disabled={
                    managersLoading || savingSharedManager || !selectedSharedOrganizationId
                  }
                />

                {showLinkedTripManagerDropdown &&
                (linkedTripManagerSearch.trim() === '' ||
                  (linkedTripManagerSearch.trim().length >= 2 &&
                    (!selectedLinkedTripManager ||
                      linkedTripManagerSearch.trim() !==
                        formatManagerLabel(selectedLinkedTripManager)))) ? (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-md border bg-white shadow-sm">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setShowLinkedTripManagerDropdown(false);
                        setLinkedTripManagerSearch('');
                        setLinkedTripManagerUserId('');
                        setForm((prev) => ({
                          ...prev,
                          shared_manager_user_id: '',
                          shared_organization_id: selectedSharedOrganizationId,
                        }));
                        void saveSharedManager('');
                      }}
                      className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      -
                    </button>
                    {linkedTripManagerSearch.trim().length >= 2 ? (
                      filteredLinkedTripManagers.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-slate-500">No managers found</div>
                      ) : (
                        filteredLinkedTripManagers.map((manager) => (
                        <button
                          key={manager.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            const nextLabel = formatManagerLabel(manager);
                            setShowLinkedTripManagerDropdown(false);
                            setLinkedTripManagerSearch(nextLabel);
                            setLinkedTripManagerUserId(manager.id);
                            setForm((prev) => ({
                              ...prev,
                              shared_manager_user_id: manager.id,
                              shared_organization_id: selectedSharedOrganizationId,
                            }));
                            void saveSharedManager(manager.id);
                          }}
                          className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50 last:border-b-0"
                        >
                          {formatManagerLabel(manager)}
                        </button>
                        ))
                      )
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div
                className="relative min-w-[220px] flex-[1.2]"
                onBlurCapture={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    window.setTimeout(() => setShowTripOptionsDropdown(false), 0);
                  }
                }}
              >
                <input
                  placeholder="TR-000004"
                  value={tripSearch}
                  onFocus={() => setShowTripOptionsDropdown(true)}
                  onClick={() => setShowTripOptionsDropdown(true)}
                  onChange={(e) => {
                    setTripSearch(e.target.value);
                    setShowTripOptionsDropdown(true);
                  }}
                  className="w-full rounded-md border bg-slate-50 px-3 py-2 text-sm"
                />

                {showTripOptionsDropdown ? (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-md border bg-white shadow-sm">
                    {tripOptionsLoading ? (
                      <div className="flex justify-center py-3">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    ) : availableTrips.length > 0 ? (
                      availableTrips.map((availableTrip) => (
                        <div
                          key={availableTrip.id}
                          className="border-b px-3 py-3 last:border-b-0"
                        >
                          <div className="font-medium text-sm text-slate-900">
                            {availableTrip.trip_number}
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            {availableTrip.carrier?.name || '-'}
                            {availableTrip.carrier?.company_code
                              ? ` (${availableTrip.carrier.company_code})`
                              : ''}
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            {[
                              availableTrip.driver_name,
                              availableTrip.truck_plate,
                              availableTrip.trailer_plate,
                            ]
                              .filter(Boolean)
                              .join(' / ') || '-'}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setShowTripOptionsDropdown(false);
                                router.push(`/app/trips/${availableTrip.id}`);
                              }}
                              className="border rounded-md px-3 py-1.5 text-xs hover:bg-slate-50"
                            >
                              Open Trip
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setShowTripOptionsDropdown(false);
                                void linkTrip(availableTrip.id);
                              }}
                              disabled={tripActionLoadingId === availableTrip.id}
                              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                              {tripActionLoadingId === availableTrip.id
                                ? 'Linking...'
                                : 'Link Trip'}
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-3 py-3 text-sm text-slate-500">
                        {linkedTripManagerUserId
                          ? 'Trip not found or not shown to you by this manager.'
                          : 'Trip not found or not shown to you.'}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveCargoTab(null);
                }}
                className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        ) : null}

        {editing ? (
          <div className="text-sm text-slate-500">
            Finish editing order details before managing cargo.
          </div>
        ) : activeCargoTab === 'documents' ? (
          documentsLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-slate-500">
                  Shared document zones for this order.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveCargoTab(null);
                  }}
                  className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {visibleDocumentZones.map((zone) => {
                  const zoneDocuments = documentsByZone[zone];
                  const canUploadIntoZone =
                    zone !== 'order' || orderDocumentPermissions.can_upload_order_zone;

                  return (
                    <div key={zone} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900">
                          {ORDER_DOCUMENT_ZONE_LABELS[zone]}
                        </div>

                        {canUploadIntoZone ? (
                          <label className="inline-flex cursor-pointer items-center justify-center rounded-md border bg-white px-3 py-2 text-sm hover:bg-slate-50">
                            {uploadingDocuments ? 'Uploading...' : 'Add file'}
                            <input
                              type="file"
                              accept={ORDER_DOCUMENT_ACCEPT_ATTRIBUTE}
                              multiple
                              className="hidden"
                              disabled={uploadingDocuments}
                              onChange={(e) => {
                                void uploadOrderDocuments(zone, e.target.files);
                                e.currentTarget.value = '';
                              }}
                            />
                          </label>
                        ) : (
                          <div className="text-xs text-slate-500">
                            Visible only to source organization
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        {zoneDocuments.length === 0 ? (
                          <div className="rounded-lg border border-dashed bg-white px-3 py-4 text-center text-sm text-slate-500">
                            {canUploadIntoZone
                              ? 'No files uploaded yet.'
                              : 'This zone is hidden for partner organizations.'}
                          </div>
                        ) : (
                          zoneDocuments.map((document) => (
                            <div
                              key={document.id}
                              className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-slate-900">
                                  {document.original_file_name}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {formatOrderDocumentFileSize(document.file_size)}
                                  {' / '}
                                  {document.created_at
                                    ? new Date(document.created_at).toLocaleString()
                                    : '-'}
                                </div>
                                <div className="text-xs text-slate-500">
                                  Uploaded by {formatPerson(document.created_by_user)}
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (document.signed_url) {
                                      window.open(
                                        document.signed_url,
                                        '_blank',
                                        'noopener,noreferrer'
                                      );
                                    }
                                  }}
                                  disabled={!document.signed_url}
                                  className="rounded-md border px-2.5 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Open
                                </button>
                                {document.can_manage ? (
                                  <button
                                    type="button"
                                    onClick={() => deleteDocument(document.id)}
                                    disabled={deletingDocumentId === document.id}
                                    className="rounded-md border px-2.5 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
                                  >
                                    {deletingDocumentId === document.id
                                      ? 'Deleting...'
                                      : 'Delete'}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : tripOptionsLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : activeCargoTab === 'linked_trip' ? (
          <div className="space-y-3">
            {linkedTrips.length > 0 ? (
              <div className="space-y-2">
                {linkedTrips.map((trip) => (
                  <div
                    key={trip.link_id}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0 flex-1 text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">{trip.trip_number}</span>
                        <span className="mx-2 text-slate-400">/</span>
                        <span>
                          {trip.carrier?.name || '-'}
                          {trip.carrier?.company_code ? ` (${trip.carrier.company_code})` : ''}
                        </span>
                        <span className="mx-2 text-slate-400">/</span>
                        <span className="text-slate-500">
                          {[trip.driver_name, trip.truck_plate, trip.trailer_plate]
                            .filter(Boolean)
                            .join(' / ') || '-'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => router.push(`/app/trips/${trip.trip_id}`)}
                          className="border rounded-md px-3 py-2 text-sm hover:bg-white"
                        >
                          Open Trip
                        </button>
                        <button
                          type="button"
                          onClick={() => unlinkTrip(trip.trip_id)}
                          disabled={tripActionLoadingId === trip.trip_id}
                          className="border rounded-md px-3 py-2 text-sm hover:bg-white disabled:opacity-50"
                        >
                          {tripActionLoadingId === trip.trip_id ? 'Removing...' : 'Unlink'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          linkedTrips.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
            Link trip first.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setActiveCargoTab(null);
                }}
                className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            {linkedTrips.map((trip) => (
              <div
                key={trip.link_id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{trip.trip_number}</div>
                    <div className="text-sm text-slate-600 truncate">
                      {trip.carrier?.name || '-'}
                      {trip.carrier?.company_code ? ` (${trip.carrier.company_code})` : ''}
                    </div>
                    <div className="text-sm text-slate-500 truncate">
                      {[trip.driver_name, trip.truck_plate, trip.trailer_plate]
                        .filter(Boolean)
                        .join(' / ') || '-'}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openNewCargoLegEditor(trip)}
                    className="border rounded-md px-3 py-2 text-sm hover:bg-white"
                  >
                    Add Route
                  </button>
                </div>

                <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                  {trip.cargo_legs.length === 0 ? (
                    <div className="rounded-lg border border-dashed bg-white px-3 py-2 text-sm text-slate-500">
                      No route steps added yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {trip.cargo_legs.map((cargoLeg) => (
                        <div key={cargoLeg.id} className="space-y-2">
                          <div className="flex flex-col gap-3 rounded-lg border bg-white px-3 py-2 xl:flex-row xl:items-center xl:justify-between">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-slate-900">
                                {cargoLeg.leg_order} {formatCargoLegTypeLabel(cargoLeg.leg_type)}
                              </div>
                              <div className="truncate text-sm text-slate-600">
                                {formatOrganizationName(cargoLeg.responsible_organization)}
                                {cargoLeg.responsible_warehouse?.name ? (
                                  <>
                                    <span className="mx-2 text-slate-300">/</span>
                                    {cargoLeg.responsible_warehouse.name}
                                  </>
                                ) : null}
                                <span className="mx-2 text-slate-300">/</span>
                                {formatCargoLegVisibilitySummary(cargoLeg)}
                                <span className="mx-2 text-slate-300">/</span>
                                <span className="text-slate-700">
                                  {cargoLeg.linked_trip?.trip_number || 'No trip selected'}
                                </span>
                              </div>
                              {cargoLeg.responsible_warehouse ||
                              cargoLeg.responsible_organization ? (
                                <div className="truncate text-xs text-slate-500">
                                  {cargoLeg.responsible_warehouse
                                    ? formatWarehouseLocation(cargoLeg.responsible_warehouse)
                                    : formatOrganizationLocation(
                                        cargoLeg.responsible_organization
                                      )}
                                </div>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-2">
                              {cargoLeg.linked_trip && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    router.push(`/app/trips/${cargoLeg.linked_trip!.id}`)
                                  }
                                  className="border rounded-md px-3 py-2 text-sm hover:bg-slate-50"
                                >
                                  Open Trip
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openExistingCargoLegEditor(trip, cargoLeg)}
                                className="border rounded-md px-3 py-2 text-sm hover:bg-slate-50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteCargoLeg(cargoLeg.id)}
                                disabled={cargoLegDeletingId === cargoLeg.id}
                                className="border rounded-md px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                              >
                                {cargoLegDeletingId === cargoLeg.id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          </div>

                          {cargoLegEditorLinkId === trip.link_id &&
                          editingCargoLegId === cargoLeg.id
                            ? renderCargoLegEditor()
                            : null}
                        </div>
                      ))}
                    </div>
                  )}

                  {cargoLegEditorLinkId === trip.link_id && !editingCargoLegId
                    ? renderCargoLegEditor()
                    : null}
                </div>
              </div>
            ))}
          </div>
          )
        )}
      </div>
      ) : null}

      <div className="order-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border bg-white p-6 space-y-4">
          <h2 className="text-xl font-semibold text-center">Loading</h2>
          {!editing ? (
            <div className="grid grid-cols-1 gap-4 text-sm">
              <InfoRow
                label="Date / time"
                value={formatOrderTimeRange(
                  order.loading_date,
                  order.loading_time_from,
                  order.loading_time_to
                )}
              />
              <InfoRow label="Address" value={order.loading_address || '-'} />
              <InfoRow label="City" value={order.loading_city || '-'} />
              <InfoRow label="Postal code" value={order.loading_postal_code || '-'} />
              <InfoRow label="Country" value={order.loading_country || '-'} />
              <InfoRow label="Contact" value={order.loading_contact || '-'} />
              <InfoRow label="Reference" value={order.loading_reference || '-'} />
              <InfoRow label="Customs info" value={order.loading_customs_info || '-'} />
              <InfoRow label="Shipper" value={order.shipper_name || '-'} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 text-sm">
              <div className="grid grid-cols-[minmax(0,1fr)_88px_88px] items-center gap-2">
                <input type="date" value={form.loading_date} onChange={(e) => update('loading_date', e.target.value)} className="w-full border rounded-md px-3 py-2" />
                <input type="text" value={form.loading_time_from} onChange={(e) => update('loading_time_from', e.target.value)} inputMode="numeric" maxLength={5} placeholder="08:30" className="w-full border rounded-md px-3 py-2" />
                <input type="text" value={form.loading_time_to} onChange={(e) => update('loading_time_to', e.target.value)} inputMode="numeric" maxLength={5} placeholder="16:30" className="w-full border rounded-md px-3 py-2" />
              </div>
              <input value={form.loading_address} onChange={(e) => update('loading_address', e.target.value)} className="w-full border rounded-md px-3 py-2" placeholder="Loading address" />
              <input value={form.loading_city} onChange={(e) => update('loading_city', e.target.value)} className="w-full border rounded-md px-3 py-2" placeholder="Loading city" />
              <input value={form.loading_postal_code} onChange={(e) => update('loading_postal_code', e.target.value)} className="w-full border rounded-md px-3 py-2" placeholder="Loading postal code" />
              <div>
                <input list="order-country-options" value={form.loading_country} onChange={(e) => update('loading_country', e.target.value)} className="w-full border rounded-md px-3 py-2" placeholder="Loading country" />
                <datalist id="order-country-options">
                  {COUNTRIES.map((country) => (
                    <option key={country} value={country} />
                  ))}
                </datalist>
              </div>
              <input value={form.loading_contact} onChange={(e) => update('loading_contact', e.target.value)} className="w-full border rounded-md px-3 py-2" placeholder="Loading contact" />
              <input value={form.loading_reference} onChange={(e) => update('loading_reference', e.target.value)} className="w-full border rounded-md px-3 py-2" placeholder="Loading reference" />
              <textarea value={form.loading_customs_info} onChange={(e) => update('loading_customs_info', e.target.value)} className="w-full min-h-[100px] border rounded-md px-3 py-2" placeholder="Loading customs info" />
              <input
                value={form.shipper_name}
                list="order-shipper-party-address-options"
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
                className="w-full border rounded-md px-3 py-2"
                placeholder="Shipper name"
              />
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-6 space-y-4">
          <h2 className="text-xl font-semibold text-center">Unloading</h2>
          {!editing ? (
            <div className="grid grid-cols-1 gap-4 text-sm">
              <InfoRow
                label="Date / time"
                value={formatOrderTimeRange(
                  order.unloading_date,
                  order.unloading_time_from,
                  order.unloading_time_to
                )}
              />
              <InfoRow label="Address" value={order.unloading_address || '-'} />
              <InfoRow label="City" value={order.unloading_city || '-'} />
              <InfoRow label="Postal code" value={order.unloading_postal_code || '-'} />
              <InfoRow label="Country" value={order.unloading_country || '-'} />
              <InfoRow label="Contact" value={order.unloading_contact || '-'} />
              <InfoRow label="Reference" value={order.unloading_reference || '-'} />
              <InfoRow label="Customs info" value={order.unloading_customs_info || '-'} />
              <InfoRow label="Consignee" value={order.consignee_name || '-'} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 text-sm">
              <div className="grid grid-cols-[minmax(0,1fr)_88px_88px] items-center gap-2">
                <input type="date" value={form.unloading_date} onChange={(e) => update('unloading_date', e.target.value)} className="w-full border rounded-md px-3 py-2" />
                <input type="text" value={form.unloading_time_from} onChange={(e) => update('unloading_time_from', e.target.value)} inputMode="numeric" maxLength={5} placeholder="08:30" className="w-full border rounded-md px-3 py-2" />
                <input type="text" value={form.unloading_time_to} onChange={(e) => update('unloading_time_to', e.target.value)} inputMode="numeric" maxLength={5} placeholder="16:30" className="w-full border rounded-md px-3 py-2" />
              </div>
              <input value={form.unloading_address} onChange={(e) => update('unloading_address', e.target.value)} className="w-full border rounded-md px-3 py-2" placeholder="Unloading address" />
              <input value={form.unloading_city} onChange={(e) => update('unloading_city', e.target.value)} className="w-full border rounded-md px-3 py-2" placeholder="Unloading city" />
              <input value={form.unloading_postal_code} onChange={(e) => update('unloading_postal_code', e.target.value)} className="w-full border rounded-md px-3 py-2" placeholder="Unloading postal code" />
              <input list="order-country-options" value={form.unloading_country} onChange={(e) => update('unloading_country', e.target.value)} className="w-full border rounded-md px-3 py-2" placeholder="Unloading country" />
              <input value={form.unloading_contact} onChange={(e) => update('unloading_contact', e.target.value)} className="w-full border rounded-md px-3 py-2" placeholder="Unloading contact" />
              <input value={form.unloading_reference} onChange={(e) => update('unloading_reference', e.target.value)} className="w-full border rounded-md px-3 py-2" placeholder="Unloading reference" />
              <textarea value={form.unloading_customs_info} onChange={(e) => update('unloading_customs_info', e.target.value)} className="w-full min-h-[100px] border rounded-md px-3 py-2" placeholder="Unloading customs info" />
              <input
                value={form.consignee_name}
                list="order-consignee-party-address-options"
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
                className="w-full border rounded-md px-3 py-2"
                placeholder="Consignee name"
              />
            </div>
          )}
        </div>
      </div>

      <datalist id="order-shipper-party-address-options">
        {shipperMatches.map((match) => (
          <option key={match.id} value={match.party_name} />
        ))}
      </datalist>
      <datalist id="order-consignee-party-address-options">
        {consigneeMatches.map((match) => (
          <option key={match.id} value={match.party_name} />
        ))}
      </datalist>

      <div className="order-5 rounded-2xl border bg-white p-6 space-y-4">
        <h2 className="text-xl font-semibold">Notes</h2>
        {!editing ? (
          <div className="text-sm text-slate-700 whitespace-pre-wrap">{order.notes || '-'}</div>
        ) : (
          <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} className="w-full min-h-[120px] border rounded-md px-3 py-2" placeholder="Notes" />
        )}
      </div>
    </div>
  );
}
