'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { ArrowLeft, Loader2, Pencil, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import {
  TRIP_SEGMENT_TYPES,
  TRIP_SEGMENT_TYPE_LABELS,
  type TripSegmentType,
} from '@/lib/constants/trip-segment-types';
import {
  CARGO_LEG_TYPES,
  CARGO_LEG_TYPE_LABELS,
  type CargoLegType,
} from '@/lib/constants/cargo-leg-types';
import {
  PAYMENT_TYPE_OPTIONS,
  formatPaymentTypeLabel,
} from '@/lib/constants/payment-types';

type TripDetails = {
  id: string;
  trip_number: string;
  status: 'unconfirmed' | 'confirmed' | 'active' | 'completed';
  can_view_financials: boolean;
  carrier_company_id: string | null;
  groupage_responsible_manager_id: string | null;
  truck_plate: string | null;
  trailer_plate: string | null;
  driver_name: string | null;
  price: number | null;
  payment_term_days: number | null;
  payment_type: string | null;
  vat_rate: string | null;
  notes: string | null;
  is_groupage: boolean;
  groupage_manager: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  created_at: string | null;
  updated_at: string | null;
  carrier: {
    name: string | null;
    company_code: string | null;
  } | null;
  created_by_user: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  workflow_contact_display?: string | null;
  workflow_trip_vehicle_display?: string | null;
};

type CarrierOption = {
  id: string;
  name: string;
  company_code: string;
  payment_term_days: number | null;
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

type LinkedOrderRow = {
  link_id: string;
  order_id: string;
  trip_segment_id: string | null;
  internal_order_number: string;
  client_order_number: string | null;
  status: string | null;
  loading_date: string | null;
  loading_city: string | null;
  loading_country: string | null;
  unloading_date: string | null;
  unloading_city: string | null;
  unloading_country: string | null;
  cargo_description: string | null;
  cargo_quantity: string | null;
  cargo_kg: number | null;
  cargo_ldm: number | null;
  price: number | null;
  currency: string | null;
  created_at: string | null;
  client: {
    name: string | null;
    company_code: string | null;
  } | null;
  cargo_legs: CargoLegRow[];
};

type AvailableOrderRow = {
  id: string;
  internal_order_number: string;
  client_order_number: string | null;
  status: string | null;
  price: number | null;
  currency: string | null;
  created_at: string | null;
  client: {
    name: string | null;
    company_code: string | null;
  } | null;
};

type SegmentTripOption = {
  id: string;
  trip_number: string;
  status: string | null;
  driver_name: string | null;
  truck_plate: string | null;
  trailer_plate: string | null;
  is_groupage: boolean | null;
  carrier: {
    name: string | null;
    company_code: string | null;
  } | null;
};

type TripTabId = 'information' | 'linked_order' | 'segments';

type CargoLegRow = {
  id: string;
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
  linked_trip: SegmentTripOption | null;
};

type TripSegmentRow = {
  id: string;
  trip_id: string;
  linked_trip_id: string | null;
  segment_order: number;
  segment_type: TripSegmentType;
  created_at: string | null;
  updated_at: string | null;
  linked_trip: SegmentTripOption | null;
};

function formatManagerLabel(
  manager:
    | { first_name: string | null; last_name: string | null }
    | null
    | undefined
) {
  if (!manager) return '-';

  return `${manager.first_name || ''} ${manager.last_name || ''}`.trim() || '-';
}

function formatTripSegmentTypeLabel(type: TripSegmentType | null | undefined) {
  if (!type) return '-';

  return TRIP_SEGMENT_TYPE_LABELS[type] || type;
}

function formatCargoLegTypeLabel(type: CargoLegType | null | undefined) {
  if (!type) return '-';

  return CARGO_LEG_TYPE_LABELS[type] || type;
}

function formatSegmentTripMeta(trip: SegmentTripOption | null | undefined) {
  if (!trip) return '-';

  const primary = [
    trip.carrier?.name || null,
    trip.truck_plate || null,
    trip.trailer_plate || null,
    trip.driver_name || null,
  ].filter(Boolean);

  if (primary.length > 0) {
    return primary.join(' / ');
  }

  return '-';
}

function formatTripLegOptionLabel(segment: TripSegmentRow) {
  const parts = [
    `#${segment.segment_order}`,
    formatTripSegmentTypeLabel(segment.segment_type),
    segment.linked_trip?.trip_number || null,
  ].filter(Boolean);

  return parts.join(' / ');
}

function formatCargoLegOptionLabel(cargoLeg: CargoLegRow) {
  const parts = [
    `#${cargoLeg.leg_order}`,
    formatCargoLegTypeLabel(cargoLeg.leg_type),
    cargoLeg.linked_trip?.trip_number || null,
  ].filter(Boolean);

  return parts.join(' / ');
}

function formatLocationLine(parts: Array<string | null | undefined>) {
  const normalized = parts
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value !== '');

  return normalized.length > 0 ? normalized.join(', ') : '-';
}

function formatCargoLegResponsibility(cargoLeg: CargoLegRow) {
  const organizationName = cargoLeg.responsible_organization?.name?.trim() || '-';
  const warehouseName = cargoLeg.responsible_warehouse?.name?.trim();

  return warehouseName ? `${organizationName} / ${warehouseName}` : organizationName;
}

function formatCargoLegAddress(cargoLeg: CargoLegRow) {
  const source = cargoLeg.responsible_warehouse || cargoLeg.responsible_organization;

  if (!source) return '-';

  return formatLocationLine([
    source.address,
    source.city,
    source.postal_code,
    source.country,
  ]);
}

function formatLinkedOrderRouteSummary(orderRow: LinkedOrderRow, currentTripId: string) {
  const matchingCargoLeg =
    orderRow.cargo_legs.find((cargoLeg) => cargoLeg.linked_trip_id === currentTripId) ||
    orderRow.cargo_legs[0] ||
    null;

  if (!matchingCargoLeg) {
    return null;
  }

  return {
    cargoLeg: matchingCargoLeg,
    title: `${matchingCargoLeg.leg_order}. ${formatCargoLegTypeLabel(
      matchingCargoLeg.leg_type
    )}`,
    organization: formatCargoLegResponsibility(matchingCargoLeg),
    address: formatCargoLegAddress(matchingCargoLeg),
  };
}

function getNextSegmentOrder(segments: TripSegmentRow[]) {
  if (segments.length === 0) return 1;

  return Math.max(...segments.map((segment) => segment.segment_order)) + 1;
}

function getNextCargoLegOrder(cargoLegs: CargoLegRow[]) {
  if (cargoLegs.length === 0) return 1;

  return Math.max(...cargoLegs.map((cargoLeg) => cargoLeg.leg_order)) + 1;
}

export default function TripPage() {
  const params = useParams();
  const router = useRouter();
  const tripId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState<TripDetails | null>(null);
  const [orderDraft, setOrderDraft] = useState<{
    exists: boolean;
    status: string | null;
    updated_at: string | null;
  } | null>(null);
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [carriersLoading, setCarriersLoading] = useState(false);
  const [managersLoading, setManagersLoading] = useState(true);
  const [sharedManagerSearch, setSharedManagerSearch] = useState('');
  const [showSharedManagerDropdown, setShowSharedManagerDropdown] = useState(false);
  const [groupageManagerSearch, setGroupageManagerSearch] = useState('');
  const [carrierSearch, setCarrierSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<TripTabId>('information');
  const [currentSharedManagerUserId, setCurrentSharedManagerUserId] = useState('');
  const [currentSharedOrganizationId, setCurrentSharedOrganizationId] = useState('');
  const [orderOptionsLoading, setOrderOptionsLoading] = useState(true);
  const [linkedOrders, setLinkedOrders] = useState<LinkedOrderRow[]>([]);
  const [availableOrders, setAvailableOrders] = useState<AvailableOrderRow[]>([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [showOrderOptionsDropdown, setShowOrderOptionsDropdown] = useState(false);
  const [orderActionLoadingId, setOrderActionLoadingId] = useState('');
  const [orderTripLegSavingId, setOrderTripLegSavingId] = useState('');
  const [cargoLegSaving, setCargoLegSaving] = useState(false);
  const [cargoLegLookupLoading, setCargoLegLookupLoading] = useState(false);
  const [matchedCargoLegTrip, setMatchedCargoLegTrip] =
    useState<SegmentTripOption | null>(null);
  const [cargoLegLookupMessage, setCargoLegLookupMessage] = useState('');
  const [cargoLegDeletingId, setCargoLegDeletingId] = useState('');
  const [creatingCargoLinkedTrip, setCreatingCargoLinkedTrip] = useState(false);
  const [cargoLegEditorLinkId, setCargoLegEditorLinkId] = useState<string | null>(null);
  const [editingCargoLegId, setEditingCargoLegId] = useState<string | null>(null);
  const [cargoLegForm, setCargoLegForm] = useState({
    leg_order: '1',
    leg_type: 'international_trip' as CargoLegType,
    linked_trip_number: '',
  });
  const [savingSharedManager, setSavingSharedManager] = useState(false);
  const [missingTripSharedManager, setMissingTripSharedManager] = useState(false);
  const [awaitingOrderNumber, setAwaitingOrderNumber] = useState(false);
  const [segmentsLoading, setSegmentsLoading] = useState(true);
  const [segments, setSegments] = useState<TripSegmentRow[]>([]);
  const [segmentSaving, setSegmentSaving] = useState(false);
  const [segmentLookupLoading, setSegmentLookupLoading] = useState(false);
  const [matchedSegmentTrip, setMatchedSegmentTrip] =
    useState<SegmentTripOption | null>(null);
  const [segmentLookupMessage, setSegmentLookupMessage] = useState('');
  const [segmentDeletingId, setSegmentDeletingId] = useState('');
  const [creatingLinkedTrip, setCreatingLinkedTrip] = useState(false);
  const [segmentEditorOpen, setSegmentEditorOpen] = useState(false);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [segmentForm, setSegmentForm] = useState({
    segment_order: '1',
    segment_type: 'international_trip' as TripSegmentType,
    linked_trip_number: '',
  });

  const [form, setForm] = useState({
    id: '',
    status: 'unconfirmed' as 'unconfirmed' | 'confirmed' | 'active' | 'completed',
    shared_manager_user_id: '',
    shared_organization_id: '',
    groupage_responsible_manager_id: '',
    groupage_shared_organization_id: '',
    carrier_company_id: '',
    truck_plate: '',
    trailer_plate: '',
    driver_name: '',
    price: '',
    payment_term_days: '',
    payment_type: '',
    vat_rate: '',
    notes: '',
    is_groupage: false,
  });

  const update = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    fetchTrip();
  }, [tripId]);

  useEffect(() => {
    fetchOrderOptions();
  }, [tripId, currentSharedManagerUserId, orderSearch]);

  useEffect(() => {
    if (activeTab !== 'linked_order') {
      setShowOrderOptionsDropdown(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!segmentEditorOpen) {
      setMatchedSegmentTrip(null);
      setSegmentLookupMessage('');
      setSegmentLookupLoading(false);
      return;
    }

    const query = segmentForm.linked_trip_number.trim();

    if (!query) {
      setMatchedSegmentTrip(null);
      setSegmentLookupMessage('');
      setSegmentLookupLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      lookupSegmentTrip(query);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [
    tripId,
    segmentEditorOpen,
    editingSegmentId,
    segmentForm.linked_trip_number,
  ]);

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
  ]);

  useEffect(() => {
    fetchCarriers();
    fetchShareOrganizations();
  }, []);

  useEffect(() => {
    if (!currentSharedOrganizationId) {
      setManagers([]);
      return;
    }

    void fetchManagers(currentSharedOrganizationId);
  }, [currentSharedOrganizationId]);

  const fetchTrip = async () => {
    try {
      setLoading(true);

      const [tripResponse, draftResponse] = await Promise.all([
        fetch(`/api/trips/details?tripId=${tripId}`, {
          method: 'GET',
        }),
        fetch(`/api/trips/order-draft?tripId=${tripId}`),
      ]);

      const tripData = await tripResponse.json();

      if (!tripResponse.ok || !tripData?.trip) {
        toast.error('Failed to load trip');
        return;
      }

      const normalized = tripData.trip as TripDetails;
      const sharedManagerUserId = tripData.shared_manager_user_id ?? '';
      const sharedOrganizationId = tripData.shared_organization_id ?? '';

      setTrip(normalized);
      setCurrentSharedManagerUserId(sharedManagerUserId);
      setCurrentSharedOrganizationId(sharedOrganizationId);
      setForm({
        id: normalized.id,
        status: normalized.status,
        shared_manager_user_id: sharedManagerUserId,
        shared_organization_id: sharedOrganizationId,
        groupage_responsible_manager_id:
          normalized.is_groupage
            ? normalized.groupage_responsible_manager_id ?? sharedManagerUserId
            : '',
        groupage_shared_organization_id: sharedOrganizationId,
        carrier_company_id: normalized.carrier_company_id ?? '',
        truck_plate: normalized.truck_plate ?? '',
        trailer_plate: normalized.trailer_plate ?? '',
        driver_name: normalized.driver_name ?? '',
        price:
          normalized.price !== null && normalized.price !== undefined
            ? String(normalized.price)
            : '',
        payment_term_days:
          normalized.payment_term_days !== null &&
          normalized.payment_term_days !== undefined
            ? String(normalized.payment_term_days)
            : '',
        payment_type: normalized.payment_type ?? '',
        vat_rate: normalized.vat_rate ?? '',
        notes: normalized.notes ?? '',
        is_groupage: !!normalized.is_groupage,
      });

      setGroupageManagerSearch(
        normalized.is_groupage && normalized.groupage_manager
          ? formatManagerLabel(normalized.groupage_manager)
          : ''
      );

      setCarrierSearch(
        normalized.carrier
          ? `${normalized.carrier.name}${normalized.carrier.company_code ? ` (${normalized.carrier.company_code})` : ''}`
          : ''
      );

      const draftData = await draftResponse.json();

      if (draftResponse.ok && draftData?.draft) {
        setOrderDraft({
          exists: true,
          status: draftData.draft.status ?? null,
          updated_at: draftData.draft.updated_at ?? null,
        });
      } else {
        setOrderDraft({
          exists: false,
          status: null,
          updated_at: null,
        });
      }
    } catch (error) {
      toast.error('Failed to load trip');
    } finally {
      setLoading(false);
    }
  };

  const fetchCarriers = async () => {
    try {
      setCarriersLoading(true);

      const { data, error } = await supabase
        .from('companies')
        .select('id, name, company_code, payment_term_days')
        .eq('is_carrier', true)
        .order('name', { ascending: true });

      if (error) {
        toast.error('Failed to load carriers');
        return;
      }

      setCarriers((data || []) as CarrierOption[]);
    } catch (error) {
      toast.error('Failed to load carriers');
    } finally {
      setCarriersLoading(false);
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
      setCurrentSharedOrganizationId((prev) => prev || data.current_organization_id || '');
      setForm((prev) => ({
        ...prev,
        shared_organization_id:
          prev.shared_organization_id || data.current_organization_id || '',
        groupage_shared_organization_id:
          prev.groupage_shared_organization_id || data.current_organization_id || '',
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

  const fetchOrderOptions = async () => {
    try {
      setOrderOptionsLoading(true);

      const searchParams = new URLSearchParams({ tripId });

      if (orderSearch.trim() !== '') {
        searchParams.set('q', orderSearch.trim());
      }

      const res = await fetch(`/api/trips/link-order-options?${searchParams.toString()}`, {
        method: 'GET',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to load order options');
        setLinkedOrders([]);
        setAvailableOrders([]);
        setMissingTripSharedManager(false);
        setAwaitingOrderNumber(false);
        return;
      }

      setLinkedOrders(data.linked_orders || []);
      setAvailableOrders(data.available_orders || []);
      setMissingTripSharedManager(!!data.missing_trip_shared_manager);
      setAwaitingOrderNumber(!!data.awaiting_order_number);
    } catch (error) {
      toast.error('Failed to load order options');
      setLinkedOrders([]);
      setAvailableOrders([]);
      setMissingTripSharedManager(false);
      setAwaitingOrderNumber(false);
    } finally {
      setOrderOptionsLoading(false);
    }
  };

  const lookupSegmentTrip = async (query: string) => {
    try {
      setSegmentLookupLoading(true);
      setSegmentLookupMessage('');

      const searchParams = new URLSearchParams({
        tripId,
        q: query.trim().toUpperCase(),
      });

      if (editingSegmentId) {
        searchParams.set('segmentId', editingSegmentId);
      }

      const res = await fetch(
        `/api/trip-segments/trip-options?${searchParams.toString()}`,
        {
          method: 'GET',
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setMatchedSegmentTrip(null);
        setSegmentLookupMessage(data.error || 'Failed to find trip');
        return;
      }

      if (data.matched_trip) {
        setMatchedSegmentTrip(data.matched_trip);
        setSegmentLookupMessage('');
        return;
      }

      setMatchedSegmentTrip(null);

      if (data.trip_already_used) {
        setSegmentLookupMessage('This trip is already used in Trip Legs.');
        return;
      }

      if (query.trim() !== '') {
        setSegmentLookupMessage('Trip not found.');
      }
    } catch (error) {
      setMatchedSegmentTrip(null);
      setSegmentLookupMessage('Failed to find trip');
    } finally {
      setSegmentLookupLoading(false);
    }
  };

  const fetchSegments = async () => {
    try {
      setSegmentsLoading(true);

      const res = await fetch(`/api/trip-segments/list?tripId=${tripId}`, {
        method: 'GET',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to load segments');
        setSegments([]);
        return;
      }

      setSegments(data.segments || []);
    } catch (error) {
      toast.error('Failed to load segments');
      setSegments([]);
    } finally {
      setSegmentsLoading(false);
    }
  };

  const resetSegmentEditor = (nextOrder?: number) => {
    setEditingSegmentId(null);
    setSegmentEditorOpen(false);
    setMatchedSegmentTrip(null);
    setSegmentLookupMessage('');
    setSegmentLookupLoading(false);
    setSegmentForm({
      segment_order: String(nextOrder ?? getNextSegmentOrder(segments)),
      segment_type: 'international_trip',
      linked_trip_number: '',
    });
  };

  const openNewSegmentEditor = () => {
    setEditingSegmentId(null);
    setSegmentEditorOpen(true);
    setMatchedSegmentTrip(null);
    setSegmentLookupMessage('');
    setSegmentForm({
      segment_order: String(getNextSegmentOrder(segments)),
      segment_type: 'international_trip',
      linked_trip_number: '',
    });
  };

  const openExistingSegmentEditor = (segment: TripSegmentRow) => {
    setEditingSegmentId(segment.id);
    setSegmentEditorOpen(true);
    setMatchedSegmentTrip(segment.linked_trip);
    setSegmentLookupMessage('');
    setSegmentForm({
      segment_order: String(segment.segment_order),
      segment_type: segment.segment_type,
      linked_trip_number: segment.linked_trip?.trip_number ?? '',
    });
  };

  const saveSegment = async () => {
    if (!matchedSegmentTrip) {
      toast.error('First choose trip');
      return;
    }

    try {
      setSegmentSaving(true);
      const requestedOrder = Number(segmentForm.segment_order);

      const payload = editingSegmentId
        ? {
            id: editingSegmentId,
            segment_order: requestedOrder,
            segment_type: segmentForm.segment_type,
            linked_trip_id: matchedSegmentTrip.id,
          }
        : {
            trip_id: tripId,
            segment_order: requestedOrder,
            segment_type: segmentForm.segment_type,
            linked_trip_id: matchedSegmentTrip.id,
          };

      const res = await fetch(
        editingSegmentId ? '/api/trip-segments/update' : '/api/trip-segments/create',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to save segment');
        return;
      }

      toast.success(editingSegmentId ? 'Trip leg updated' : 'Trip added to Trip Legs');
      await fetchSegments();
      resetSegmentEditor(
        editingSegmentId
          ? undefined
          : Math.max(getNextSegmentOrder(segments), requestedOrder + 1)
      );
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setSegmentSaving(false);
    }
  };

  const createLinkedTrip = async () => {
    try {
      setCreatingLinkedTrip(true);
      const requestedOrder = Number(segmentForm.segment_order);

      const res = await fetch('/api/trip-segments/create-linked-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip_id: tripId,
          segment_order: requestedOrder,
          segment_type: segmentForm.segment_type,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to create trip');
        return;
      }

      toast.success(`Trip ${data.created_trip?.trip_number || ''} created`);
      await fetchSegments();
      resetSegmentEditor(Math.max(getNextSegmentOrder(segments), requestedOrder + 1));
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setCreatingLinkedTrip(false);
    }
  };

  const deleteSegment = async (segmentId: string) => {
    try {
      setSegmentDeletingId(segmentId);

      const res = await fetch('/api/trip-segments/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: segmentId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to delete trip leg');
        return;
      }

      toast.success('Trip leg deleted');
      await fetchSegments();

      if (editingSegmentId === segmentId) {
        resetSegmentEditor();
      }
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setSegmentDeletingId('');
    }
  };

  const resetCargoLegEditor = () => {
    setCargoLegEditorLinkId(null);
    setEditingCargoLegId(null);
    setMatchedCargoLegTrip(null);
    setCargoLegLookupMessage('');
    setCargoLegLookupLoading(false);
    setCargoLegForm({
      leg_order: '1',
      leg_type: 'international_trip',
      linked_trip_number: '',
    });
  };

  const openNewCargoLegEditor = (orderRow: LinkedOrderRow) => {
    setCargoLegEditorLinkId(orderRow.link_id);
    setEditingCargoLegId(null);
    setMatchedCargoLegTrip(null);
    setCargoLegLookupMessage('');
    setCargoLegLookupLoading(false);
    setCargoLegForm({
      leg_order: String(getNextCargoLegOrder(orderRow.cargo_legs || [])),
      leg_type: 'international_trip',
      linked_trip_number: '',
    });
  };

  const openExistingCargoLegEditor = (orderRow: LinkedOrderRow, cargoLeg: CargoLegRow) => {
    setCargoLegEditorLinkId(orderRow.link_id);
    setEditingCargoLegId(cargoLeg.id);
    setMatchedCargoLegTrip(cargoLeg.linked_trip);
    setCargoLegLookupMessage('');
    setCargoLegLookupLoading(false);
    setCargoLegForm({
      leg_order: String(cargoLeg.leg_order),
      leg_type: cargoLeg.leg_type,
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

      const res = await fetch(
        `/api/cargo-legs/trip-options?${searchParams.toString()}`,
        {
          method: 'GET',
        }
      );

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

  const saveCargoLeg = async () => {
    if (!cargoLegEditorLinkId) {
      toast.error('Choose cargo first');
      return;
    }

    if (!matchedCargoLegTrip) {
      toast.error('First choose trip');
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
            linked_trip_id: matchedCargoLegTrip.id,
          }
        : {
            order_trip_link_id: cargoLegEditorLinkId,
            leg_order: requestedOrder,
            leg_type: cargoLegForm.leg_type,
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
      await fetchOrderOptions();
      resetCargoLegEditor();
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setCargoLegSaving(false);
    }
  };

  const createCargoLinkedTrip = async () => {
    if (!cargoLegEditorLinkId) {
      toast.error('Choose cargo first');
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
          leg_order: requestedOrder,
          leg_type: cargoLegForm.leg_type,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to create trip');
        return;
      }

      toast.success(`Trip ${data.created_trip?.trip_number || ''} created`);
      await fetchOrderOptions();
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
      await fetchOrderOptions();

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

      const res = await fetch('/api/trips/set-shared-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip_id: tripId,
          shared_manager_user_id: nextManagerUserId,
          shared_organization_id: currentSharedOrganizationId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to save manager');
        return;
      }

      toast.success('Trip manager saved');
      setCurrentSharedManagerUserId(nextManagerUserId);
      if (trip?.is_groupage) {
        setForm((prev) => ({
          ...prev,
          groupage_responsible_manager_id: nextManagerUserId,
        }));
      }
      await Promise.all([fetchTrip(), fetchOrderOptions()]);
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setSavingSharedManager(false);
    }
  };

  const deleteTrip = async () => {
    const confirmed = window.confirm(
      `Delete trip ${trip?.trip_number || ''}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeleting(true);

      const res = await fetch('/api/trips/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tripId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to delete trip');
        return;
      }

      toast.success('Trip deleted');
      router.push('/app/trips');
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setDeleting(false);
    }
  };

  const linkOrder = async (orderId: string) => {
    try {
      setOrderActionLoadingId(orderId);

      const res = await fetch('/api/orders/link-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          trip_id: tripId,
          typed_order_number: orderSearch.trim().toUpperCase(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to link order');
        return;
      }

      toast.success('Order linked to trip');
      await Promise.all([fetchTrip(), fetchOrderOptions()]);
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setOrderActionLoadingId('');
    }
  };

  const unlinkOrder = async (orderId: string) => {
    try {
      setOrderActionLoadingId(orderId);

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
        toast.error(data.error || 'Failed to unlink order');
        return;
      }

      toast.success('Order unlinked from trip');
      await Promise.all([fetchTrip(), fetchOrderOptions()]);
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setOrderActionLoadingId('');
    }
  };

  const saveOrderTripLeg = async (linkId: string, tripSegmentId: string) => {
    try {
      setOrderTripLegSavingId(linkId);

      const res = await fetch('/api/trips/set-order-trip-leg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          link_id: linkId,
          trip_segment_id: tripSegmentId || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to save trip leg');
        return;
      }

      toast.success('Trip leg saved');
      await fetchOrderOptions();
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setOrderTripLegSavingId('');
    }
  };

  const getStatusLabel = (status: TripDetails['status']) => {
    if (status === 'unconfirmed') return 'Unconfirmed';
    if (status === 'confirmed') return 'Confirmed';
    if (status === 'active') return 'Active';
    if (status === 'completed') return 'Completed';
    return status;
  };

  const getStatusBadgeClass = (status: TripDetails['status']) => {
    if (status === 'unconfirmed') {
      return 'bg-yellow-100 text-yellow-800';
    }
    if (status === 'confirmed') {
      return 'bg-blue-100 text-blue-800';
    }
    if (status === 'active') {
      return 'bg-indigo-100 text-indigo-800';
    }
    return 'bg-green-100 text-green-800';
  };

  const filteredCarriers = useMemo(() => {
    const q = carrierSearch.trim().toLowerCase();

    if (!q) return carriers.slice(0, 20);

    return carriers
      .filter(
        (carrier) =>
          carrier.name?.toLowerCase().includes(q) ||
          carrier.company_code?.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [carriers, carrierSearch]);

  const selectedCarrier = carriers.find(
    (carrier) => carrier.id === form.carrier_company_id
  );
  const selectedCarrierLabel = selectedCarrier
    ? `${selectedCarrier.name}${selectedCarrier.company_code ? ` (${selectedCarrier.company_code})` : ''}`
    : '';

  const selectedGroupageManager = managers.find(
    (manager) => manager.id === form.groupage_responsible_manager_id
  );

  const selectedGroupageManagerLabel = selectedGroupageManager
    ? formatManagerLabel(selectedGroupageManager)
    : '';

  const filteredGroupageManagers = useMemo(() => {
    const q = groupageManagerSearch.trim().toLowerCase();

    if (q.length < 2) return [];

    return managers
      .filter((manager) =>
        formatManagerLabel(manager).toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [groupageManagerSearch, managers]);

  const sharedManager = managers.find(
    (manager) => manager.id === currentSharedManagerUserId
  );
  const selectedSharedManagerLabel = sharedManager
    ? formatManagerLabel(sharedManager)
    : '';
  const selectedSharedOrganizationId = currentSharedOrganizationId;
  const filteredSharedManagers = useMemo(() => {
    const q = sharedManagerSearch.trim().toLowerCase();

    if (q.length < 2) return [];

    return managers
      .filter((manager) =>
        formatManagerLabel(manager).toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [managers, sharedManagerSearch]);
  useEffect(() => {
    setSharedManagerSearch(sharedManager ? formatManagerLabel(sharedManager) : '');
  }, [sharedManager]);
  const hasCargoLegTripQuery = cargoLegForm.linked_trip_number.trim() !== '';
  const hasSegmentTripQuery = segmentForm.linked_trip_number.trim() !== '';
  const tripTabs: Array<{ id: TripTabId; label: string }> = [
    { id: 'information', label: 'Information' },
    { id: 'linked_order', label: 'Cargo' },
  ];

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="p-6 space-y-4">
        <button
          onClick={() => router.push('/app/trips')}
          className="inline-flex items-center gap-2 border px-4 py-2 rounded-md hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Back to Trips
        </button>

        <div className="rounded-2xl border bg-white p-6">
          <div className="text-lg font-semibold">Trip not found</div>
        </div>
      </div>
    );
  }

  const createdByBase =
    trip.created_by_user?.first_name || trip.created_by_user?.last_name
      ? `${trip.created_by_user?.first_name || ''} ${trip.created_by_user?.last_name || ''}`.trim()
      : '-';
  const createdBy = trip.workflow_contact_display || createdByBase;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <button
        onClick={() => router.push('/app/trips')}
        className="inline-flex items-center gap-2 border px-4 py-2 rounded-md hover:bg-slate-50"
      >
        <ArrowLeft size={16} />
        Back to Trips
      </button>

      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Truck className="h-6 w-6 text-slate-500" />
              <h1 className="text-3xl font-bold">{trip.trip_number}</h1>
            </div>

            <div>
              <span
                className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${getStatusBadgeClass(
                  trip.status
                )}`}
              >
                {getStatusLabel(trip.status)}
              </span>
            </div>

            <div className="text-sm text-slate-500">
              Created by <span className="font-medium text-slate-700">{createdBy}</span>
            </div>

            <div className="text-sm text-slate-500">
              Created at{' '}
              <span className="font-medium text-slate-700">
                {trip.created_at ? new Date(trip.created_at).toLocaleString() : '-'}
              </span>
            </div>

            <div className="text-sm text-slate-500">
              Updated at{' '}
              <span className="font-medium text-slate-700">
                {trip.updated_at ? new Date(trip.updated_at).toLocaleString() : '-'}
              </span>
            </div>

            <div className="text-sm text-slate-500">
              Order draft{' '}
              <span className="font-medium text-slate-700">
                {orderDraft?.exists ? 'Saved' : 'Not created'}
              </span>
            </div>

            {trip.workflow_trip_vehicle_display ? (
              <div className="text-sm text-slate-500">
                Trip / Vehicle{' '}
                <span className="font-medium text-slate-700 break-all">
                  {trip.workflow_trip_vehicle_display}
                </span>
              </div>
            ) : null}

            {orderDraft?.exists && orderDraft?.updated_at && (
              <div className="text-sm text-slate-500">
                Order draft updated{' '}
                <span className="font-medium text-slate-700">
                  {new Date(orderDraft.updated_at).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {!editing && trip.can_view_financials ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={deleteTrip}
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
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/trips/create-order-html', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ tripId }),
                    });

                    if (!res.ok) {
                      const data = await res.json();
                      toast.error(data.error || 'Failed to create order');
                      return;
                    }

                    const html = await res.text();
                    const newWindow = window.open('', '_blank');

                    if (!newWindow) {
                      toast.error('Popup blocked');
                      return;
                    }

                    newWindow.document.open();
                    newWindow.document.write(html);
                    newWindow.document.close();
                  } catch (error) {
                    toast.error('Unexpected error');
                  }
                }}
                className="inline-flex items-center gap-2 border px-4 py-2 rounded-md hover:bg-slate-50"
              >
                {orderDraft?.exists ? 'Edit Order' : 'Create Order'}
              </button>

              <button
                onClick={() => {
                  setActiveTab('information');
                  setEditing(true);
                }}
                className="inline-flex items-center gap-2 border px-4 py-2 rounded-md hover:bg-slate-50"
              >
                <Pencil size={16} />
                Edit
              </button>
            </div>
          ) : editing ? (
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  try {
                    setSaving(true);

                    const payload = {
                      ...form,
                      shared_manager_user_id: form.is_groupage
                        ? form.groupage_responsible_manager_id
                        : form.shared_manager_user_id,
                      shared_organization_id: form.is_groupage
                        ? form.groupage_shared_organization_id
                        : form.shared_organization_id,
                      groupage_responsible_manager_id: form.is_groupage
                        ? form.groupage_responsible_manager_id
                        : null,
                      groupage_shared_organization_id: form.is_groupage
                        ? form.groupage_shared_organization_id
                        : null,
                      price: form.price === '' ? null : Number(form.price),
                      payment_term_days:
                        form.payment_term_days === ''
                          ? null
                          : Number(form.payment_term_days),
                    };

                    const res = await fetch('/api/trips/update', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    });

                    const data = await res.json();

                    if (!res.ok) {
                      toast.error(data.error || 'Failed to update trip');
                      return;
                    }

                    toast.success('Trip updated');
                    setEditing(false);
                    await fetchTrip();
                  } catch (error) {
                    toast.error('Unexpected error');
                  } finally {
                    setSaving(false);
                  }
                }}
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
                onClick={() => {
                  setEditing(false);
                  if (trip) {
                    setForm({
                      id: trip.id,
                      status: trip.status,
                      shared_manager_user_id: currentSharedManagerUserId,
                      shared_organization_id: currentSharedOrganizationId,
                      groupage_responsible_manager_id:
                        trip.is_groupage &&
                        (trip.groupage_responsible_manager_id || currentSharedManagerUserId)
                          ? trip.groupage_responsible_manager_id || currentSharedManagerUserId
                          : '',
                      groupage_shared_organization_id: currentSharedOrganizationId,
                      carrier_company_id: trip.carrier_company_id ?? '',
                      truck_plate: trip.truck_plate ?? '',
                      trailer_plate: trip.trailer_plate ?? '',
                      driver_name: trip.driver_name ?? '',
                      price:
                        trip.price !== null && trip.price !== undefined
                          ? String(trip.price)
                          : '',
                      payment_term_days:
                        trip.payment_term_days !== null &&
                        trip.payment_term_days !== undefined
                          ? String(trip.payment_term_days)
                          : '',
                      payment_type: trip.payment_type ?? '',
                      vat_rate: trip.vat_rate ?? '',
                      notes: trip.notes ?? '',
                      is_groupage: !!trip.is_groupage,
                    });

                    setGroupageManagerSearch(
                      trip.is_groupage && trip.groupage_manager
                        ? formatManagerLabel(trip.groupage_manager)
                        : ''
                    );

                    setCarrierSearch(
                      trip.carrier
                        ? `${trip.carrier.name}${trip.carrier.company_code ? ` (${trip.carrier.company_code})` : ''}`
                        : ''
                    );
                  }
                }}
                disabled={saving}
                className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          {tripTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={
                activeTab === tab.id
                  ? 'rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white'
                  : 'rounded-md border px-3 py-2 text-sm hover:bg-slate-50'
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'linked_order' && (
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <h2 className="text-center text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
          Cargo
        </h2>

        {editing ? (
          <div className="text-sm text-slate-500">
            Finish editing trip details before managing cargo.
          </div>
        ) : orderOptionsLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {linkedOrders.length > 0 ? (
              <div className="space-y-3">
                <div className="text-sm font-medium text-slate-700">
                  Linked Orders
                </div>

                {linkedOrders.map((orderRow) => (
                  <div
                    key={orderRow.link_id}
                    className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 xl:grid-cols-[minmax(0,180px)_minmax(0,1fr)_220px]"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 leading-tight">
                        {orderRow.internal_order_number}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {orderRow.status
                          ? orderRow.status.charAt(0).toUpperCase() + orderRow.status.slice(1)
                          : '-'}
                      </div>
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="truncate text-sm text-slate-700">
                        {orderRow.client?.name || '-'}
                        {orderRow.client?.company_code
                          ? ` (${orderRow.client.company_code})`
                          : ''}
                      </div>
                      <div className="truncate text-sm text-slate-500">
                        {[
                          orderRow.client_order_number
                            ? `Client: ${orderRow.client_order_number}`
                            : null,
                          trip.can_view_financials &&
                          orderRow.price !== null &&
                          orderRow.price !== undefined
                            ? `${orderRow.price} ${orderRow.currency || ''}`.trim()
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' / ') || '-'}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {[
                          formatLocationLine([
                            orderRow.loading_country,
                            orderRow.loading_city,
                            orderRow.loading_date,
                          ]),
                          formatLocationLine([
                            orderRow.unloading_country,
                            orderRow.unloading_city,
                            orderRow.unloading_date,
                          ]),
                        ].join(' -> ')}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {[
                          orderRow.cargo_description || null,
                          orderRow.cargo_quantity ? `${orderRow.cargo_quantity} QTY` : null,
                          orderRow.cargo_kg !== null && orderRow.cargo_kg !== undefined
                            ? `${orderRow.cargo_kg} KG`
                            : null,
                          orderRow.cargo_ldm !== null && orderRow.cargo_ldm !== undefined
                            ? `${orderRow.cargo_ldm} LDM`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' / ') || '-'}
                      </div>
                      {(() => {
                        const routeSummary = formatLinkedOrderRouteSummary(
                          orderRow,
                          trip.id
                        );

                        if (!routeSummary) {
                          return null;
                        }

                        return (
                          <>
                            <div className="truncate text-xs font-medium text-slate-700">
                              {routeSummary.title} / {routeSummary.organization}
                            </div>
                            <div className="truncate text-xs text-slate-500">
                              {routeSummary.address}
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    <div className="flex items-center justify-start gap-2 xl:justify-end">
                      <button
                        type="button"
                        onClick={() => router.push(`/app/orders/${orderRow.order_id}`)}
                        className="border rounded-md px-3 py-1.5 text-sm hover:bg-white"
                      >
                        Open Order
                      </button>
                      <button
                        type="button"
                        onClick={() => unlinkOrder(orderRow.order_id)}
                        disabled={orderActionLoadingId === orderRow.order_id}
                        className="border rounded-md px-3 py-1.5 text-sm hover:bg-white disabled:opacity-50"
                      >
                        {orderActionLoadingId === orderRow.order_id ? 'Removing...' : 'Unlink'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-center text-sm text-slate-500">
                No orders linked yet.
              </div>
            )}

            <div className="space-y-3 border-t pt-3">
              <div className="text-sm font-medium text-slate-700">Add Order</div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[180px_minmax(0,260px)_minmax(0,1fr)] xl:items-start">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-slate-500">
                    Organization
                  </div>
                  <select
                    value={selectedSharedOrganizationId}
                    onChange={(e) => {
                      const nextOrganizationId = e.target.value;
                      setCurrentSharedOrganizationId(nextOrganizationId);
                      update('shared_organization_id', nextOrganizationId);
                      update('shared_manager_user_id', '');
                      setSharedManagerSearch('');
                      setShowSharedManagerDropdown(false);
                    }}
                    className="w-full rounded-md border bg-slate-50 px-3 py-2 text-sm"
                  >
                    <option value="">Select organization</option>
                    {organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                    <div className="text-xs font-medium text-slate-500">
                      {trip.is_groupage
                        ? 'Link groupage to organization and manager'
                        : 'Link trip to organization and manager'}
                    </div>
                  <div
                    className="space-y-2"
                    onBlurCapture={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        window.setTimeout(() => setShowSharedManagerDropdown(false), 0);
                      }
                    }}
                  >
                    <input
                      value={sharedManagerSearch}
                      onFocus={() => setShowSharedManagerDropdown(true)}
                      onClick={() => setShowSharedManagerDropdown(true)}
                      onChange={(e) => {
                        update('shared_manager_user_id', '');
                        update('shared_organization_id', selectedSharedOrganizationId);
                        setSharedManagerSearch(e.target.value);
                        setShowSharedManagerDropdown(true);
                      }}
                      placeholder="Type manager name..."
                      className="w-full rounded-md border px-3 py-2"
                      disabled={
                        !selectedSharedOrganizationId ||
                        managersLoading ||
                        savingSharedManager
                      }
                    />

                    {showSharedManagerDropdown &&
                    (sharedManagerSearch.trim() === '' ||
                      (sharedManagerSearch.trim().length >= 2 &&
                        sharedManagerSearch !== selectedSharedManagerLabel)) ? (
                      <div className="max-h-56 overflow-y-auto rounded-md border bg-white">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setShowSharedManagerDropdown(false);
                            update('shared_manager_user_id', '');
                            update('shared_organization_id', selectedSharedOrganizationId);
                            setSharedManagerSearch('');
                            void saveSharedManager('');
                          }}
                      className="w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      -
                    </button>
                        {sharedManagerSearch.trim().length >= 2 ? (
                          filteredSharedManagers.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-slate-500">
                              No managers found
                            </div>
                          ) : (
                            filteredSharedManagers.map((manager) => (
                            <button
                              key={manager.id}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                const nextValue = manager.id;
                                update('shared_manager_user_id', nextValue);
                                update('shared_organization_id', selectedSharedOrganizationId);
                                setSharedManagerSearch(formatManagerLabel(manager));
                                setShowSharedManagerDropdown(false);
                                void saveSharedManager(nextValue);
                              }}
                              className="w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50 last:border-b-0"
                            >
                              {formatManagerLabel(manager)}
                            </button>
                            ))
                          )
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-medium text-slate-500">Order number</div>
                  <div
                  className="relative"
                  onBlurCapture={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                      window.setTimeout(() => setShowOrderOptionsDropdown(false), 0);
                    }
                  }}
                >
                  <input
                    placeholder="ORD-000001"
                    value={orderSearch}
                    onFocus={() => setShowOrderOptionsDropdown(true)}
                    onClick={() => setShowOrderOptionsDropdown(true)}
                    onChange={(e) => {
                      setOrderSearch(e.target.value);
                      setShowOrderOptionsDropdown(true);
                    }}
                    className="w-full rounded-md border px-3 py-2"
                  />

                  {showOrderOptionsDropdown ? (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-md border bg-white shadow-sm">
                      {orderOptionsLoading ? (
                        <div className="flex justify-center py-3">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      ) : availableOrders.length > 0 ? (
                        availableOrders.map((availableOrder) => (
                          <div
                            key={availableOrder.id}
                            className="border-b px-3 py-3 last:border-b-0"
                          >
                            <div className="font-medium text-sm text-slate-900">
                              {availableOrder.internal_order_number}
                            </div>
                            <div className="truncate text-xs text-slate-500">
                              {availableOrder.client?.name || '-'}
                              {availableOrder.client?.company_code
                                ? ` (${availableOrder.client.company_code})`
                                : ''}
                            </div>
                            <div className="truncate text-xs text-slate-500">
                              {[
                                availableOrder.client_order_number
                                  ? `Client: ${availableOrder.client_order_number}`
                                  : null,
                                trip.can_view_financials &&
                                availableOrder.price !== null &&
                                availableOrder.price !== undefined
                                  ? `${availableOrder.price} ${availableOrder.currency || ''}`.trim()
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' / ') || '-'}
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setShowOrderOptionsDropdown(false);
                                  router.push(`/app/orders/${availableOrder.id}`);
                                }}
                                className="border rounded-md px-3 py-1.5 text-xs hover:bg-slate-50"
                              >
                                Open Order
                              </button>
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setShowOrderOptionsDropdown(false);
                                  void linkOrder(availableOrder.id);
                                }}
                                disabled={orderActionLoadingId === availableOrder.id}
                                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
                              >
                                {orderActionLoadingId === availableOrder.id
                                  ? 'Linking...'
                                  : 'Add Order'}
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-3 text-sm text-slate-500">
                          {missingTripSharedManager
                              ? trip.is_groupage
                                ? 'First save linked groupage organization and manager.'
                                : 'First save linked organization and manager.'
                            : awaitingOrderNumber
                              ? 'Enter full order number.'
                              : 'Order not found or not shown to this manager.'}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {activeTab === 'information' && (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border bg-white p-6 space-y-4">
          <h2 className="text-xl font-semibold">Trip Information</h2>

          {!editing ? (
            <div className="grid grid-cols-1 gap-4 text-sm">
              <div>
                <div className="text-slate-500">Carrier</div>
                <div className="font-medium">
                  {trip.carrier?.name || '-'}
                  {trip.carrier?.company_code ? ` (${trip.carrier.company_code})` : ''}
                </div>
              </div>

              <div>
                <div className="text-slate-500">Status</div>
                <div className="font-medium">{getStatusLabel(trip.status)}</div>
              </div>

              {!trip.is_groupage && (
                <div>
                  <div className="text-slate-500">Shown to manager</div>
                  <div className="font-medium">{formatManagerLabel(sharedManager)}</div>
                </div>
              )}

              {trip.workflow_trip_vehicle_display ? (
                <div>
                  <div className="text-slate-500">Trip / Vehicle</div>
                  <div className="font-medium break-all">
                    {trip.workflow_trip_vehicle_display}
                  </div>
                </div>
              ) : null}

              <div>
                <div className="text-slate-500">Driver</div>
                <div className="font-medium">{trip.driver_name || '-'}</div>
              </div>

              <div>
                <div className="text-slate-500">Truck plate</div>
                <div className="font-medium">{trip.truck_plate || '-'}</div>
              </div>

              <div>
                <div className="text-slate-500">Trailer plate</div>
                <div className="font-medium">{trip.trailer_plate || '-'}</div>
              </div>

              <div>
                <div className="text-slate-500">Groupage</div>
                <div className="font-medium">{trip.is_groupage ? 'Yes' : 'No'}</div>
              </div>

              {trip.is_groupage && (
                  <div>
                    <div className="text-slate-500">Groupage manager</div>
                  <div className="font-medium">
                    {formatManagerLabel(trip.groupage_manager)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 text-sm">
              <div className="space-y-2">
                <div className="text-slate-500 mb-1">Carrier</div>

                <input
                  placeholder="Start typing carrier name or code..."
                  value={carrierSearch}
                  onChange={(e) => setCarrierSearch(e.target.value)}
                  className="w-full border rounded-md px-3 py-2"
                  disabled={carriersLoading}
                />

                {carrierSearch.trim() !== '' && carrierSearch !== selectedCarrierLabel && (
                  <div className="border rounded-md bg-white max-h-56 overflow-y-auto">
                    {filteredCarriers.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-slate-500">
                        No carriers found
                      </div>
                    ) : (
                      filteredCarriers.map((carrier) => (
                        <button
                          key={carrier.id}
                          type="button"
                          onClick={() => {
                            update('carrier_company_id', carrier.id);
                            update(
                              'payment_term_days',
                              carrier.payment_term_days !== null &&
                                carrier.payment_term_days !== undefined
                                ? String(carrier.payment_term_days)
                                : ''
                            );
                            setCarrierSearch(
                              `${carrier.name}${carrier.company_code ? ` (${carrier.company_code})` : ''}`
                            );
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b last:border-b-0"
                        >
                          {carrier.name}
                          {carrier.company_code ? ` (${carrier.company_code})` : ''}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div>
                <div className="text-slate-500 mb-1">Status</div>
                <select
                  value={form.status}
                  onChange={(e) => update('status', e.target.value)}
                  className="w-full border rounded-md px-3 py-2"
                >
                  <option value="unconfirmed">Unconfirmed</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              {!form.is_groupage && (
                <div className="space-y-2">
                  <div className="text-slate-500 mb-1">Link trip to organization and manager</div>
                  <select
                    value={selectedSharedOrganizationId}
                    onChange={(e) => {
                      const nextOrganizationId = e.target.value;
                      setCurrentSharedOrganizationId(nextOrganizationId);
                      update('shared_organization_id', nextOrganizationId);
                      update('shared_manager_user_id', '');
                      setSharedManagerSearch('');
                    }}
                    className="w-full border rounded-md px-3 py-2 bg-slate-50"
                  >
                    <option value="">Select organization</option>
                    {organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={sharedManagerSearch}
                    onChange={(e) => {
                      update('shared_manager_user_id', '');
                      update('shared_organization_id', selectedSharedOrganizationId);
                      setSharedManagerSearch(e.target.value);
                    }}
                    placeholder="Type manager name..."
                    className="w-full border rounded-md px-3 py-2"
                    disabled={!selectedSharedOrganizationId || managersLoading}
                  />

                  {sharedManagerSearch.trim().length >= 2 &&
                    sharedManagerSearch !== selectedSharedManagerLabel && (
                      <div className="border rounded-md bg-white max-h-56 overflow-y-auto">
                        {filteredSharedManagers.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-slate-500">
                            No managers found
                          </div>
                        ) : (
                          filteredSharedManagers.map((manager) => (
                            <button
                              key={manager.id}
                              type="button"
                              onClick={() => {
                                update('shared_manager_user_id', manager.id);
                                update('shared_organization_id', selectedSharedOrganizationId);
                                setSharedManagerSearch(formatManagerLabel(manager));
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
              )}

              <div>
                <div className="text-slate-500 mb-1">Driver</div>
                <input
                  value={form.driver_name}
                  onChange={(e) => update('driver_name', e.target.value)}
                  className="w-full border rounded-md px-3 py-2"
                />
              </div>

              <div>
                <div className="text-slate-500 mb-1">Truck plate</div>
                <input
                  value={form.truck_plate}
                  onChange={(e) => update('truck_plate', e.target.value)}
                  className="w-full border rounded-md px-3 py-2"
                />
              </div>

              <div>
                <div className="text-slate-500 mb-1">Trailer plate</div>
                <input
                  value={form.trailer_plate}
                  onChange={(e) => update('trailer_plate', e.target.value)}
                  className="w-full border rounded-md px-3 py-2"
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_groupage}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    update('is_groupage', checked);

                    if (!checked) {
                      update('groupage_responsible_manager_id', '');
                      setGroupageManagerSearch('');
                    }
                  }}
                />
                Groupage trip
              </label>

              {form.is_groupage && (
                <div className="space-y-2">
                  <div className="text-slate-500 mb-1">Link groupage to organization and manager</div>
                  <select
                    value={form.groupage_shared_organization_id || selectedSharedOrganizationId}
                    onChange={(e) => {
                      const nextOrganizationId = e.target.value;
                      setCurrentSharedOrganizationId(nextOrganizationId);
                      update('groupage_shared_organization_id', nextOrganizationId);
                      update('groupage_responsible_manager_id', '');
                      setGroupageManagerSearch('');
                    }}
                    className="w-full border rounded-md px-3 py-2 bg-slate-50"
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
                    value={groupageManagerSearch}
                    onChange={(e) => {
                      update('groupage_responsible_manager_id', '');
                      update(
                        'groupage_shared_organization_id',
                        form.groupage_shared_organization_id || selectedSharedOrganizationId
                      );
                      setGroupageManagerSearch(e.target.value);
                    }}
                    className="w-full border rounded-md px-3 py-2"
                    disabled={
                      !(form.groupage_shared_organization_id || selectedSharedOrganizationId) ||
                      managersLoading
                    }
                  />

                  {groupageManagerSearch.trim().length >= 2 &&
                    groupageManagerSearch !== selectedGroupageManagerLabel && (
                      <div className="border rounded-md bg-white max-h-56 overflow-y-auto">
                        {filteredGroupageManagers.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-slate-500">
                            No managers found
                          </div>
                        ) : (
                          filteredGroupageManagers.map((manager) => (
                            <button
                              key={manager.id}
                              type="button"
                              onClick={() => {
                                update('groupage_responsible_manager_id', manager.id);
                                update(
                                  'groupage_shared_organization_id',
                                  form.groupage_shared_organization_id ||
                                    selectedSharedOrganizationId
                                );
                                setGroupageManagerSearch(formatManagerLabel(manager));
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
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-6 space-y-4">
          <h2 className="text-xl font-semibold">Financial Information</h2>

          {!editing ? (
            <div className="grid grid-cols-1 gap-4 text-sm">
              <div>
                <div className="text-slate-500">Price</div>
                <div className="font-medium">
                  {trip.can_view_financials ? (
                    trip.price !== null && trip.price !== undefined
                      ? `${trip.price} EUR`
                      : '-'
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-slate-500">Payment term</div>
                <div className="font-medium">
                  {trip.can_view_financials ? (
                    trip.payment_term_days !== null &&
                    trip.payment_term_days !== undefined
                      ? `${trip.payment_term_days} days`
                      : '-'
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-slate-500">Payment type</div>
                <div className="font-medium">
                  {trip.can_view_financials ? (
                    formatPaymentTypeLabel(trip.payment_type)
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-slate-500">VAT</div>
                <div className="font-medium">
                  {trip.can_view_financials ? (
                    trip.vat_rate || '-'
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 text-sm">
              <div>
                <div className="text-slate-500 mb-1">Price</div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => update('price', e.target.value)}
                  className="w-full border rounded-md px-3 py-2"
                />
              </div>

              <div>
                <div className="text-slate-500 mb-1">Payment term</div>
                <input
                  type="number"
                  min="0"
                  value={form.payment_term_days}
                  onChange={(e) => update('payment_term_days', e.target.value)}
                  className="w-full border rounded-md px-3 py-2"
                />
              </div>

              <div>
                <div className="text-slate-500 mb-1">Payment type</div>
                <select
                  value={form.payment_type}
                  onChange={(e) => update('payment_type', e.target.value)}
                  className="w-full border rounded-md px-3 py-2"
                >
                  <option value="">Select payment type</option>
                  {PAYMENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-slate-500 mb-1">VAT</div>
                <select
                  value={form.vat_rate}
                  onChange={(e) => update('vat_rate', e.target.value)}
                  className="w-full border rounded-md px-3 py-2"
                >
                  <option value="">Select VAT</option>
                  <option value="21%">21%</option>
                  <option value="0%">0%</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-6 space-y-4">
        <h2 className="text-xl font-semibold">Notes</h2>

        {!editing ? (
          <div className="text-sm text-slate-700 whitespace-pre-wrap">
            {trip.notes || '-'}
          </div>
        ) : (
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Notes"
            className="w-full min-h-[120px] border rounded-md px-3 py-2"
          />
        )}
      </div>
      </>
      )}

      {activeTab === 'segments' && (
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-center text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
            Trip Legs
          </h2>

          {!editing && (
            <button
              type="button"
              onClick={openNewSegmentEditor}
              className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
            >
              Add Trip
            </button>
          )}
        </div>

        {editing ? (
          <div className="text-sm text-slate-500">
            Finish editing trip details before managing trip legs.
          </div>
        ) : (
          <>
            {segmentEditorOpen && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                <div className="grid grid-cols-1 xl:grid-cols-[84px_220px_minmax(0,1fr)_auto] gap-3 items-end">
                  <div>
                    <label className="block text-sm font-medium mb-1">#</label>
                    <input
                      type="number"
                      min="1"
                      value={segmentForm.segment_order}
                      onChange={(e) =>
                        setSegmentForm((prev) => ({
                          ...prev,
                          segment_order: e.target.value,
                        }))
                      }
                      className="w-full border rounded-md px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Type</label>
                    <select
                      value={segmentForm.segment_type}
                      onChange={(e) =>
                        setSegmentForm((prev) => ({
                          ...prev,
                          segment_type: e.target.value as TripSegmentType,
                        }))
                      }
                      className="w-full border rounded-md px-3 py-2"
                    >
                      {TRIP_SEGMENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {formatTripSegmentTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Trip number</label>
                    <input
                      placeholder="TR-000004"
                      value={segmentForm.linked_trip_number}
                      onChange={(e) =>
                        setSegmentForm((prev) => ({
                          ...prev,
                          linked_trip_number: e.target.value.toUpperCase(),
                        }))
                      }
                      className="w-full border rounded-md px-3 py-2"
                    />
                  </div>

                  {!editingSegmentId && (
                    <button
                      type="button"
                      onClick={createLinkedTrip}
                      disabled={creatingLinkedTrip || segmentSaving}
                      className="rounded-md border px-3 py-2 text-sm hover:bg-white disabled:opacity-50"
                    >
                      {creatingLinkedTrip ? 'Creating...' : 'Create Trip'}
                    </button>
                  )}
                </div>

                {matchedSegmentTrip ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">
                        {matchedSegmentTrip.trip_number}
                      </div>
                      <div className="text-sm text-slate-600 truncate">
                        {formatSegmentTripMeta(matchedSegmentTrip)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => router.push(`/app/trips/${matchedSegmentTrip.id}`)}
                      className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      Open Trip
                    </button>
                  </div>
                ) : segmentLookupLoading ? (
                  <div className="flex justify-center py-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : hasSegmentTripQuery && segmentLookupMessage ? (
                  <div className="rounded-xl border border-dashed p-3 text-center text-sm text-slate-500">
                    {segmentLookupMessage}
                  </div>
                ) : null}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveSegment}
                    disabled={segmentSaving || !matchedSegmentTrip}
                    className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {segmentSaving
                      ? editingSegmentId
                        ? 'Saving...'
                        : 'Creating...'
                      : editingSegmentId
                        ? 'Save'
                        : 'Save'}
                  </button>

                  <button
                    type="button"
                    onClick={() => resetSegmentEditor()}
                    disabled={segmentSaving}
                    className="rounded-md border px-3 py-2 text-sm hover:bg-white disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {segmentsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : segments.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-center text-sm text-slate-500">
                No trip legs added yet.
              </div>
            ) : (
              <div className="space-y-3">
                {segments.map((segment) => (
                  <div
                    key={segment.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <div className="font-semibold text-slate-900">
                          {formatTripSegmentTypeLabel(segment.segment_type)} #{segment.segment_order}
                        </div>

                        <div className="text-sm text-slate-700">
                          {segment.linked_trip?.trip_number || 'Trip not selected yet'}
                        </div>

                        <div className="text-sm text-slate-700">
                          {formatSegmentTripMeta(segment.linked_trip)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {segment.linked_trip && (
                          <button
                            type="button"
                            onClick={() => router.push(`/app/trips/${segment.linked_trip!.id}`)}
                            className="rounded-md border px-3 py-2 text-sm hover:bg-white"
                          >
                            Open Trip
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openExistingSegmentEditor(segment)}
                          className="rounded-md border px-3 py-2 text-sm hover:bg-white"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSegment(segment.id)}
                          disabled={segmentDeletingId === segment.id}
                          className="rounded-md border px-3 py-2 text-sm hover:bg-white disabled:opacity-50"
                        >
                          {segmentDeletingId === segment.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
}
