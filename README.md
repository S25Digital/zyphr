# Zyphr

Zyphr is a resilient and distributed HTTP request circuit breaker for Node.js, designed to simplify handling HTTP requests while providing robust protection and distributed state management. With Zyphr, you can safeguard your services from cascading failures and ensure smooth operations even under adverse conditions.

## Features

- **Resilient Circuit Breaking**: Automatically manages the state of HTTP requests to prevent repeated failures from overwhelming your system.
- **Distributed State Management**: Leverages Redis to share circuit breaker state across multiple instances of your service.
- **Customizable Scenarios**: Choose between returning an immediate error or queuing requests when the circuit is open, to be processed when the circuit closes.
- **Simple HTTP Methods**: Easy-to-use HTTP methods that abstract away the circuit breaker logic, allowing you to focus on your application.

## Installation

```bash
npm install zyphr
```

## Usage
Using Zyphr to make HTTP requests with circuit breaker protection and distributed state management is simple. Here’s how to use it:

```typescript
const Zyphr = require('zyphr');

const options = {
  failureThreshold: 5, // After 5 failures, open the circuit
  successThreshold: 2, // After 2 successes in half-open state, close the circuit
  resetTimeout: 30000, // 30 seconds before trying again
  scenario: 2, // Scenario 2: Queue requests
  redisConfig: {
    host: 'localhost',
    port: 6379
  }
};

const httpClient = new Zyphr(options);

async function makeRequest() {
  try {
    const response = await httpClient.get('https://api.example.com/data');
    console.log('Request succeeded:', response.body);
  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

makeRequest();
```

## API

### `Zyphr(options)`

Creates a new Zyphr instance.

#### `options`:
- `failureThreshold` (number): Number of failures before opening the circuit.
- `successThreshold` (number): Number of successes required to close the circuit from the half-open state.
- `resetTimeout` (number): Time in milliseconds to wait before transitioning from open to half-open state.
- `scenario` (number): Scenario 1 (immediate error) or Scenario 2 (queue requests).
- `redisConfig` (object): Redis connection configuration.

### HTTP Methods

Zyphr provides simple HTTP methods that abstract away the circuit breaker logic:

- `get(url, options)`: Makes a GET request.
- `post(url, body, options)`: Makes a POST request.
- `put(url, body, options)`: Makes a PUT request.
- `delete(url, options)`: Makes a DELETE request.

Each method returns a promise that resolves with the response or rejects with an error.

### Scenarios

1. **Immediate Error (Scenario 1)**: When the circuit is open, Zyphr immediately returns an error indicating that the circuit is open. This allows the consumer to handle the failure accordingly.

2. **Queue Requests (Scenario 2)**: When the circuit is open, requests are added to a queue and an error is returned indicating that the request has been queued. Once the circuit transitions to the closed state, the queued requests are processed.

### Redis Configuration

Ensure that Redis is properly configured and running to manage the distributed state of the circuit breaker. You can provide Redis connection details in the `redisConfig` option.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

