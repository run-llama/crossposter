import { signIn } from 'next-auth/react'
import { BlueskyConnectModal } from './BlueskyConnectModal'
import { FaTwitter, FaLinkedin } from 'react-icons/fa'
import { SiBluesky } from 'react-icons/si'
import styles from './AuthButtons.module.css'
import { SignOutButton } from '@/components/SignOutButton'

export function AuthButtons({
  user, 
  setUser,
  isBlueskyModalOpen, 
  setIsBlueskyModalOpen,
  dialogRef,
  selectedPlatform,
  setSelectedPlatform
}: {
  user: any, 
  setUser: (user: any) => void,
  isBlueskyModalOpen: boolean, 
  setIsBlueskyModalOpen: (open: boolean) => void,
  dialogRef: React.RefObject<HTMLDialogElement>,
  selectedPlatform: string | null,
  setSelectedPlatform: (platform: string | null) => void
}) {

  const handleDeauthorize = async (platform: string) => {
    setSelectedPlatform(platform);
    dialogRef.current?.showModal();
  };

  const handleConfirmDeauthorize = async () => {
    if (selectedPlatform) {
      const formData = new FormData();
      formData.append('provider', selectedPlatform);
      const response = await fetch(`/api/user/delete-token`, {
        method: 'POST',
        body: formData
      });
      const result = await response.json();
      console.log("Result", result)
      setUser(result)
    }
    dialogRef.current?.close();
  };

  const providerConfig = {
    'twitter': {
      name: "Twitter",
      icon: <FaTwitter className={styles.icon} />
    },
    'linkedin': {
      name: "LinkedIn",
      icon: <FaLinkedin className={styles.icon} />
    },
  };

  return (
    <div className={styles.container}>
      <div className={styles.iconRow}>
        {Object.entries(providerConfig).map(([provider, config]) => {
          const tokenField = `${provider}_token` as keyof typeof user;
          return user && user[tokenField] ? (
            <div 
              key={provider} 
              className={styles.connectedIcon}
              onClick={() => handleDeauthorize(provider)}
              style={{ cursor: 'pointer' }}
            >
              {config.icon}
            </div>
          ) : (
            <button key={provider} onClick={() => signIn(provider)} className={styles.disconnectedIcon}>
              {config.icon} Connect {config.name}
            </button>
          );
        })}      
        {user && user['bluesky_token'] ? (
          <div 
            key="bluesky" 
            className={styles.connectedIcon}
            onClick={() => handleDeauthorize('bluesky')}
            style={{ cursor: 'pointer' }}
          >
            <SiBluesky className={styles.icon} />
          </div>
        ) : (
          <button key="bluesky" onClick={() => setIsBlueskyModalOpen(true)} className={styles.disconnectedIcon}>
            <SiBluesky className={styles.icon} /> Connect Bluesky
          </button>
        )}
        <div className={styles.signOutButton}>
          <SignOutButton />
        </div>
      </div>
      
      <dialog ref={dialogRef} className={styles.dialog}>
        <p>De-authorize {selectedPlatform}?</p>
        <div className={styles.dialogButtons}>
          <button onClick={() => dialogRef.current?.close()}>No</button>
          <button onClick={handleConfirmDeauthorize}>Yes</button>
        </div>
      </dialog>

      <BlueskyConnectModal 
        isOpen={isBlueskyModalOpen}
        onClose={() => setIsBlueskyModalOpen(false)}
      />
    </div>
  )
}
