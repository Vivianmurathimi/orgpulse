// Adds the demo rules to Grace Church. Run with: npm run seed -w rules-service
// The auth service must be running and seeded first, because the member IDs
// come from it. Safe to run again: rules are updated, not duplicated.
//
// Cleaning is on Mondays. A demo on any other day would have no cleaning duty, so
//   npm run seed -w rules-service -- --cleaning-today
// moves it to today's weekday, late in the evening so it isn't overdue straight away.
import { getMembers, getOrgs } from "./lib/authClient";
import { toDate, todayIn } from "./lib/dates";
import { prisma } from "./lib/prisma";

const cleaningToday = process.argv.includes("--cleaning-today");

async function saveRule(
  orgId: string,
  title: string,
  data: Omit<Parameters<typeof prisma.rule.create>[0]["data"], "orgId" | "title" | "createdBy">,
  createdBy: string,
) {
  const existing = await prisma.rule.findFirst({ where: { orgId, title } });
  const fields = { ...data, orgId, title, createdBy };

  return existing
    ? prisma.rule.update({ where: { id: existing.id }, data: fields })
    : prisma.rule.create({ data: fields });
}

async function main() {
  const org = (await getOrgs()).find(({ name }) => name === "Grace Church");
  if (!org) {
    throw new Error('Grace Church not found. Run "npm run seed -w auth-service" first.');
  }

  const members = await getMembers(org.id);
  const admin = members.find((member) => member.role === "ADMIN");
  if (!admin) {
    throw new Error("Grace Church has no admin");
  }

  const idOf = (name: string) => {
    const member = members.find((item) => item.name === name);
    if (!member) throw new Error(`Member ${name} not found`);
    return member.userId;
  };

  const today = todayIn(org.timezone);
  const startDate = toDate(today);

  const birthdays = await saveRule(
    org.id,
    "Member birthdays",
    {
      type: "BIRTHDAY",
      description: "Announce each member's birthday to the whole organisation",
      frequency: "DAILY",
      timeOfDay: "08:00",
      startDate,
    },
    admin.userId,
  );

  const cleaning = await saveRule(
    org.id,
    "Church cleaning",
    {
      type: "ROTATION",
      description: "Weekly cleaning duty, one person each week",
      frequency: "WEEKLY",
      dayOfWeek: cleaningToday ? toDate(today).getUTCDay() : 1, // 1 = Monday
      timeOfDay: cleaningToday ? "23:00" : "08:00",
      startDate,
    },
    admin.userId,
  );

  const rotation = ["Grace", "John", "Mary", "Peter", "Ruth"];
  await prisma.$transaction([
    prisma.rotationSlot.deleteMany({ where: { ruleId: cleaning.id } }),
    prisma.rotationSlot.createMany({
      data: rotation.map((name, position) => ({
        ruleId: cleaning.id,
        memberId: idOf(name),
        position,
      })),
    }),
  ]);

  const choir = await saveRule(
    org.id,
    "Choir practice",
    {
      type: "TASK",
      description: "Friday evening practice",
      frequency: "WEEKLY",
      dayOfWeek: 5, // Friday
      timeOfDay: "18:00",
      startDate,
      assigneeIds: ["Grace", "Mary", "Ruth"].map(idOf),
      reminderHoursBefore: 24,
    },
    admin.userId,
  );

  console.log(`\nRules for ${org.name}:`);
  console.log(`  ${birthdays.title}  id=${birthdays.id}`);
  console.log(`  ${cleaning.title}  id=${cleaning.id}  rotation: ${rotation.join(" > ")}`);
  console.log(`  ${choir.title}  id=${choir.id}`);
  if (cleaningToday) {
    console.log("\nCleaning moved to today's weekday at 23:00, for the demo.");
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
