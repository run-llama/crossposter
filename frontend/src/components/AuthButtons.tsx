import { signIn } from 'next-auth/react'

export function AuthButtons({user}: {user: any}) {

  const providerNames = ['twitter', 'linkedin', 'bluesky', 'mastodon'];

  console.log("authbutton user", user);

  return (
    <div className="space-y-4">
      {providerNames.map((provider) => {
        const tokenField = `${provider}_token` as keyof typeof user;
        return user && user[tokenField] ? (
          <div key={provider}>
            {provider} connected
          </div>
        ) : (
          <button key={provider} onClick={() => signIn(provider)}>
            Connect {provider}
          </button>
        );
      })}
    </div>
  )
}
