import { Suspense } from 'react'

function AuthErrorContent() {
  return (
    <div style={{
      maxWidth: '500px',
      margin: '100px auto',
      padding: '40px',
      textAlign: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      lineHeight: '1.6'
    }}>
      <h1 style={{ color: '#dc2626', marginBottom: '20px' }}>
        Authentication Error
      </h1>
      
      <div style={{ 
        backgroundColor: '#fef2f2', 
        border: '1px solid #fecaca', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '30px' 
      }}>
        <h2 style={{ color: '#991b1b', marginBottom: '10px' }}>
          Admin Account Detected
        </h2>
        <p style={{ color: '#7f1d1d', margin: 0 }}>
          For security reasons, administrator accounts cannot use Google OAuth login.
        </p>
      </div>

      <div style={{ marginBottom: '30px' }}>
        <h3 style={{ marginBottom: '15px' }}>How to Sign In:</h3>
        <p style={{ marginBottom: '15px' }}>
          Please use the direct admin login with your email and password.
        </p>
      </div>

      <a 
        href="/admin/login"
        style={{
          display: 'inline-block',
          backgroundColor: '#2563eb',
          color: 'white',
          padding: '12px 24px',
          textDecoration: 'none',
          borderRadius: '6px',
          fontWeight: '500',
          marginRight: '10px'
        }}
      >
        Go to Admin Login
      </a>

      <a 
        href="/"
        style={{
          display: 'inline-block',
          backgroundColor: '#6b7280',
          color: 'white',
          padding: '12px 24px',
          textDecoration: 'none',
          borderRadius: '6px',
          fontWeight: '500'
        }}
      >
        Back to Home
      </a>

      <div style={{ 
        marginTop: '40px', 
        padding: '20px', 
        backgroundColor: '#f9fafb', 
        borderRadius: '8px',
        fontSize: '14px',
        color: '#6b7280'
      }}>
        <p><strong>Why this restriction?</strong></p>
        <p>
          This security measure prevents admin account compromise through OAuth vulnerabilities 
          and ensures all administrative access goes through our secure direct login system.
        </p>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AuthErrorContent />
    </Suspense>
  )
}