import { describe, expect, it } from "vitest";
import { DAYS, generateTimeSlots, getSlotsForDay } from "./time";

describe("time tools", () => {
  it("generates 85 half-hour slots for Monday through Friday", () => {
    const slots = generateTimeSlots();
    expect(slots).toHaveLength(85);
    for (const day of DAYS) {
      expect(getSlotsForDay(slots, day.key)).toHaveLength(17);
    }
  });

  it("uses the expected default boundary slots", () => {
    const monday = getSlotsForDay(generateTimeSlots(), "mon");
    expect(monday[0]).toMatchObject({ start: "08:00", end: "08:30" });
    expect(monday.at(-1)).toMatchObject({ start: "16:00", end: "16:30" });
  });
});
