export interface Connection {
  id: string;
  provider: string;
  displayName: string;
  status: string;
  lastSyncedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface ConnectionStatus {
  id: string;
  provider: string;
  status: string;
  errorMessage: string | null;
}

export interface OAuthConnectionResult {
  auth_url: string;
}

export interface CredentialConnectionResult {
  id: string;
  provider: string;
  status: string;
}

export interface UnifiedCalendar {
  id: string;
  userId: string;
  name: string;
  slug: string;
  timezone: string;
  isDefault: boolean;
  createdAt: string;
}

export interface CalendarSource {
  id: string;
  connectionId: string;
  sortOrder: number;
  provider?: string;
  displayName?: string;
  status?: string;
}

export interface CreateEventResult {
  remoteEventId: string;
  sourceId: string;
}

export interface CalendarEvent {
  id: string;
  connectionId: string;
  remoteEventId: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  status: string;
}

export interface CalendarEventDetail {
  remoteEventId: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  status: string;
}

export interface TimeSlot {
  start: string;
  end: string;
}

export interface AvailabilityResult {
  timezone: string;
  slots: TimeSlot[];
}

export interface ConflictPair {
  eventA: {
    id: string;
    connectionId: string;
    startTime: string;
    endTime: string;
    status: string;
  };
  eventB: {
    id: string;
    connectionId: string;
    startTime: string;
    endTime: string;
    status: string;
  };
}

export interface EventsResult {
  events: CalendarEvent[];
  limit: number;
  offset: number;
}

export interface EventDetailsResult {
  events: CalendarEventDetail[];
}

export interface ConflictsResult {
  conflicts: ConflictPair[];
}

export interface SlotsResult {
  slots: TimeSlot[];
  schedulingMode: string;
  timezone: string;
  durationOptions?: number[];
  visitorTimezone?: string;
  stakeholderCount?: number;
}

export interface Booking {
  id: string;
  bookingPageId: string;
  userId: string;
  visitorName: string;
  visitorEmail: string;
  visitorTimezone: string;
  startTime: string;
  endTime: string;
  status: string;
  notes: string | null;
  createdAt: string;
  cancelledAt: string | null;
}

export interface BookingsResult {
  bookings: Booking[];
  limit: number;
  offset: number;
}

export interface BookingCancelResult {
  id: string;
  status: string;
}

export interface Poll {
  id: string;
  userId: string;
  title: string;
  slug: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  durationMinutes: number;
  timezone: string;
  status: string;
  decidedTime: string | null;
  expiresAt: string;
  createdAt: string;
  pollUrl?: string;
  participants?: PollParticipant[];
}

export interface PollParticipant {
  id: string;
  email: string;
  name: string | null;
  status: string;
  respondedAt: string | null;
}

export interface PollOverlapResult {
  pollId: string;
  title: string;
  totalParticipants: number;
  respondedCount: number;
  pendingCount: number;
  slots: PollOverlapSlot[];
}

export interface PollOverlapSlot {
  start: string;
  end: string;
  overlapCount: number;
  totalParticipants: number;
  availableParticipants: string[];
  missingParticipants: string[];
}

export interface PollDecideResult {
  pollId: string;
  status: string;
  decidedTime: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
