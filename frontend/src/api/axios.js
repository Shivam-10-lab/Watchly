import axios from 'axios';

let _accessToken = null;
export const setAccessToken = (t) => { _accessToken = t; };
export const getAccessToken = () => _accessToken;

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true,
  timeout: 15000,
});

api.interceptors.request.use(config => {
  if (_accessToken) config.headers.Authorization = `Bearer ${_accessToken}`;
  return config;
});

let isRefreshing = false;
let failedQueue  = [];

const processQueue = (err, token = null) => {
  failedQueue.forEach(({ resolve, reject }) =>
    err ? reject(err) : resolve(token)
  );
  failedQueue = [];
};

api.interceptors.response.use(
  r => r,
  async error => {
    const orig = error.config;
    const expired =
      error.response?.status === 401 &&
      error.response?.data?.code === 'TOKEN_EXPIRED' &&
      !orig._retry;

    if (!expired) return Promise.reject(error);

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(token => {
        orig.headers.Authorization = `Bearer ${token}`;
        return api(orig);
      });
    }

    orig._retry   = true;
    isRefreshing  = true;

    try {
      const { data } = await api.post('/auth/refresh');
      const token = data.data.accessToken;
      setAccessToken(token);
      processQueue(null, token);
      orig.headers.Authorization = `Bearer ${token}`;
      return api(orig);
    } catch (e) {
      processQueue(e, null);
      setAccessToken(null);
      window.location.href = '/login';
      return Promise.reject(e);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;