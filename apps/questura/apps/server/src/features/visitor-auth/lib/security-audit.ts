type VisitorAuthAuditEvent = {
  type: 'visitor_auth_staff_email_blocked'
  email: string
  path: string
}

export function auditVisitorAuthSecurityEvent(event: VisitorAuthAuditEvent): void {
  console.warn('Visitor auth security audit:', {
    ...event,
    occurredAt: new Date().toISOString(),
  })
}
