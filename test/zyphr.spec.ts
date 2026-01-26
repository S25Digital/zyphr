import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
import sinon from "sinon";
import {Zyphr, SCENARIO } from "../src";
import axios from "axios";
import Redis from "ioredis";
import Queue from "bull";

const expect = chai.expect;

describe("Zyphr Comprehensive Tests", () => {
  let axiosStub: sinon.SinonStub;
  let redisGetStub: sinon.SinonStub;
  let redisSetStub: sinon.SinonStub;
  let queueAddStub: sinon.SinonStub;
  let queueProcessStub: sinon.SinonStub;
  let queueWaitingStub: sinon.SinonStub;

  const options = {
    resetTimeout: 100,
    scenario: SCENARIO.RETURN_ERROR,
    redisConfig: {}
  };

  beforeEach(() => {
    axiosStub = sinon.stub(axios, "request");
    redisGetStub = sinon.stub(Redis.prototype, "get");
    redisSetStub = sinon.stub(Redis.prototype, "set").resolves("OK");
    queueAddStub = sinon.stub(Queue.prototype, "add").resolves();
    queueProcessStub = sinon.stub(Queue.prototype, "process");
    queueWaitingStub = sinon.stub(Queue.prototype, "getWaiting").resolves([]);
  });

  afterEach(() => sinon.restore());

  // ------------------------------
  // HTTP LAYER
  // ------------------------------

  it("should perform GET request successfully", async () => {
    axiosStub.resolves({ data: "hello" });
    const zyphr = new Zyphr(options);
    const res = await zyphr.get("/hello");
    expect(res.data).to.equal("hello");
  });

  it("should perform POST request", async () => {
    axiosStub.resolves({ data: "posted" });
    const zyphr = new Zyphr(options);
    const res = await zyphr.post("/p", { id: 1 });
    expect(res.data).to.equal("posted");
  });

  it("should perform PUT request", async () => {
    axiosStub.resolves({ data: "updated" });
    const zyphr = new Zyphr(options);
    const res = await zyphr.put("/u", { id: 2 });
    expect(res.data).to.equal("updated");
  });

  it("should perform DELETE request", async () => {
    axiosStub.resolves({ data: "deleted" });
    const zyphr = new Zyphr(options);
    const res = await zyphr.delete("/d");
    expect(res.data).to.equal("deleted");
  });

  // ------------------------------
  // GLOBAL GATE
  // ------------------------------

  it("should block request if global gate is OPEN", async () => {
    redisGetStub.resolves("OPEN");
    const zyphr = new Zyphr(options);

    await expect(zyphr.get("/x")).to.be.rejectedWith("globally open");
  });

  it("should queue request if scenario is QUEUE_REQUEST", async () => {
    redisGetStub.resolves("OPEN");
    const zyphr = new Zyphr({ ...options, scenario: SCENARIO.QUEUE_REQUEST });

    try { await zyphr.get("/x"); } catch {}

    expect(queueAddStub.calledOnce).to.be.true;
  });

  // ------------------------------
  // CIRCUIT BREAKER
  // ------------------------------

  it("should open circuit after failures", async () => {
    axiosStub.rejects(new Error("fail"));

    const zyphr = new Zyphr(options);

    for (let i = 0; i < 5; i++) {
      try { await zyphr.get("/fail"); } catch {}
    }

    expect(redisSetStub.called).to.be.true; // global open broadcast
  });

  // ------------------------------
  // QUEUE REPLAY
  // ------------------------------

  it("should process queue when circuit closes", async () => {
    const zyphr = new Zyphr(options);

    // simulate close event
    (zyphr as any)._breaker.emit("close");

    expect(queueWaitingStub.called).to.be.true;
  });

  // ------------------------------
  // RECOVERY FLOW
  // ------------------------------

  it("should allow requests when global state is CLOSED", async () => {
    redisGetStub.resolves("CLOSED");
    axiosStub.resolves({ data: "ok" });

    const zyphr = new Zyphr(options);
    const res = await zyphr.get("/ok");

    expect(res.data).to.equal("ok");
  });

  // ------------------------------
  // ERROR HANDLING
  // ------------------------------

  it("should propagate axios errors", async () => {
    axiosStub.rejects(new Error("network error"));
    const zyphr = new Zyphr(options);

    await expect(zyphr.get("/e")).to.be.rejectedWith("network error");
  });

  // ------------------------------
  // REDIS BROADCAST
  // ------------------------------

  it("should broadcast OPEN state to Redis", async () => {
    axiosStub.rejects(new Error("fail"));
    const zyphr = new Zyphr(options);

    try { await zyphr.get("/fail"); } catch {}

    expect(redisSetStub.calledWithMatch("zyphr:global:circuit", "OPEN")).to.be.true;
  });

});
