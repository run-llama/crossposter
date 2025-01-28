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
  linkedInOrgDialogRef,
  selectedPlatform,
  setSelectedPlatform,
  linkedInOrganization,
  setLinkedInOrganization
}: {
  user: any, 
  setUser: (user: any) => void,
  isBlueskyModalOpen: boolean, 
  setIsBlueskyModalOpen: (open: boolean) => void,
  dialogRef: React.RefObject<HTMLDialogElement>,
  linkedInOrgDialogRef: React.RefObject<HTMLDialogElement>,
  selectedPlatform: string | null,
  setSelectedPlatform: (platform: string | null) => void,
  linkedInOrganization: string | null,
  setLinkedInOrganization: (organization: string | null) => void
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

  const handleSetLinkedInOrg = async () => {
    const input = document.querySelector<HTMLInputElement>('#linkedin-org-input');
    if (input) {
      const formData = new FormData();
      formData.append('organization', input.value);
      const response = await fetch('/api/user/set-linkedin-organization', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();
      console.log("Result", result)
      setLinkedInOrganization(result.linkedin_company);
    }
    linkedInOrgDialogRef.current?.close();
  };

  const modifyLinkedInOrganization = () => {
    linkedInOrgDialogRef.current?.showModal();
  };

  return (
    <div className={styles.container}>
      <div className={styles.iconRow}>
        {user && user['twitter_token'] ? (
          <div 
            key="twitter" 
            className={styles.connectedIcon}
            onClick={() => handleDeauthorize('twitter')}
            style={{ cursor: 'pointer' }}
          >
            <FaTwitter className={styles.icon} />
          </div>
        ) : (
          <button key="twitter" onClick={() => signIn('twitter')} className={styles.disconnectedIcon}>
            <FaTwitter className={styles.icon} /> Connect Twitter
          </button>
        )}
        {user && user['linkedin_token'] ? (
          <div 
            key="linkedin" 
            className={styles.connectedIcon}
          >
            <FaLinkedin className={styles.icon} onClick={() => handleDeauthorize('linkedin')}
            style={{ cursor: 'pointer' }} />
            <div id={styles.linkedInOrganization}> as <span 
              id={styles.linkedInOrganizationName}
              onClick={() => modifyLinkedInOrganization()}
            >{linkedInOrganization || "yourself"}</span></div>
          </div>
        ) : (
          <button key="linkedin" onClick={() => signIn('linkedin')} className={styles.disconnectedIcon}>
            <FaLinkedin className={styles.icon} /> Connect LinkedIn
          </button>
        )}
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

      <dialog ref={linkedInOrgDialogRef} className={styles.dialog}>
        <div>
          <label htmlFor="linkedin-org-input">Organization vanity name:</label>
          <input type="text" id="linkedin-org-input" />
        </div>
        <div className={styles.dialogButtons}>
          <button onClick={() => linkedInOrgDialogRef.current?.close()}>Cancel</button>
          <button onClick={handleSetLinkedInOrg}>Set</button>
        </div>
      </dialog>

      <BlueskyConnectModal 
        isOpen={isBlueskyModalOpen}
        onClose={() => setIsBlueskyModalOpen(false)}
      />
    </div>
  )
}
