import { randomInt } from "node:crypto";

// Leaves out letters and digits that are easy to confuse: O/0 and I/1
const CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CHARACTERS[randomInt(CHARACTERS.length)];
  }
  return code;
}
