import { signIn } from 'next-auth/react'
import { BlueskyConnectModal } from './BlueskyConnectModal'

export function AuthButtons({user, isBlueskyModalOpen, setIsBlueskyModalOpen}: {user: any, isBlueskyModalOpen: boolean, setIsBlueskyModalOpen: (open: boolean) => void}) {

  const providerNames = {
    'twitter': "Twitter",
    'linkedin': "LinkedIn",
  };

  return (
    <div className="space-y-4">
      {Object.keys(providerNames).map((provider) => {
        const tokenField = `${provider}_token` as keyof typeof user;
        return user && user[tokenField] ? (
          <div key={provider}>
            {providerNames[provider]} connected
          </div>
        ) : (
          <button key={provider} onClick={() => signIn(provider)}>
            Connect {provider}
          </button>
        );
      })}      
      {user && user['bluesky_token'] ? (
        <div key="bluesky">
          Bluesky connected
        </div>
      ) : (
        <button key="bluesky" onClick={() => setIsBlueskyModalOpen(true)}>Connect Bluesky</button>
      )}
      <BlueskyConnectModal 
        isOpen={isBlueskyModalOpen}
        onClose={() => setIsBlueskyModalOpen(false)}
      />
    </div>
  )
}
