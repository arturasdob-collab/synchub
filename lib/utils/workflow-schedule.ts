export type WorkflowScheduleValue = {
  date: string | null;
  time_from: string | null;
  time_to: string | null;
};

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeDate(value: unknown) {
  const normalized = normalizeText(value);

  if (normalized === null) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeTime(value: unknown) {
  const normalized = normalizeText(value);

  if (normalized === null) {
    return null;
  }

  const match = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function buildWorkflowScheduleValue(params: {
  date: unknown;
  time_from?: unknown;
  time_to?: unknown;
  timeFrom?: unknown;
  timeTo?: unknown;
}): WorkflowScheduleValue | null {
  const date = normalizeDate(params.date);
  const timeFrom = normalizeTime(params.time_from ?? params.timeFrom);
  const timeTo = normalizeTime(params.time_to ?? params.timeTo);

  if (!date && !timeFrom && !timeTo) {
    return null;
  }

  return {
    date,
    time_from: timeFrom,
    time_to: timeTo,
  };
}

export function serializeWorkflowScheduleValue(
  value: WorkflowScheduleValue | null | undefined
) {
  if (!value || (!value.date && !value.time_from && !value.time_to)) {
    return null;
  }

  return JSON.stringify({
    date: value.date ?? null,
    time_from: value.time_from ?? null,
    time_to: value.time_to ?? null,
  });
}

export function parseWorkflowScheduleValueText(
  value: string | null | undefined
): WorkflowScheduleValue | null {
  if (!value || value.trim() === '') {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as
        | {
            date?: unknown;
            time_from?: unknown;
            time_to?: unknown;
            timeFrom?: unknown;
            timeTo?: unknown;
          }
        | null;

      return buildWorkflowScheduleValue({
        date: parsed?.date ?? null,
        time_from: parsed?.time_from ?? parsed?.timeFrom ?? null,
        time_to: parsed?.time_to ?? parsed?.timeTo ?? null,
      });
    } catch {
      return null;
    }
  }

  return buildWorkflowScheduleValue({
    date: trimmed,
  });
}

export function formatWorkflowScheduleSummary(
  schedule: WorkflowScheduleValue | null | undefined
) {
  if (!schedule) {
    return '-';
  }

  const date = normalizeDate(schedule.date);
  const timeFrom = normalizeTime(schedule.time_from);
  const timeTo = normalizeTime(schedule.time_to);

  if (!date && !timeFrom && !timeTo) {
    return '-';
  }

  if (date && timeFrom && timeTo) {
    return `${date} ${timeFrom}-${timeTo}`;
  }

  if (date && timeFrom) {
    return `${date} ${timeFrom}`;
  }

  if (date && timeTo) {
    return `${date} -${timeTo}`;
  }

  if (date) {
    return date;
  }

  if (timeFrom && timeTo) {
    return `${timeFrom}-${timeTo}`;
  }

  return timeFrom || timeTo || '-';
}
