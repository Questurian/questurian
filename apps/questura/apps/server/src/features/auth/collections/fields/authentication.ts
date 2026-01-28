import type { Field } from 'payload'

export const authenticationFields: Field[] = [
  {
    name: 'authProvider',
    type: 'select',
    options: [
      { label: 'Password Only', value: 'local' },
      { label: 'Google Only', value: 'google' },
      { label: 'Password + Google', value: 'dual' },
    ],
    defaultValue: 'local',
    admin: {
      readOnly: true,
      description: 'Available authentication methods - updated automatically when user adds/removes auth methods',
    },
  },
  {
    type: 'row',
    fields: [
      {
        name: 'hasLocalPassword',
        type: 'checkbox',
        defaultValue: false,
        admin: {
          readOnly: true,
          description: 'User has password authentication enabled',
        },
      },
      {
        name: 'hasGoogleOAuth',
        type: 'checkbox',
        defaultValue: false,
        admin: {
          readOnly: true,
          description: 'User has Google OAuth linked to account',
        },
      },
    ],
  },
  {
    name: 'oauthId',
    type: 'text',
    admin: {
      readOnly: true,
      description: 'Google OAuth user ID (unique identifier from Google)',
      condition: (data) => data?.hasGoogleOAuth,
    },
  },
  {
    type: 'row',
    fields: [
      {
        name: 'passwordSetAt',
        type: 'date',
        admin: {
          readOnly: true,
          description: 'When password was last changed',
          condition: (data) => data?.hasLocalPassword,
        },
      },
      {
        name: 'googleLinkedAt',
        type: 'date',
        admin: {
          readOnly: true,
          description: 'When Google OAuth was first connected',
          condition: (data) => data?.hasGoogleOAuth,
        },
      },
    ],
  },
  {
    name: 'tokenVersion',
    type: 'number',
    defaultValue: 0,
    required: true,
    saveToJWT: true,
    admin: {
      readOnly: true,
      description: 'Token version for session invalidation - incremented on password change to invalidate all existing sessions',
    },
  },
  {
    type: 'collapsible',
    label: 'Password Change',
    admin: {
      initCollapsed: true,
      condition: (data) => data?.role === 'admin' || data?.passwordChangeCode,
    },
    fields: [
      {
        name: 'passwordChangeCode',
        type: 'text',
        admin: {
          readOnly: true,
          description: '6-digit verification code for password change',
        },
      },
      {
        name: 'passwordChangeExpires',
        type: 'date',
        admin: {
          readOnly: true,
          description: 'When password change code expires (15 minutes)',
        },
      },
    ],
  },
  {
    type: 'collapsible',
    label: 'Email Change',
    admin: {
      initCollapsed: true,
      condition: (data) => data?.role === 'admin' || data?.emailChangeCode,
    },
    fields: [
      {
        name: 'emailChangeCode',
        type: 'text',
        admin: {
          readOnly: true,
          description: '6-digit verification code for email change',
        },
      },
      {
        name: 'emailChangeExpires',
        type: 'date',
        admin: {
          readOnly: true,
          description: 'When email change code expires (15 minutes)',
        },
      },
      {
        name: 'pendingEmail',
        type: 'email',
        admin: {
          readOnly: true,
          description: 'New email address awaiting verification',
        },
      },
    ],
  },
  {
    type: 'collapsible',
    label: 'Email Verification',
    admin: {
      initCollapsed: true,
      condition: (data) => data?.role === 'admin' || !data?.emailVerified || data?.emailVerificationCode,
    },
    fields: [
      {
        name: 'emailVerified',
        type: 'checkbox',
        defaultValue: false,
        saveToJWT: true,
        admin: {
          readOnly: true,
          description: 'Email address has been verified',
        },
      },
      {
        name: 'emailVerificationCode',
        type: 'text',
        admin: {
          readOnly: true,
          description: '6-digit verification code sent to email on signup',
        },
      },
      {
        name: 'emailVerificationExpires',
        type: 'date',
        admin: {
          readOnly: true,
          description: 'When email verification code expires (15 minutes)',
        },
      },
    ],
  },
  {
    type: 'collapsible',
    label: 'Password Reset',
    admin: {
      initCollapsed: true,
      condition: (data) => data?.role === 'admin' || data?.passwordResetCode,
    },
    fields: [
      {
        name: 'passwordResetCode',
        type: 'text',
        admin: {
          readOnly: true,
          description: '6-digit verification code for password reset (forgot password flow)',
        },
      },
      {
        name: 'passwordResetExpires',
        type: 'date',
        admin: {
          readOnly: true,
          description: 'When password reset code expires (15 minutes)',
        },
      },
    ],
  },
]
