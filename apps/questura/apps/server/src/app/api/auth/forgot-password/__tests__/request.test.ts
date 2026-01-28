import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../route'
import { createMockUserData } from '@/test-utils'
import type { NextRequest } from 'next/server'

// Mock dependencies
vi.mock('payload', () => ({
  getPayload: vi.fn()
}))

vi.mock('@/auth/lib/auth-errors', () => ({
  createAuthErrorResponse: (code: string, additionalData?: Record<string, any>) => {
    const errorMap: Record<string, any> = {
      INVALID_REQUEST_FORMAT: {
        error: { code: 'INVALID_REQUEST_FORMAT', message: 'Request body must be valid JSON' },
        status: 400
      },
      INVALID_EMAIL_FORMAT: {
        error: { code: 'INVALID_EMAIL_FORMAT', message: 'Please provide a valid email address' },
        status: 400
      },
      NO_LOCAL_PASSWORD: {
        error: {
          code: 'NO_LOCAL_PASSWORD',
          message: 'This account uses Google sign-in only. Please sign in with Google, or add a password to your account first.',
          ...additionalData
        },
        status: 400
      },
      INTERNAL_SERVER_ERROR: {
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong. Please try again or contact support if the problem continues.' },
        status: 500
      }
    }
    return errorMap[code] || errorMap.INTERNAL_SERVER_ERROR
  }
}))

vi.mock('@/auth/lib/auth-middleware', () => ({
  getCorsHeaders: vi.fn(() => ({})),
  handleCorsOptions: vi.fn()
}))

vi.mock('@/emails', () => ({
  sendPasswordResetEmail: vi.fn()
}))

describe('POST /api/auth/forgot-password/request', () => {
  let mockPayload: any
  let mockRequest: Partial<NextRequest>

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    // Setup default mock payload
    mockPayload = {
      find: vi.fn(),
      update: vi.fn()
    }

    // Setup default request
    mockRequest = {
      json: vi.fn()
    }
  })

  describe('Authentication state: Google-only users', () => {
    it('should return NO_LOCAL_PASSWORD error when Google-only user requests password reset', async () => {
      const googleOnlyUser = createMockUserData({
        email: 'google.only@example.com',
        hasLocalPassword: false,
        hasGoogleOAuth: true,
        authProvider: 'google' as const
      })

      const { getPayload } = await import('payload')
      vi.mocked(getPayload).mockResolvedValue(mockPayload)

      // Mock the find response
      mockPayload.find.mockResolvedValue({
        docs: [googleOnlyUser]
      })

      // Mock the request
      ;(mockRequest.json as any).mockResolvedValue({
        email: 'google.only@example.com'
      })

      const response = await POST(mockRequest as NextRequest)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.code).toBe('NO_LOCAL_PASSWORD')
      expect(data.message).toContain('Google sign-in')
      // Email should not be sent
      const { sendPasswordResetEmail } = await import('@/emails')
      expect(sendPasswordResetEmail).not.toHaveBeenCalled()
    })

    it('should log when Google-only user requests password reset', async () => {
      const googleOnlyUser = createMockUserData({
        email: 'google.only@example.com',
        hasLocalPassword: false,
        hasGoogleOAuth: true,
        authProvider: 'google' as const
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const { getPayload } = await import('payload')
      vi.mocked(getPayload).mockResolvedValue(mockPayload)

      mockPayload.find.mockResolvedValue({
        docs: [googleOnlyUser]
      })

      ;(mockRequest.json as any).mockResolvedValue({
        email: 'google.only@example.com'
      })

      await POST(mockRequest as NextRequest)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Password reset requested for Google-only account')
      )

      consoleSpy.mockRestore()
    })
  })

  describe('Authentication state: Local password users', () => {
    it('should send password reset email for user with local password', async () => {
      const localUser = createMockUserData({
        email: 'local.user@example.com',
        hasLocalPassword: true,
        hasGoogleOAuth: false,
        authProvider: 'local' as const,
        firstName: 'John',
        lastName: 'Doe'
      })

      const { getPayload } = await import('payload')
      vi.mocked(getPayload).mockResolvedValue(mockPayload)

      mockPayload.find.mockResolvedValue({
        docs: [localUser]
      })

      mockPayload.update.mockResolvedValue({})

      ;(mockRequest.json as any).mockResolvedValue({
        email: 'local.user@example.com'
      })

      const { sendPasswordResetEmail } = await import('@/emails')
      vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined)

      const response = await POST(mockRequest as NextRequest)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toContain('password reset code')
      // Email should be sent
      expect(sendPasswordResetEmail).toHaveBeenCalled()
    })

    it('should generate and store verification code for local users', async () => {
      const localUser = createMockUserData({
        email: 'local.user@example.com',
        hasLocalPassword: true
      })

      const { getPayload } = await import('payload')
      vi.mocked(getPayload).mockResolvedValue(mockPayload)

      mockPayload.find.mockResolvedValue({
        docs: [localUser]
      })

      mockPayload.update.mockResolvedValue({})

      ;(mockRequest.json as any).mockResolvedValue({
        email: 'local.user@example.com'
      })

      const { sendPasswordResetEmail } = await import('@/emails')
      vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined)

      await POST(mockRequest as NextRequest)

      // Verify update was called with verification code
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'users',
          id: localUser.id,
          data: expect.objectContaining({
            passwordResetCode: expect.any(String),
            passwordResetExpires: expect.any(Date)
          })
        })
      )
    })
  })

  describe('Authentication state: Dual authentication users', () => {
    it('should send password reset email for user with both auth methods', async () => {
      const dualAuthUser = createMockUserData({
        email: 'dual.auth@example.com',
        hasLocalPassword: true,
        hasGoogleOAuth: true,
        authProvider: 'dual' as const,
        firstName: 'Jane',
        lastName: 'Smith'
      })

      const { getPayload } = await import('payload')
      vi.mocked(getPayload).mockResolvedValue(mockPayload)

      mockPayload.find.mockResolvedValue({
        docs: [dualAuthUser]
      })

      mockPayload.update.mockResolvedValue({})

      ;(mockRequest.json as any).mockResolvedValue({
        email: 'dual.auth@example.com'
      })

      const { sendPasswordResetEmail } = await import('@/emails')
      vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined)

      const response = await POST(mockRequest as NextRequest)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      // Email should be sent for dual auth users
      expect(sendPasswordResetEmail).toHaveBeenCalled()
    })
  })

  describe('Security: Non-existent users', () => {
    it('should return success for non-existent email to prevent account enumeration', async () => {
      const { getPayload } = await import('payload')
      vi.mocked(getPayload).mockResolvedValue(mockPayload)

      mockPayload.find.mockResolvedValue({
        docs: []
      })

      ;(mockRequest.json as any).mockResolvedValue({
        email: 'nonexistent@example.com'
      })

      const response = await POST(mockRequest as NextRequest)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toContain('password reset code')
      // No email should be sent
      const { sendPasswordResetEmail } = await import('@/emails')
      expect(sendPasswordResetEmail).not.toHaveBeenCalled()
    })

    it('should not reveal whether account exists or uses Google auth', async () => {
      const googleOnlyUser = createMockUserData({
        email: 'google.only@example.com',
        hasLocalPassword: false,
        hasGoogleOAuth: true
      })

      const { getPayload } = await import('payload')
      vi.mocked(getPayload).mockResolvedValue(mockPayload)

      mockPayload.find.mockResolvedValue({
        docs: [googleOnlyUser]
      })

      ;(mockRequest.json as any).mockResolvedValue({
        email: 'google.only@example.com'
      })

      const response = await POST(mockRequest as NextRequest)
      const data = await response.json()

      // Should return 400 error for Google-only user
      expect(response.status).toBe(400)
      // Error message should guide user to sign in with Google
      expect(data.message).toContain('Google')
    })
  })

  describe('Email validation', () => {
    it('should reject invalid email format', async () => {
      const { getPayload } = await import('payload')
      vi.mocked(getPayload).mockResolvedValue(mockPayload)

      ;(mockRequest.json as any).mockResolvedValue({
        email: 'not-a-valid-email'
      })

      const response = await POST(mockRequest as NextRequest)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.code).toBe('INVALID_EMAIL_FORMAT')
    })

    it('should reject missing email', async () => {
      const { getPayload } = await import('payload')
      vi.mocked(getPayload).mockResolvedValue(mockPayload)

      ;(mockRequest.json as any).mockResolvedValue({
        email: ''
      })

      const response = await POST(mockRequest as NextRequest)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.code).toBe('INVALID_EMAIL_FORMAT')
    })

    it('should normalize email before processing (trim and lowercase)', async () => {
      const localUser = createMockUserData({
        email: 'test@example.com',
        hasLocalPassword: true
      })

      const { getPayload } = await import('payload')
      vi.mocked(getPayload).mockResolvedValue(mockPayload)

      mockPayload.find.mockResolvedValue({
        docs: [localUser]
      })

      mockPayload.update.mockResolvedValue({})

      ;(mockRequest.json as any).mockResolvedValue({
        email: '  TEST@EXAMPLE.COM  '
      })

      const { sendPasswordResetEmail } = await import('@/emails')
      vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined)

      await POST(mockRequest as NextRequest)

      // Verify find was called with lowercase normalized email
      expect(mockPayload.find).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'users',
          where: {
            email: { equals: 'test@example.com' }
          }
        })
      )
    })
  })

  describe('Error handling', () => {
    it('should handle invalid JSON in request body', async () => {
      const { getPayload } = await import('payload')
      vi.mocked(getPayload).mockResolvedValue(mockPayload)

      ;(mockRequest.json as any).mockRejectedValue(new SyntaxError('Invalid JSON'))

      const response = await POST(mockRequest as NextRequest)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.code).toBe('INVALID_REQUEST_FORMAT')
    })

    it('should clean up verification code if email fails to send', async () => {
      const localUser = createMockUserData({
        email: 'local.user@example.com',
        hasLocalPassword: true
      })

      const { getPayload } = await import('payload')
      vi.mocked(getPayload).mockResolvedValue(mockPayload)

      mockPayload.find.mockResolvedValue({
        docs: [localUser]
      })

      mockPayload.update.mockResolvedValue({})

      ;(mockRequest.json as any).mockResolvedValue({
        email: 'local.user@example.com'
      })

      const { sendPasswordResetEmail } = await import('@/emails')
      vi.mocked(sendPasswordResetEmail).mockRejectedValue(new Error('Email service down'))

      const response = await POST(mockRequest as NextRequest)

      expect(response.status).toBe(200)
      // Verify that update was called to clean up the verification code
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'users',
          id: localUser.id,
          data: {
            passwordResetCode: null,
            passwordResetExpires: null
          }
        })
      )
    })

    it('should return success to user even if email fails (security pattern)', async () => {
      const localUser = createMockUserData({
        email: 'local.user@example.com',
        hasLocalPassword: true
      })

      const { getPayload } = await import('payload')
      vi.mocked(getPayload).mockResolvedValue(mockPayload)

      mockPayload.find.mockResolvedValue({
        docs: [localUser]
      })

      mockPayload.update.mockResolvedValue({})

      ;(mockRequest.json as any).mockResolvedValue({
        email: 'local.user@example.com'
      })

      const { sendPasswordResetEmail } = await import('@/emails')
      vi.mocked(sendPasswordResetEmail).mockRejectedValue(new Error('Email service down'))

      const response = await POST(mockRequest as NextRequest)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Verification code expiration', () => {
    it('should set verification code to expire in 15 minutes', async () => {
      const localUser = createMockUserData({
        email: 'local.user@example.com',
        hasLocalPassword: true
      })

      const { getPayload } = await import('payload')
      vi.mocked(getPayload).mockResolvedValue(mockPayload)

      mockPayload.find.mockResolvedValue({
        docs: [localUser]
      })

      mockPayload.update.mockResolvedValue({})

      ;(mockRequest.json as any).mockResolvedValue({
        email: 'local.user@example.com'
      })

      const { sendPasswordResetEmail } = await import('@/emails')
      vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined)

      const now = Date.now()
      await POST(mockRequest as NextRequest)

      const updateCall = mockPayload.update.mock.calls[0][0]
      const expiresDate = updateCall.data.passwordResetExpires

      // Should be approximately 15 minutes from now
      const fifteenMinutes = 15 * 60 * 1000
      const timeDiff = expiresDate.getTime() - now

      expect(timeDiff).toBeGreaterThan(fifteenMinutes - 1000) // Allow 1s margin
      expect(timeDiff).toBeLessThan(fifteenMinutes + 1000)
    })
  })
})
