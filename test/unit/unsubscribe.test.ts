import { describe, expect, it, vi } from "vitest";
import { get } from "../../functions/unsubscribe";
import { createMockRequest } from "../helpers/mock-request";

const TOKEN = "3f2b8c1e-5d4a-4b6f-9e2c-7a1d0b9c8e6f";
const STORE = { name: "Ana's <Shop>", url: "https://ana-shop.example.com" };

function request(query: Record<string, string>, subscription?: Record<string, any>) {
  const swellGet = vi.fn(async () => ({ results: subscription ? [subscription] : [] }));
  const put = vi.fn(async () => ({ ...subscription, status: "cancelled" }));
  const post = vi.fn();
  const req = createMockRequest({ method: "GET", query, data: query, swell: { get: swellGet, put, post } });
  Object.assign(req.store, STORE);
  return { req, get: swellGet, put, post };
}

async function render(req: SwellRequest) {
  const res = (await get(req)) as Response;
  return { status: res.status, type: res.headers.get("Content-Type"), body: await res.text() };
}

describe("unsubscribe route", () => {
  it("rejects a missing token with a 400 page without touching the store", async () => {
    const { req, get: swellGet } = request({});

    const page = await render(req);
    expect(page.status).toBe(400);
    expect(page.type).toBe("text/html; charset=utf-8");
    expect(page.body).toContain("This link is not valid.");
    expect(swellGet).not.toHaveBeenCalled();
  });

  it("rejects a token that is not UUID-shaped", async () => {
    const { req, get: swellGet } = request({ token: "abc" });

    const page = await render(req);
    expect(page.status).toBe(400);
    expect(page.body).toContain("This link is not valid.");
    expect(swellGet).not.toHaveBeenCalled();
  });

  it("shows a 404 page when no subscription has the token", async () => {
    const { req, get: swellGet, put } = request({ token: TOKEN });

    const page = await render(req);
    expect(page.status).toBe(404);
    expect(page.body).toContain("This link is not valid or has already been used.");
    expect(swellGet).toHaveBeenCalledWith("/stock-subscriptions", { where: { token: TOKEN }, limit: 1, expand: "product" });
    expect(put).not.toHaveBeenCalled();
  });

  it("cancels a waiting subscription and names the product", async () => {
    const { req, put, post } = request(
      { token: TOKEN },
      { id: "sub-1", email: "customer@example.com", status: "waiting", product: { name: "Merino <Crew>" } },
    );

    const page = await render(req);
    expect(page.status).toBe(200);
    expect(put).toHaveBeenCalledWith("/stock-subscriptions/sub-1", { status: "cancelled" });
    expect(put).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
    expect(page.body).toContain("You won&#39;t be emailed about Merino &lt;Crew&gt;.");
    expect(page.body).not.toContain("customer@example.com");
  });

  it("falls back to 'this product' when the product has no name", async () => {
    const { req } = request({ token: TOKEN }, { id: "sub-1", status: "waiting", product: null });

    expect((await render(req)).body).toContain("You won&#39;t be emailed about this product.");
  });

  it("reads the token from req.data when the query is empty", async () => {
    const { req, put } = request({}, { id: "sub-1", status: "waiting" });
    req.data = { token: TOKEN };

    expect((await render(req)).status).toBe(200);
    expect(put).toHaveBeenCalledWith("/stock-subscriptions/sub-1", { status: "cancelled" });
  });

  it("does nothing for an already notified subscription", async () => {
    const { req, put } = request({ token: TOKEN }, { id: "sub-1", status: "notified", product: { name: "Sweater" } });

    const page = await render(req);
    expect(page.status).toBe(200);
    expect(page.body).toContain("This alert is already switched off.");
    expect(put).not.toHaveBeenCalled();
  });

  it("does nothing for an already cancelled subscription", async () => {
    const { req, put } = request({ token: TOKEN }, { id: "sub-1", status: "cancelled" });

    const page = await render(req);
    expect(page.status).toBe(200);
    expect(page.body).toContain("This alert is already switched off.");
    expect(put).not.toHaveBeenCalled();
  });

  it("shows the escaped store name and a link back to the store", async () => {
    const { req } = request({ token: "abc" });

    const page = await render(req);
    expect(page.body).toContain("Ana&#39;s &lt;Shop&gt;");
    expect(page.body).toContain('href="https://ana-shop.example.com"');
    expect(page.body).not.toContain("<Shop>");
  });
});
