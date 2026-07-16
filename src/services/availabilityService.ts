import * as propertyService from "./propertyService.js";
import * as viewingRepository from "../repositories/viewingRepository.js";
import type { AvailabilityQuery } from "../schemas/availability.js";

// 営業時間はJST固定の10:00〜18:00（1時間刻み・1日8枠）。
// スロット専用のテーブルは持たず、「営業時間内の枠のうち、予約中(scheduled)の内見と
// 重複しない時間帯を空きとする」計算方式で導出する
const JST_OFFSET = "+09:00";
const OPENING_HOUR = 10;
const CLOSING_HOUR = 18;
const SLOT_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Requester = { agentId: number; role: "agent" | "admin" } | null;

export async function getAvailability(
  propertyId: number,
  query: AvailabilityQuery,
  requester: Requester,
) {
  // 可視性ルールはGET /properties/:idと同一（存在しない・非公開の物件は404を投げる）
  await propertyService.getById(propertyId, requester);

  // 期間全体の予約中内見を1クエリでまとめて取得してから、日ごとのスロットに割り当てる
  const rangeStart = new Date(`${query.from}T${pad(OPENING_HOUR)}:00:00${JST_OFFSET}`);
  const rangeEnd = new Date(`${query.to}T${pad(CLOSING_HOUR)}:00:00${JST_OFFSET}`);
  const scheduledAts = await viewingRepository.findScheduledAtsByPropertyBetween(
    propertyId,
    rangeStart,
    rangeEnd,
  );

  const days = listDates(query.from, query.to).map((date) => ({
    date,
    slots: buildSlots(date, scheduledAts),
  }));

  return { propertyId, days };
}

// "YYYY-MM-DD"のfrom〜to（両端含む）を1日ずつ列挙する
function listDates(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let time = Date.parse(from); time <= Date.parse(to); time += DAY_MS) {
    dates.push(new Date(time).toISOString().slice(0, 10));
  }
  return dates;
}

function buildSlots(date: string, scheduledAts: Date[]) {
  const slots = [];

  for (let hour = OPENING_HOUR; hour < CLOSING_HOUR; hour++) {
    const startAt = `${date}T${pad(hour)}:00:00${JST_OFFSET}`;
    const slotStart = Date.parse(startAt);
    const slotEnd = slotStart + SLOT_MS;

    // 予約中の内見日時がこの枠の時間帯[slotStart, slotEnd)に1件でも入っていたら埋まり
    const available = !scheduledAts.some((at) => {
      const time = at.getTime();
      return time >= slotStart && time < slotEnd;
    });

    slots.push({ startAt, available });
  }

  return slots;
}

function pad(hour: number) {
  return String(hour).padStart(2, "0");
}
