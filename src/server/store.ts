import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./errors";
import type { Room, RoomStore } from "./types";

export class MemoryStore implements RoomStore {
  kind = "local" as const;
  private rooms = new Map<string, Room>();
  private limits = new Map<string, { count: number; until: number }>();
  async create(room: Room) {
    if (this.rooms.has(room.code)) return false;
    this.rooms.set(room.code, structuredClone(room));
    return true;
  }
  async get(code: string) {
    const r = this.rooms.get(code);
    return r ? structuredClone(r) : null;
  }
  async update(code: string, mutate: (room: Room) => Room) {
    const current = this.rooms.get(code);
    if (!current)
      throw new ApiError(404, "Room not found. Check the invitation code.");
    const next = mutate(structuredClone(current));
    next.version = current.version + 1;
    this.rooms.set(code, structuredClone(next));
    return structuredClone(next);
  }
  async listActive() {
    for (const [code, r] of this.rooms)
      if (Date.now() - r.lastActivity > 86400000) this.rooms.delete(code);
    return [...this.rooms.keys()];
  }
  async rate(key: string, max: number, seconds: number) {
    const now = Date.now();
    for (const [key, v] of this.limits)
      if (v.until < now) this.limits.delete(key);
    const counter = this.limits.get(key) ?? {
      count: 0,
      until: now + seconds * 1000,
    };
    counter.count++;
    this.limits.set(key, counter);
    return counter.count <= max;
  }
}

export class SupabaseStore implements RoomStore {
  kind = "supabase" as const;
  readonly client: SupabaseClient;
  constructor(url: string, key: string) {
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  async create(room: Room) {
    const { data, error } = await this.client.rpc("summin_create_room", {
      p_code: room.code,
      p_id: room.id,
      p_state: room,
    });
    if (error)
      throw new ApiError(
        503,
        "Room storage is unavailable. Check server configuration.",
      );
    return Boolean(data);
  }
  async get(code: string): Promise<Room | null> {
    const { data, error } = await this.client
      .from("summin_rooms")
      .select("state")
      .eq("code", code)
      .maybeSingle();
    if (error) throw new ApiError(503, "Room storage is unavailable.");
    return (data?.state as Room | undefined) ?? null;
  }
  async update(code: string, mutate: (room: Room) => Room): Promise<Room> {
    for (let attempt = 0; attempt < 12; attempt++) {
      const current = await this.get(code);
      if (!current)
        throw new ApiError(404, "Room not found. Check the invitation code.");
      const next = mutate(structuredClone(current));
      next.version = current.version + 1;
      const { data, error } = await this.client.rpc("summin_commit_room", {
        p_code: code,
        p_expected_version: current.version,
        p_state: next,
      });
      if (error)
        throw new ApiError(
          503,
          "The room update could not be saved. Please reconnect.",
        );
      if (data) return next;
    }
    throw new ApiError(409, "The room is busy. Please try again.");
  }
  async listActive() {
    const { data, error } = await this.client
      .from("summin_rooms")
      .select("code")
      .gte("updated_at", new Date(Date.now() - 86400000).toISOString());
    if (error) throw new ApiError(503, "Room storage is unavailable.");
    return (data ?? []).map((r) => String(r.code));
  }
  async rate(key: string, max: number, seconds: number) {
    const { data, error } = await this.client.rpc("summin_rate_limit", {
      p_key: key,
      p_max: max,
      p_seconds: seconds,
    });
    if (error)
      throw new ApiError(503, "Request validation is temporarily unavailable.");
    return Boolean(data);
  }
}
const globalStore = globalThis as unknown as {
  summinMemory?: MemoryStore;
  summinSupabase?: SupabaseStore;
};
export function getStore(): RoomStore {
  const mode =
    process.env.SUMMIN_BACKEND ??
    (process.env.NODE_ENV === "production" ? "supabase" : "local");
  if (mode === "local") {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.SUMMIN_ALLOW_LOCAL_PREVIEW !== "true"
    )
      throw new ApiError(
        503,
        "Production multiplayer requires Supabase. Configure the backend before creating rooms.",
      );
    return (globalStore.summinMemory ??= new MemoryStore());
  }
  if (
    mode !== "supabase" ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    throw new ApiError(
      503,
      "Supabase is not configured. Set the server environment variables or use local development mode.",
    );
  return (globalStore.summinSupabase ??= new SupabaseStore(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ));
}
