export const AUTH_STORAGE_KEY = 'abcBackflowAuthenticated';
export const LOGIN_USERNAME = 'admin';
export const LOGIN_PASSWORD = 'Java63';

export const isAuthenticated = () => localStorage.getItem(AUTH_STORAGE_KEY) === 'true';

export const signIn = () => {
  localStorage.setItem(AUTH_STORAGE_KEY, 'true');
};

export const signOut = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
};
