import { describe, expect, it } from "vitest";
import { checkPublicHttpsUrl, isPrivateIp } from "./safeUrl";

describe("calendar link safety", () => {
  it("spots private and internal addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.2.3.4",
      "172.16.0.1",
      "192.168.1.10",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "142.250.1.1", "2a00:1450:4003::1"]) expect(isPrivateIp(ip), ip).toBe(false);
  });

  it("refuses non-https, odd ports, credentials and internal hosts without fetching", async () => {
    expect(await checkPublicHttpsUrl("http://example.com/cal.ics")).toBeNull();
    expect(await checkPublicHttpsUrl("https://example.com:8443/cal.ics")).toBeNull();
    expect(await checkPublicHttpsUrl("https://user:pw@example.com/cal.ics")).toBeNull();
    expect(await checkPublicHttpsUrl("https://localhost/cal.ics")).toBeNull();
    expect(await checkPublicHttpsUrl("https://127.0.0.1/cal.ics")).toBeNull();
    expect(await checkPublicHttpsUrl("https://[::1]/cal.ics")).toBeNull();
    expect(await checkPublicHttpsUrl("https://8.8.8.8/cal.ics")).not.toBeNull();
  });
});
