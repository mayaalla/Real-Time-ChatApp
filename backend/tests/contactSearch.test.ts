import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../../frontend/src/lib/axios", () => ({ api: { get: mocks.get } }));
import { searchUsers } from "../../frontend/src/api/users.api";
import { createConversation } from "../../frontend/src/api/conversations.api";

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllGlobals());

const bob = { id: "bob", username: "bob", avatarAddress: null, lastSeen: null };

describe("contact search", () => {
  it("unwraps the backend data.users envelope", async () => {
    mocks.get.mockResolvedValue({ data: { ok: true, data: { users: [bob] } } });
    expect(await searchUsers("  bo  ", "token")).toEqual([bob]);
    expect(mocks.get).toHaveBeenCalledWith("/api/users", { params: { search: "bo" }, signal: undefined });
  });
  it("does not request queries shorter than two characters", async () => {
    expect(await searchUsers(" b ", "token")).toEqual([]);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("returns an empty list when no users match", async () => {
    mocks.get.mockResolvedValue({ data: { ok: true, data: { users: [] } } });
    expect(await searchUsers("nobody", "token")).toEqual([]);
  });
  it("keeps request errors distinct from empty search results", async () => {
    mocks.get.mockRejectedValue(new Error("Network error"));
    await expect(searchUsers("bob", "token")).rejects.toThrow("Network error");
  });
  it("passes cancellation through to the HTTP client", async () => {
    const controller = new AbortController();
    mocks.get.mockResolvedValue({ data: { ok: true, data: { users: [bob] } } });
    await searchUsers("bob", "token", controller.signal);
    expect(mocks.get).toHaveBeenCalledWith("/api/users", expect.objectContaining({ signal: controller.signal }));
  });
  it("unwraps the created conversation for navigation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, data: { conversation: { id: "new-chat" } } }),
    }));
    expect(await createConversation("token", [bob.id], false)).toEqual({ id: "new-chat" });
  });
});
