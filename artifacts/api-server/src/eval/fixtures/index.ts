import { muzamilFixture } from "./muzamil";
import {
  founderArchetypeFixture,
  operatorArchetypeFixture,
  creatorArchetypeFixture,
} from "./synthetic";
import type { Fixture } from "./types";

export const ALL_FIXTURES: Fixture[] = [
  muzamilFixture,
  founderArchetypeFixture,
  operatorArchetypeFixture,
  creatorArchetypeFixture,
];

export function getFixture(id: string): Fixture {
  const f = ALL_FIXTURES.find((f) => f.id === id);
  if (!f) throw new Error(`Unknown fixture: ${id}`);
  return f;
}

export type { Fixture } from "./types";
export { muzamilFixture, founderArchetypeFixture, operatorArchetypeFixture, creatorArchetypeFixture };
