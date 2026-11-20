import {
  ApplicationRecord,
  CustomerRecord,
  NotificationItem,
  TransactionRecord,
  UserProfile,
} from '../modules/types';

export const DEMO_USER: UserProfile = {
  id: 1,
  userId: 'MC2627110001',
  fullName: 'Mamun Reja',
  email: 'admin@muncomputer.local',
  role: 'ADMIN',
  mobile: '+918101352105',
  address: 'Head Office, Level 3, Dhaka',
  avatarInitials: 'MR',
  branch: 'Main Service Center',
  status: 'ACTIVE',
  mobileVerified: true,
  emailVerified: true,
};

export const INITIAL_CUSTOMERS: CustomerRecord[] = [];

export const INITIAL_APPLICATIONS: ApplicationRecord[] = [];

export const INITIAL_TRANSACTIONS: TransactionRecord[] = [];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [];

