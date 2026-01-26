import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import CircuitBreaker from "opossum";
import Redis, { RedisOptions } from "ioredis";
import Queue from "bull";

export enum SCENARIO {
  RETURN_ERROR = 1,
  QUEUE_REQUEST = 2,
}

interface ZyphrOptions {
  resetTimeout: number;
  scenario: SCENARIO;
  redisConfig?: RedisOptions;
  stateKey?: string;
  globalTtl?: number; // how long global OPEN state lasts
}

interface JobData {
  method: string;
  url: string;
  data?: any;
  config?: AxiosRequestConfig;
}

export class Zyphr {
  private _breaker: CircuitBreaker<[string, string, any?, AxiosRequestConfig?], AxiosResponse>;
  private _queue: Queue.Queue<JobData>;
  private _redis: Redis;
  private _stateKey: string;
  private _scenario: SCENARIO;
  private _ttl: number;

  constructor(options: ZyphrOptions) {
    this._stateKey = options.stateKey || "zyphr:global:circuit";
    this._scenario = options.scenario;
    this._ttl = options.globalTtl || 30; // seconds
    this._redis = new Redis(options.redisConfig);
    this._queue = new Queue("zyphr-queue", { redis: options.redisConfig });

    const executor = async (
      method: string,
      url: string,
      data?: any,
      config?: AxiosRequestConfig
    ) => axios({ method: method as any, url, data, ...config });

    this._breaker = new CircuitBreaker(executor, {
      timeout: options.resetTimeout,
      errorThresholdPercentage: 50,
      resetTimeout: options.resetTimeout,
      rollingCountTimeout: 10000,
      rollingCountBuckets: 10,
    });

    // ----- Global State Broadcasting -----
    this._breaker.on("open", () => {
      this._redis.set(this._stateKey, "OPEN", "EX", this._ttl);
    });

    this._breaker.on("halfOpen", () => {
      this._redis.set(this._stateKey, "HALF_OPEN", "EX", this._ttl);
    });

    this._breaker.on("close", async () => {
      await this._redis.set(this._stateKey, "CLOSED", "EX", this._ttl);
      await this.processQueue();
    });

    // Queue worker always goes through breaker
    this._queue.process(async (job) => {
      const { method, url, data, config } = job.data;
      return this._breaker.fire(method, url, data, config);
    });
  }

  // ----- GLOBAL GATE -----
  private async isGloballyOpen(): Promise<boolean> {
    const state = await this._redis.get(this._stateKey);
    return state === "OPEN";
  }

  private async handleRequest(
    method: string,
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ) {
    // 1️⃣ Global Gate Check
    if (await this.isGloballyOpen()) {
      if (this._scenario === SCENARIO.RETURN_ERROR) {
        throw new Error("Circuit is globally open");
      }

      await this._queue.add({ method, url, data, config });
      throw new Error("Circuit is globally open. Request has been queued.");
    }

    // 2️⃣ Local breaker
    return this._breaker.fire(method, url, data, config);
  }

  private async processQueue() {
    const jobs = await this._queue.getWaiting();
    for (const job of jobs) {
      await job.promote();
    }
  }

  public get(url: string, config?: AxiosRequestConfig) {
    return this.handleRequest("get", url, undefined, config);
  }

  public post(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.handleRequest("post", url, data, config);
  }

  public put(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.handleRequest("put", url, data, config);
  }

  public delete(url: string, config?: AxiosRequestConfig) {
    return this.handleRequest("delete", url, undefined, config);
  }
}
