import Zyphr, {SCENARIO} from './zyphr';

const options = {
  failureThreshold: 5, // After 5 failures, open the circuit
  successThreshold: 2, // After 2 successes in half-open state, close the circuit
  resetTimeout: 30000, // 30 seconds before trying again
  scenario: SCENARIO.QUEUE_REQUEST , // Scenario 2: Queue requests
  redisConfig: {
    host: 'localhost',
    port: 6379
  }
};

const httpClient = new Zyphr(options);

async function makeRequest() {
  try {
    const response = await httpClient.get('https://api.example.com/data');
    console.log('Request succeeded:', response.data);
  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

makeRequest();
