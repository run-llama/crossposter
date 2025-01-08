// components/TwitterSignIn.tsx
import { signIn } from 'next-auth/react'

export function TwitterSignIn() {
  return (
    <button
      onClick={() => signIn('twitter')}
    >
      Authorize Twitter
    </button>
  )
}

export function LinkedInSignIn() {
    return (
      <button
        onClick={() => signIn('linkedin')}
      >
        Authorize LinkedIn
      </button>
    )
  }
  