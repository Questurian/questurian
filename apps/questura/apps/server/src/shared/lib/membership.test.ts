import { isActiveMember, getMembershipStatus } from './membership';
import { createMockUserData } from '@/test-utils';
import type { User } from '@/payload-types';

describe('membership', () => {
  describe('isActiveMember', () => {
    it('should return false for null or undefined user', () => {
      expect(isActiveMember(null)).toBe(false);
      expect(isActiveMember(undefined)).toBe(false);
    });

    describe('Priority 1: Admin/Editor roles', () => {
      it('should return true for admin users', () => {
        const adminUser = createMockUserData({
          role: 'admin',
          subscriptionStatus: 'none',
          membershipExpiration: null,
        });

        expect(isActiveMember(adminUser as unknown as User)).toBe(true);
      });

      it('should return true for editor users', () => {
        const editorUser = createMockUserData({
          role: 'editor',
          subscriptionStatus: 'none',
          membershipExpiration: null,
        });

        expect(isActiveMember(editorUser as unknown as User)).toBe(true);
      });

      it('should return true for admin even with expired membership', () => {
        const adminUser = createMockUserData({
          role: 'admin',
          subscriptionStatus: 'cancelled',
          membershipExpiration: new Date(Date.now() - 1000).toISOString(),
        });

        expect(isActiveMember(adminUser as unknown as User)).toBe(true);
      });
    });

    describe('Priority 2: Active subscription', () => {
      it('should return true for active subscription', () => {
        const activeUser = createMockUserData({
          subscriptionStatus: 'active',
          role: 'user',
        });

        expect(isActiveMember(activeUser as unknown as User)).toBe(true);
      });

      it('should return true for active subscription regardless of membershipExpiration', () => {
        const activeUser = createMockUserData({
          subscriptionStatus: 'active',
          role: 'user',
          membershipExpiration: new Date(Date.now() - 1000).toISOString(), // expired
        });

        expect(isActiveMember(activeUser as unknown as User)).toBe(true);
      });

      it('should return false for past_due subscription', () => {
        const pastDueUser = createMockUserData({
          subscriptionStatus: 'past_due',
          role: 'user',
        });

        expect(isActiveMember(pastDueUser as unknown as User)).toBe(false);
      });

      it('should return false for cancelled subscription without grace period', () => {
        const cancelledUser = createMockUserData({
          subscriptionStatus: 'cancelled',
          role: 'user',
          membershipExpiration: null,
        });

        expect(isActiveMember(cancelledUser as unknown as User)).toBe(false);
      });
    });

    describe('Priority 3: Cancelled with grace period', () => {
      it('should return true for cancelled subscription with unexpired grace period', () => {
        const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
        const gracePeriodUser = createMockUserData({
          subscriptionStatus: 'cancelled',
          role: 'user',
          membershipExpiration: futureDate.toISOString(),
        });

        expect(isActiveMember(gracePeriodUser as unknown as User)).toBe(true);
      });

      it('should return false for cancelled subscription with expired grace period', () => {
        const pastDate = new Date(Date.now() - 1000); // 1 second ago
        const expiredUser = createMockUserData({
          subscriptionStatus: 'cancelled',
          role: 'user',
          membershipExpiration: pastDate.toISOString(),
        });

        expect(isActiveMember(expiredUser as unknown as User)).toBe(false);
      });

      it('should return true for no subscription with unexpired membershipExpiration', () => {
        const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const noneUser = createMockUserData({
          subscriptionStatus: 'none',
          role: 'user',
          membershipExpiration: futureDate.toISOString(),
        });

        expect(isActiveMember(noneUser as unknown as User)).toBe(true);
      });

      it('should be boundary-sensitive for grace period expiration', () => {
        // Test with exactly now (should be false since expiration > now)
        const nowDate = new Date();
        const boundaryUser = createMockUserData({
          subscriptionStatus: 'cancelled',
          role: 'user',
          membershipExpiration: nowDate.toISOString(),
        });

        expect(isActiveMember(boundaryUser as unknown as User)).toBe(false);
      });
    });

    describe('No membership', () => {
      it('should return false for regular user without subscription or grace period', () => {
        const noMembershipUser = createMockUserData({
          role: 'user',
          subscriptionStatus: 'none',
          membershipExpiration: null,
        });

        expect(isActiveMember(noMembershipUser as unknown as User)).toBe(false);
      });
    });
  });

  describe('getMembershipStatus', () => {
    it('should return defaults for null/undefined user', () => {
      const nullResult = getMembershipStatus(null);
      const undefinedResult = getMembershipStatus(undefined);

      expect(nullResult).toEqual({
        isActive: false,
        expiresAt: null,
        renewsAt: null,
        daysRemaining: null,
        membershipType: 'none',
      });
      expect(undefinedResult).toEqual(nullResult);
    });

    describe('Admin membership', () => {
      it('should return admin type for admin users', () => {
        const adminUser = createMockUserData({
          role: 'admin',
          subscriptionRenewsAt: null,
        });

        const status = getMembershipStatus(adminUser as unknown as User);

        expect(status.membershipType).toBe('admin');
        expect(status.isActive).toBe(true);
        expect(status.expiresAt).toBeNull();
        expect(status.renewsAt).toBeNull();
        expect(status.daysRemaining).toBeNull();
      });

      it('should return admin type for editor users', () => {
        const editorUser = createMockUserData({
          role: 'editor',
        });

        const status = getMembershipStatus(editorUser as unknown as User);

        expect(status.membershipType).toBe('admin');
        expect(status.isActive).toBe(true);
      });
    });

    describe('Active subscription membership', () => {
      it('should return subscription type with renewal date', () => {
        const renewDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const activeUser = createMockUserData({
          role: 'user',
          subscriptionStatus: 'active',
          subscriptionRenewsAt: renewDate.toISOString(),
        });

        const status = getMembershipStatus(activeUser as unknown as User);

        expect(status.membershipType).toBe('subscription');
        expect(status.isActive).toBe(true);
        expect(status.renewsAt).toEqual(renewDate);
        expect(status.expiresAt).toBeNull();
      });

      it('should return subscription type even without renewal date', () => {
        const activeUser = createMockUserData({
          role: 'user',
          subscriptionStatus: 'active',
          subscriptionRenewsAt: null,
        });

        const status = getMembershipStatus(activeUser as unknown as User);

        expect(status.membershipType).toBe('subscription');
        expect(status.isActive).toBe(true);
      });
    });

    describe('Cancelled membership with grace period', () => {
      it('should return cancelled type with expiration and days remaining', () => {
        const expirationDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        const cancelledUser = createMockUserData({
          role: 'user',
          subscriptionStatus: 'cancelled',
          membershipExpiration: expirationDate.toISOString(),
        });

        const status = getMembershipStatus(cancelledUser as unknown as User);

        expect(status.membershipType).toBe('cancelled');
        expect(status.isActive).toBe(true);
        expect(status.expiresAt).toEqual(expirationDate);
        expect(status.daysRemaining).toBe(7);
      });

      it('should calculate days remaining correctly', () => {
        // 3.5 days remaining
        const expirationDate = new Date(Date.now() + 3.5 * 24 * 60 * 60 * 1000);
        const cancelledUser = createMockUserData({
          role: 'user',
          subscriptionStatus: 'cancelled',
          membershipExpiration: expirationDate.toISOString(),
        });

        const status = getMembershipStatus(cancelledUser as unknown as User);

        expect(status.daysRemaining).toBe(4); // Math.ceil(3.5) = 4
      });

      it('should return 0 days remaining for expired grace period', () => {
        const expirationDate = new Date(Date.now() - 1000); // 1 second ago
        const expiredUser = createMockUserData({
          role: 'user',
          subscriptionStatus: 'cancelled',
          membershipExpiration: expirationDate.toISOString(),
        });

        const status = getMembershipStatus(expiredUser as unknown as User);

        expect(status.membershipType).toBe('cancelled');
        expect(status.isActive).toBe(false);
        expect(status.daysRemaining).toBe(0);
      });
    });

    describe('No membership', () => {
      it('should return none type for user without subscription', () => {
        const noMembershipUser = createMockUserData({
          role: 'user',
          subscriptionStatus: 'none',
          membershipExpiration: null,
          subscriptionRenewsAt: null,
        });

        const status = getMembershipStatus(noMembershipUser as unknown as User);

        expect(status.membershipType).toBe('none');
        expect(status.isActive).toBe(false);
        expect(status.expiresAt).toBeNull();
        expect(status.renewsAt).toBeNull();
        expect(status.daysRemaining).toBeNull();
      });
    });

    describe('Renewal dates', () => {
      it('should return renewsAt for active subscription', () => {
        const renewDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const activeUser = createMockUserData({
          role: 'user',
          subscriptionStatus: 'active',
          subscriptionRenewsAt: renewDate.toISOString(),
        });

        const status = getMembershipStatus(activeUser as unknown as User);

        expect(status.renewsAt).toEqual(renewDate);
      });

      it('should return null renewsAt for cancelled without membershipExpiration', () => {
        const cancelledUser = createMockUserData({
          role: 'user',
          subscriptionStatus: 'cancelled',
          subscriptionRenewsAt: null,
          membershipExpiration: null,
        });

        const status = getMembershipStatus(cancelledUser as unknown as User);

        expect(status.renewsAt).toBeNull();
      });
    });

    describe('Past due subscription', () => {
      it('should return none type for past_due subscription', () => {
        const pastDueUser = createMockUserData({
          role: 'user',
          subscriptionStatus: 'past_due',
        });

        const status = getMembershipStatus(pastDueUser as unknown as User);

        expect(status.membershipType).toBe('none');
        expect(status.isActive).toBe(false);
      });
    });
  });
});
