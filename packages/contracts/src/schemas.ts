import { z } from "zod";
import {
  CLUB_CATEGORIES,
  CLUB_MEMBERSHIP_POLICIES,
  CLUB_ROLES,
  EVENT_CATEGORIES,
  LIMITS,
  PROJECT_CATEGORIES,
  REPORT_TARGETS,
  TASK_STATUSES,
} from "./constants";

/* Reusable primitives ------------------------------------------------- */

const shortText = (min: number, max: number) =>
  z.string().trim().min(min, `Must be at least ${min} characters`).max(max, `Must be at most ${max} characters`);

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

const url = z
  .string()
  .trim()
  .max(600)
  .refine((value) => value === "" || /^https?:\/\/[^\s]+$/i.test(value), "Must be an http(s) URL")
  .optional()
  .nullable();

const email = z.string().trim().toLowerCase().email("Must be a valid email address").max(320);

const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Must be an ISO-8601 date/time");

const uuid = z.string().uuid("Must be a UUID");

const cursor = z.string().max(400).optional().nullable();

export const paginationQuery = z.strictObject({
  cursor,
  limit: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).optional(),
});

/* Auth ---------------------------------------------------------------- */

export const devLoginInput = z.strictObject({
  email,
  name: shortText(1, LIMITS.name).optional(),
});

export const sessionExchangeInput = z.strictObject({
  ticket: z.string().min(20).max(200),
});

/* Profile ------------------------------------------------------------- */

export const profileUpdateInput = z.strictObject({
  name: shortText(1, LIMITS.name),
  bio: optionalText(LIMITS.bio),
});

/* Clubs --------------------------------------------------------------- */

export const clubUpdateInput = z.strictObject({
  name: shortText(2, 120).optional(),
  tagline: optionalText(160),
  description: shortText(20, LIMITS.clubDescription).optional(),
  category: z.enum(CLUB_CATEGORIES).optional(),
  logoUrl: url,
  coverUrl: url,
  websiteUrl: url,
  contactEmail: z.union([email, z.literal("")]).optional().nullable(),
  instagramUrl: url,
  membershipPolicy: z.enum(CLUB_MEMBERSHIP_POLICIES).optional(),
});

export const clubJoinInput = z.strictObject({
  message: optionalText(LIMITS.applicationMessage),
});

export const clubMemberUpdateInput = z
  .strictObject({
    role: z.enum(CLUB_ROLES).optional(),
    status: z.enum(["active", "rejected"]).optional(),
  })
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    message: "Provide a role or a status",
  });

export const announcementInput = z.strictObject({
  title: shortText(3, 200),
  body: shortText(1, LIMITS.announcementBody),
  pinned: z.boolean().optional(),
});

/* Projects ------------------------------------------------------------ */

const projectFields = {
  title: shortText(3, 160),
  summary: shortText(20, 300),
  description: shortText(40, LIMITS.projectDescription),
  category: z.enum(PROJECT_CATEGORIES),
  goals: optionalText(2_000),
  expectedImpact: optionalText(2_000),
  timeline: optionalText(500),
  resources: optionalText(1_000),
  clubId: uuid.optional().nullable(),
  visibility: z.enum(["public", "members"]).optional(),
} as const;

export const projectRoleInput = z.strictObject({
  title: shortText(2, 100),
  description: optionalText(600),
  slots: z.number().int().min(1).max(20),
});

export const projectProposalInput = z.strictObject({
  ...projectFields,
  roles: z.array(projectRoleInput).max(8).optional(),
  submit: z.boolean().optional(),
});

export const projectUpdateInput = z
  .strictObject({
    title: projectFields.title.optional(),
    summary: projectFields.summary.optional(),
    description: projectFields.description.optional(),
    category: projectFields.category.optional(),
    goals: projectFields.goals,
    expectedImpact: projectFields.expectedImpact,
    timeline: projectFields.timeline,
    resources: projectFields.resources,
    clubId: projectFields.clubId,
    visibility: projectFields.visibility,
    submit: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "submit"), {
    message: "Nothing to update",
  });

export const projectApplicationInput = z.strictObject({
  roleId: uuid.optional().nullable(),
  message: shortText(10, LIMITS.applicationMessage),
});

export const applicationDecisionInput = z.strictObject({
  decision: z.enum(["accepted", "declined"]),
  note: optionalText(1_000),
});

export const projectDecisionInput = z
  .strictObject({
    decision: z.enum(["approve", "reject", "request_changes"]),
    notes: optionalText(2_000),
  })
  .superRefine((value, ctx) => {
    if (value.decision !== "approve" && (!value.notes || value.notes.length < 3)) {
      ctx.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Explain the decision so the proposer knows what to change",
      });
    }
  });

export const taskInput = z.strictObject({
  title: shortText(2, LIMITS.taskTitle),
  description: optionalText(2_000),
  status: z.enum(TASK_STATUSES).optional(),
  assigneeId: uuid.optional().nullable(),
  dueDate: isoDate.optional().nullable(),
});

export const taskUpdateInput = z.strictObject({
  title: shortText(2, LIMITS.taskTitle).optional(),
  description: optionalText(2_000),
  status: z.enum(TASK_STATUSES).optional(),
  assigneeId: uuid.optional().nullable(),
  dueDate: isoDate.optional().nullable(),
});

export const milestoneInput = z.strictObject({
  title: shortText(2, 160),
  description: optionalText(1_000),
  dueDate: isoDate.optional().nullable(),
});

export const milestoneUpdateInput = z.strictObject({
  completed: z.boolean().optional(),
  title: shortText(2, 160).optional(),
  dueDate: isoDate.optional().nullable(),
});

export const projectUpdatePostInput = z.strictObject({
  title: shortText(2, 160),
  body: shortText(10, LIMITS.updateBody),
});

export const projectMemberInput = z.strictObject({
  userId: uuid,
});

/* Events -------------------------------------------------------------- */

const eventFields = {
  title: shortText(3, 160),
  summary: shortText(20, 300),
  description: shortText(40, LIMITS.eventDescription),
  category: z.enum(EVENT_CATEGORIES),
  startsAt: isoDate,
  endsAt: isoDate,
  timezone: shortText(1, 64),
  venueName: optionalText(200),
  venueAddress: optionalText(300),
  onlineUrl: url,
  capacity: z.number().int().min(1).max(10_000).optional().nullable(),
  waitlistEnabled: z.boolean().optional(),
  accessibilityNotes: optionalText(1_500),
  contactEmail: z.union([email, z.literal("")]).optional().nullable(),
  clubId: uuid.optional().nullable(),
  coverUrl: url,
} as const;

export const eventProposalInput = z
  .strictObject({
    ...eventFields,
    submit: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end time must be after the start time" });
    }
    if (!value.onlineUrl && !value.venueName) {
      ctx.addIssue({
        code: "custom",
        path: ["venueName"],
        message: "Provide a venue or an online meeting link",
      });
    }
  });

export const eventUpdateInput = z
  .strictObject({
    title: eventFields.title.optional(),
    summary: eventFields.summary.optional(),
    description: eventFields.description.optional(),
    category: eventFields.category.optional(),
    startsAt: eventFields.startsAt.optional(),
    endsAt: eventFields.endsAt.optional(),
    timezone: eventFields.timezone.optional(),
    venueName: eventFields.venueName,
    venueAddress: eventFields.venueAddress,
    onlineUrl: eventFields.onlineUrl,
    capacity: eventFields.capacity,
    waitlistEnabled: eventFields.waitlistEnabled,
    accessibilityNotes: eventFields.accessibilityNotes,
    contactEmail: eventFields.contactEmail,
    clubId: eventFields.clubId,
    coverUrl: eventFields.coverUrl,
    submit: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "submit"), {
    message: "Nothing to update",
  });

export const eventDecisionInput = z
  .strictObject({
    decision: z.enum(["approve", "reject", "request_changes"]),
    notes: optionalText(2_000),
  })
  .superRefine((value, ctx) => {
    if (value.decision !== "approve" && (!value.notes || value.notes.length < 3)) {
      ctx.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Explain the decision so the organizer knows what to change",
      });
    }
  });

export const eventCancelInput = z.strictObject({
  reason: shortText(3, 500),
});

export const feedbackInput = z.strictObject({
  rating: z.number().int().min(1).max(5),
  comment: optionalText(LIMITS.feedbackComment),
});

export const checkInInput = z.strictObject({
  code: z.string().trim().min(6).max(40),
});

export const attendanceTokenInput = z.strictObject({
  expiresInMinutes: z.number().int().min(5).max(240).optional(),
});

export const eventRosterQuery = z.strictObject({
  status: z.enum(["registered", "waitlisted", "attended", "cancelled", "no_show"]).optional(),
});

/* Moderation ---------------------------------------------------------- */

export const moderationReportInput = z.strictObject({
  targetType: z.enum(REPORT_TARGETS),
  targetId: uuid,
  reason: shortText(3, 120),
  details: optionalText(LIMITS.reportDetails),
});

export const moderationResolveInput = z.strictObject({
  status: z.enum(["under_review", "resolved", "dismissed"]),
  notes: optionalText(LIMITS.reportDetails),
});

/* Admin --------------------------------------------------------------- */

export const adminRoleInput = z.strictObject({
  roles: z.array(z.enum(["moderator", "super_admin"])).max(2),
});

export const maintenanceInput = z.strictObject({
  enabled: z.boolean(),
  message: optionalText(500),
});

export const suspensionInput = z.strictObject({
  suspended: z.boolean(),
  reason: shortText(3, 500),
});

/* Queries ------------------------------------------------------------- */

export const searchQuery = z.strictObject({
  q: z.string().trim().min(1).max(LIMITS.searchQuery),
  type: z.enum(["all", "clubs", "projects", "events"]).optional(),
});

export const clubListQuery = z.strictObject({
  cursor,
  limit: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).optional(),
  category: z.enum(CLUB_CATEGORIES).optional(),
  q: z.string().trim().max(LIMITS.searchQuery).optional(),
});

export const projectListQuery = z.strictObject({
  cursor,
  limit: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).optional(),
  category: z.enum(PROJECT_CATEGORIES).optional(),
  q: z.string().trim().max(LIMITS.searchQuery).optional(),
  club: z.string().trim().max(120).optional(),
});

export const eventListQuery = z.strictObject({
  cursor,
  limit: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  q: z.string().trim().max(LIMITS.searchQuery).optional(),
  when: z.enum(["upcoming", "past", "all"]).optional(),
  club: z.string().trim().max(120).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuery>;
export type ClubListQuery = z.infer<typeof clubListQuery>;
export type ProjectListQuery = z.infer<typeof projectListQuery>;
export type EventListQuery = z.infer<typeof eventListQuery>;
export type ProjectProposalInput = z.infer<typeof projectProposalInput>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateInput>;
export type EventProposalInput = z.infer<typeof eventProposalInput>;
export type EventUpdateInput = z.infer<typeof eventUpdateInput>;
export type ClubUpdateInput = z.infer<typeof clubUpdateInput>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateInput>;
