import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import CircuitBreaker from 'opossum';
import Redis, { RedisOptions } from 'ioredis';
import Queue from 'bull';

const redis = new Redis(); // Configure Redis connection

// Type definitions for options
interface ZyphrOptions {
  failureThreshold: number;
  successThreshold: number;
  resetTimeout: number;
  scenario: number;
  redisConfig?: RedisOptions;
  stateKey?: string;
}

// Type definitions for queue job data
interface JobData {
  method: string;
  url: string;
  data?: any;
  config?: AxiosRequestConfig;
}

// Function to fetch circuit breaker state from Redis
async function getCircuitState(key: string): Promise<any> {
  const state = await redis.get(key);
  return state ? JSON.parse(state) : { state: 'CLOSED', failureCount: 0, successCount: 0, lastFailureTime: null };
}

// Function to save circuit breaker state to Redis
async function setCircuitState(key: string, state: any): Promise<void> {
  await redis.set(key, JSON.stringify(state));
}

// Custom circuit breaker class with Redis state management
class Zyphr {
  private _options: ZyphrOptions;
  private _stateKey: string;
  private _scenario: number;
  private _queue: Queue.Queue<JobData>;
  private _breaker: CircuitBreaker;

  constructor(options: ZyphrOptions) {
    this._options = options;
    this._stateKey = options.stateKey || 'circuit-breaker:zyphr';
    this._scenario = options.scenario;
    this._queue = new Queue('requestQueue', {
      redis: options.redisConfig
    });
    this._queue.process(async (job) => {
      const { method, url, data, config } = job.data;
      return this.request(method, url, data, config);
    });

    this._breaker = new CircuitBreaker(this.fireRequest.bind(this), {
      timeout: this._options.resetTimeout,
      errorThresholdPercentage: (this._options.failureThreshold / (this._options.failureThreshold + this._options.successThreshold)) * 100,
      resetTimeout: this._options.resetTimeout
    });

    this._breaker.on('open', async () => {
      const state = await getCircuitState(this._stateKey);
      state.state = 'OPEN';
      state.lastFailureTime = Date.now();
      await setCircuitState(this._stateKey, state);
    });

    this._breaker.on('halfOpen', async () => {
      const state = await getCircuitState(this._stateKey);
      state.state = 'HALF_OPEN';
      await setCircuitState(this._stateKey, state);
    });

    this._breaker.on('close', async () => {
      const state = await getCircuitState(this._stateKey);
      state.state = 'CLOSED';
      state.failureCount = 0;
      state.successCount = 0;
      await setCircuitState(this._stateKey, state);
      await this.processQueue();
    });
  }

  private async fireRequest(method: string, url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<any>> {
    const circuitState = await getCircuitState(this._stateKey);

    if (circuitState.state === 'OPEN') {
      if (Date.now() - circuitState.lastFailureTime > this._options.resetTimeout) {
        circuitState.state = 'HALF_OPEN';
        await setCircuitState(this._stateKey, circuitState);
      } else {
        if (this._scenario === 1) {
          throw new Error('Circuit is open');
        } else if (this._scenario === 2) {
          this._queue.add({ method, url, data, config });
          throw new Error('Circuit is open. Request has been queued.');
        }
      }
    }

    try {
      const result = await this.request(method, url, data, config);
      await this.recordSuccess(circuitState);
      return result;
    } catch (error) {
      await this.recordFailure(circuitState);
      throw error;
    }
  }

  private async request(method: string, url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<any>> {
    switch (method) {
      case 'get':
        return axios.get(url, config);
      case 'post':
        return axios.post(url, data, config);
      case 'put':
        return axios.put(url, data, config);
      case 'delete':
        return axios.delete(url, config);
      default:
        throw new Error('Invalid method');
    }
  }

  private async recordSuccess(circuitState: any): Promise<void> {
    circuitState.failureCount = 0;
    if (circuitState.state === 'HALF_OPEN') {
      circuitState.successCount += 1;
      if (circuitState.successCount >= this._options.successThreshold) {
        circuitState.state = 'CLOSED';
        circuitState.successCount = 0;
        await this.processQueue();
      }
    }
    await setCircuitState(this._stateKey, circuitState);
  }

  private async recordFailure(circuitState: any): Promise<void> {
    circuitState.failureCount += 1;
    circuitState.lastFailureTime = Date.now();
    if (circuitState.state === 'HALF_OPEN' || (circuitState.state === 'CLOSED' && circuitState.failureCount > this._options.failureThreshold)) {
      circuitState.state = 'OPEN';
    }
    await setCircuitState(this._stateKey, circuitState);
  }

  private async processQueue(): Promise<void> {
    const jobs = await this._queue.getWaiting();
    for (const job of jobs) {
      await job.promote();
    }
  }

  public async get(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<any>> {
    return this._breaker.fire('get', url, null, config);
  }

  public async post(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<any>> {
    return this._breaker.fire('post', url, data, config);
  }

  public async put(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<any>> {
    return this._breaker.fire('put', url, data, config);
  }

  public async delete(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<any>> {
    return this._breaker.fire('delete', url, null, config);
  }
}

export default Zyphr;
