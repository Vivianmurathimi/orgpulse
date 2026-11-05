import { dateIn, formatDate, timeIn, toDate } from "./lib/dates";
import { fireOnce } from "./lib/events";
import {
  addDays,
  isBirthdayOn,
  isUnavailableOn,
  occursOn,
  pickRotationMember,
  toInstant,
} from "./lib/occurrences";
import { prisma } from "./lib/prisma";
import {
  createTask,
  getActiveRules,
  getMembers,
  getOrgs,
  getPendingTasks,
  markOverdue,
  type Member,
  type Org,
  type Rule,
  type Task,
} from "./lib/services";

export interface Summary {
  birthdays: number;
  tasks: number;
  reminders: number;
  skipped: number; // occurrences that were already sent, finished or skipped by an admin
}

export interface RunOptions {
  // Set by the "Run scheduler" button: only this organisation, and right now.
  // Without it (the timer), every organisation runs and birthdays wait for their time.
  orgId?: string;
}

const HOUR_MS = 60 * 60 * 1000;

// The dates a rule needs a task for right now: today, plus any later occurrence
// whose reminder is due. A task must exist before its day for the reminder to work.
function datesToProcess(rule: Rule, today: string, now: Date, timezone: string): string[] {
  const dates = occursOn(rule, today) ? [today] : [];
  const hours = rule.reminderHoursBefore;
  if (!hours) return dates;

  for (let days = 1; days <= Math.ceil(hours / 24); days++) {
    const date = addDays(today, days);
    const dueAt = toInstant(date, rule.timeOfDay, timezone);
    if (occursOn(rule, date) && now.getTime() >= dueAt.getTime() - hours * HOUR_MS) {
      dates.push(date);
    }
  }
  return dates;
}

// Step 3: birthdays
async function runBirthdays(
  org: Org,
  rules: Rule[],
  members: Member[],
  now: Date,
  today: string,
  manual: boolean,
  summary: Summary,
) {
  // Birthdays are only announced while the organisation has an active birthday rule
  const rule = rules.find((item) => item.type === "BIRTHDAY" && occursOn(item, today));
  if (!rule) return;
  if (!manual && timeIn(org.timezone, now) < rule.timeOfDay) return;

  for (const member of members) {
    if (!member.showBirthday || !member.birthday || !isBirthdayOn(member.birthday, today)) {
      continue;
    }

    const sent = await fireOnce(`birthday:${member.userId}:${today}`, org.id, "due.birthday", {
      memberId: member.userId,
      memberName: member.name,
      date: today,
    });
    if (sent) summary.birthdays++;
    else summary.skipped++;
  }
}

// Step 4: whose turn is it? Returns the person, or nobody if everyone is away.
async function pickForRotation(rule: Rule, members: Member[], date: string): Promise<string[]> {
  const cursor = await prisma.rotationCursor.findUnique({ where: { ruleId: rule.id } });

  const picked = pickRotationMember(rule.rotation, cursor?.currentPosition ?? 0, (memberId) => {
    const member = members.find((item) => item.userId === memberId);
    return member !== undefined && !isUnavailableOn(member.unavailability, date);
  });
  return picked ? [picked] : [];
}

// The rotation moves on by exactly one for each occurrence, even if a stand-in did
// the duty. That keeps everyone's place in the order. lastAdvancedOn makes this safe
// to repeat, so a restart between two steps can't move it on twice.
async function advanceRotation(rule: Rule, date: string) {
  const cursor = await prisma.rotationCursor.findUnique({ where: { ruleId: rule.id } });
  if (cursor?.lastAdvancedOn && formatDate(cursor.lastAdvancedOn) === date) return;

  const nextPosition = ((cursor?.currentPosition ?? 0) + 1) % rule.rotation.length;
  await prisma.rotationCursor.upsert({
    where: { ruleId: rule.id },
    update: { currentPosition: nextPosition, lastAdvancedOn: toDate(date) },
    create: { ruleId: rule.id, currentPosition: nextPosition, lastAdvancedOn: toDate(date) },
  });
}

// Step 5: everyone a task rule applies to, leaving out people who have left
function assigneesForTask(rule: Rule, members: Member[]): string[] {
  return members
    .filter(
      (member) =>
        rule.assigneeIds.includes(member.userId) ||
        (rule.targetGroupId !== null && member.groupIds.includes(rule.targetGroupId)),
    )
    .map((member) => member.userId);
}

// Steps 4 and 5: make sure the task exists, and announce it on its day
async function runOccurrence(
  org: Org,
  rule: Rule,
  members: Member[],
  date: string,
  today: string,
  summary: Summary,
) {
  const assigneeIds =
    rule.type === "ROTATION"
      ? await pickForRotation(rule, members, date)
      : assigneesForTask(rule, members);

  const { task } = await createTask({
    ruleId: rule.id,
    orgId: org.id,
    title: rule.title,
    assigneeIds,
    dueAt: toInstant(date, rule.timeOfDay, org.timezone).toISOString(),
    occurrenceKey: `${rule.id}:${date}`,
  });

  if (task.status === "SKIPPED") {
    summary.skipped++;
    return;
  }
  if (rule.type === "ROTATION") {
    await advanceRotation(rule, date);
  }

  if (date === today) {
    await announce(task, rule, date, summary);
  }
}

async function announce(task: Task, rule: Rule, date: string, summary: Summary) {
  // Finished before its day, or already handled, so there is nothing to tell anyone
  if (task.status === "DONE") {
    summary.skipped++;
    return;
  }

  // The task's own assignees, because a swap may have changed them
  const sent = await fireOnce(`task:${rule.id}:${date}`, task.orgId, "due.task", {
    ruleId: rule.id,
    taskId: task.id,
    assigneeIds: task.assigneeIds,
    title: task.title,
    dueAt: task.dueAt,
  });
  if (sent) summary.tasks++;
  else summary.skipped++;
}

async function runOrganisation(
  org: Org,
  allRules: Rule[],
  now: Date,
  manual: boolean,
  summary: Summary,
) {
  // Step 2: "today" depends on where the organisation is
  const today = dateIn(org.timezone, now);
  const rules = allRules.filter((rule) => rule.orgId === org.id);
  const members = await getMembers(org.id);

  await runBirthdays(org, rules, members, now, today, manual, summary);

  for (const rule of rules) {
    if (rule.type === "BIRTHDAY") continue;
    if (rule.type === "ROTATION" && rule.rotation.length === 0) continue;

    for (const date of datesToProcess(rule, today, now, org.timezone)) {
      await runOccurrence(org, rule, members, date, today, summary);
    }
  }
}

// Step 6: remind people about pending tasks that are coming up
async function runReminders(rules: Rule[], orgIds: Set<string>, now: Date, summary: Summary) {
  const activeRuleIds = new Set(rules.map((rule) => rule.id));

  for (const task of await getPendingTasks()) {
    const hours = task.reminderHoursBefore;
    if (!hours || !orgIds.has(task.orgId) || !activeRuleIds.has(task.ruleId)) continue;
    if (task.assigneeIds.length === 0) continue;

    const dueAt = new Date(task.dueAt).getTime();
    if (now.getTime() < dueAt - hours * HOUR_MS || now.getTime() >= dueAt) continue;

    const sent = await fireOnce(`reminder:${task.occurrenceKey}`, task.orgId, "due.reminder", {
      taskId: task.id,
      assigneeIds: task.assigneeIds,
      title: task.title,
      dueAt: task.dueAt,
    });
    if (sent) summary.reminders++;
    else summary.skipped++;
  }
}

// One full pass. Every step is safe to repeat, so running this twice sends nothing twice.
export async function runScheduler(now: Date, options: RunOptions = {}): Promise<Summary> {
  const { orgId } = options;
  const manual = orgId !== undefined;
  const summary: Summary = { birthdays: 0, tasks: 0, reminders: 0, skipped: 0 };

  // Step 1: what do we need to look at?
  const orgs = (await getOrgs()).filter((org) => !orgId || org.id === orgId);
  const rules = await getActiveRules();

  for (const org of orgs) {
    try {
      await runOrganisation(org, rules, now, manual, summary);
    } catch (err) {
      // Someone pressing the button should see the error. On the timer, one
      // organisation's problem must not stop the others, and the next run retries.
      if (manual) throw err;
      console.error(`Scheduler run failed for organisation ${org.id}:`, err);
    }
  }

  await runReminders(rules, new Set(orgs.map((org) => org.id)), now, summary);

  // Step 7: anything past its time is now overdue
  await markOverdue(now);

  return summary;
}
