// Creates the demo organisation "Grace Church". Run with: npm run seed -w auth-service
// Safe to run again: existing records are updated, and IDs stay the same.
import bcrypt from "bcryptjs";
import { formatDate, toDate, todayIn } from "./lib/dates";
import { prisma } from "./lib/prisma";

const TIMEZONE = "Europe/Budapest";
const PASSWORD = "password123";

// A date `daysFromToday` after today, in the year 2000 (a leap year, so 29 Feb is
// valid). Only the month and day of a birthday matter.
function birthdayFromToday(daysFromToday: number): Date {
  const [, month, day] = todayIn(TIMEZONE).split("-");
  const date = toDate(`2000-${month}-${day}`);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date;
}

// Grace's birthday is always today, for the demo. Nobody else's ever is.
const people = [
  { email: "admin@grace.test", name: "Admin", role: "ADMIN", birthday: birthdayFromToday(100) },
  { email: "grace@grace.test", name: "Grace", role: "MEMBER", birthday: birthdayFromToday(0) },
  { email: "john@grace.test", name: "John", role: "MEMBER", birthday: birthdayFromToday(40) },
  { email: "mary@grace.test", name: "Mary", role: "MEMBER", birthday: birthdayFromToday(80) },
  { email: "peter@grace.test", name: "Peter", role: "MEMBER", birthday: birthdayFromToday(120) },
  { email: "ruth@grace.test", name: "Ruth", role: "MEMBER", birthday: birthdayFromToday(160) },
] as const;

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const org = await prisma.organisation.upsert({
    where: { inviteCode: "GRACE1" },
    update: { name: "Grace Church", timezone: TIMEZONE },
    create: { name: "Grace Church", inviteCode: "GRACE1", timezone: TIMEZONE },
  });

  console.log(`\nOrganisation: ${org.name}  id=${org.id}  invite code=${org.inviteCode}\n`);

  for (const { email, name, role, birthday } of people) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, passwordHash, birthday, showBirthday: true },
      create: { email, name, passwordHash, birthday },
    });

    const membership = await prisma.membership.upsert({
      where: { userId_orgId: { userId: user.id, orgId: org.id } },
      update: { role },
      create: { userId: user.id, orgId: org.id, role },
    });

    console.log(
      `${name.padEnd(6)} ${role.padEnd(6)} ${email.padEnd(17)} ` +
        `birthday=${formatDate(birthday).slice(5)}  userId=${user.id}  membershipId=${membership.id}`,
    );
  }

  console.log(`\nEvery account uses the password: ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
