export type UserRole = 'ADMIN' | 'STORE_MANAGER' | 'CUSTOMER';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
export type CustomerType = 'B2C' | 'B2B' | null;

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  customerType: CustomerType;
  status: UserStatus;
  storeId: string | null;
  storeName: string | null;
}

export interface AuthResponse {
  accessToken: string;
  expiresInSeconds: number;
  user: UserProfile;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}
