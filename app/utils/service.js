import axios from 'axios';

// Create an Axios instance with the base URL
const api = axios.create({
  baseURL: process.env.API_BASE_URL || 'http://localhost:5000', // Fallback to localhost:5000 if .env is not set
  timeout: 10000, // Set a timeout for requests (10 seconds)
});

// Add request interceptors
api.interceptors.request.use(
  (config) => {
    // Log the request URL and method for debugging
    console.log(`Request: ${config.method.toUpperCase()} ${config.baseURL}${config.url}`);

    // Add headers or modify the request config here
    const token = localStorage.getItem('auth'); // Example: Add an auth token if available
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    // Log request errors
    console.error('Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptors
api.interceptors.response.use(
  (response) => {
    // Log the response for debugging
    console.log(`Response: ${response.status} ${response.config.url}`, response.data);

    // Handle successful responses
    return response;
  },
  (error) => {
    // Log response errors
    console.error('Response Error:', error);

    // Handle specific error statuses
    if (error.response) {
      // The request was made and the server responded with a status code
      console.error('Error Data:', error.response.data);
      console.error('Error Status:', error.response.status);
      console.error('Error Headers:', error.response.headers);

      if (error.response.status === 401) {
        // Handle unauthorized errors (e.g., redirect to login)
        console.error('Unauthorized: Redirecting to login...');
        // Example: Redirect to login page
        window.location.href = '/login';
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No Response Received:', error.request);
    } else {
      // Something happened in setting up the request
      console.error('Request Setup Error:', error.message);
    }

    return Promise.reject(error);
  }
);

export default api;