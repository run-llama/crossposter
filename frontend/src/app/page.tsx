"use client";

import { useEffect, useState, useRef } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { AuthButtons } from '@/components/AuthButtons'
import providerNames from '@/util/platformNames'

export default function Home() {
  const { data: session, status } = useSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const linkedInOrgDialogRef = useRef<HTMLDialogElement>(null);
  const [draftText, setDraftText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [user, setUser] = useState(null);
  const [isBlueskyModalOpen, setIsBlueskyModalOpen] = useState(false);
  const [editableDrafts, setEditableDrafts] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [handles, setHandles] = useState<Record<string, string>>();
  const [eventsList, setEventsList] = useState<string[]>([]);
  const [linkedInOrganization, setLinkedInOrganization] = useState<string | null>(null);
  const [twitterPostResult, setTwitterPostResult] = useState<string | null>(null);
  const [linkedinPostResult, setLinkedinPostResult] = useState<string | null>(null);
  const [blueskyPostResult, setBlueskyPostResult] = useState<string | null>(null);
  
  useEffect(() => {
    if (session) {
      const fetchUser = async () => {
        const response = await fetch('/api/user/fetch');
        const userData = await response.json();
        setUser(userData);
        setLinkedInOrganization(userData.linkedin_company);
      };
      fetchUser();
    }
  }, [session]);

  if (status === "loading") {
    return <div>Loading...</div>
  }

  // If not authenticated, show login button
  if (!session) {
    return (
      <div id="main" className="login-container">
        <h1>CrossPoster</h1>
        <p>Please sign in with your LlamaIndex account to continue</p>
        <button onClick={() => signIn('google')}>
          Sign in with Google
        </button>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!draftText) {
      setErrorMessage('Please enter text so we can create drafts.');
      const dialog = document.querySelector('dialog');
      dialog?.showModal();
      return;
    }

    if (!file) {
      setErrorMessage('Please upload an image before creating drafts.');
      const dialog = document.querySelector('dialog');
      dialog?.showModal();
      return;
    }

    const formData = new FormData();
    formData.append('text', draftText);
    formData.append('file', file);

    try {
      // Create EventSource connection
      const eventSource = new EventSource('/api/drafts?' + new URLSearchParams({
        text: draftText,
        ...(file && { fileName: file.name })
      }));

      // Handle incoming events
      setHandles(null)
      setEventsList(["Creating drafts..."]);
    
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        // Check if workflow is complete
        if (data.msg === 'Workflow completed') {
          eventSource.close();
          setEditableDrafts(data.result);
          setHandles(data.handles);
          return
        }       
        
        // otherwise keep the running list of no more than 4 items
        setEventsList(prev => [...prev.slice(-3), data.msg].slice(-4));

      };

      // Handle errors
      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        eventSource.close();
      };
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handlePost = async (platform: string, draft: string) => {
    console.log("File is", file)

    try {
      const formData = new FormData();
      formData.append('text', draft);
      formData.append('platform', platform);
      if (file) {
        formData.append('media', file);
      }

      const response = await fetch(`/api/post`, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      console.log(`Successfully posted to ${platform}`);
      switch(platform) {
        case "twitter":
          setTwitterPostResult(await response.json());
          break;
        case "linkedin":
          setLinkedinPostResult(await response.json());
          break;
        case "bluesky":
          setBlueskyPostResult(await response.json());
          break;
      }

    } catch (error) {
      console.error(`Error posting to ${platform}:`, error);
      setErrorMessage(`Error posting to ${platform}: ${error}`);
      const dialog = document.querySelector('dialog');
      dialog?.showModal();
    }
  };

  return (
    <div id="main">
      <h1>CrossPoster</h1>
      <dialog onClick={(e) => {
        const dialog = document.querySelector('dialog');
        dialog?.close();
      }}>
        <div className="dialog-content">
          <p>{errorMessage}</p>
          <button onClick={(e) => {
            const dialog = document.querySelector('dialog');
            dialog?.close();
          }}>Close</button>
        </div>
      </dialog>
      <AuthButtons 
        user={user}
        setUser={setUser}
        isBlueskyModalOpen={isBlueskyModalOpen} 
        setIsBlueskyModalOpen={setIsBlueskyModalOpen} 
        dialogRef={dialogRef}
        linkedInOrgDialogRef={linkedInOrgDialogRef}
        selectedPlatform={selectedPlatform}
        setSelectedPlatform={setSelectedPlatform}
        linkedInOrganization={linkedInOrganization}
        setLinkedInOrganization={setLinkedInOrganization}
      />
      <div className="createDraftsBox">
        <div className="container">
          <div className="enterText">
            <label htmlFor="text">Enter your draft post</label>
            <textarea 
              id="text" 
              name="text" 
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
            />
          </div>
          <div className="uploadMedia">
            <label htmlFor="media">Upload media</label>
            <div
              id="media"
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('dragover');
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('dragover');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('dragover');
                const newFile = e.dataTransfer.files[0];
                if (newFile.type.startsWith('image/')) {
                  setFile(newFile);
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    const dropZone = document.getElementById('media');
                    if (dropZone) {
                      dropZone.style.backgroundImage = `url(${e.target?.result})`;
                      dropZone.style.backgroundSize = 'contain';
                      dropZone.style.backgroundPosition = 'center';
                      dropZone.style.backgroundRepeat = 'no-repeat';
                    }
                  };
                  reader.readAsDataURL(newFile);
                }
              }}
            >
              {!file && 'Drop file here'}
            </div>
          </div>
        </div>
        <div className="createDraftButton">
          <button onClick={handleSubmit}>
            Create Drafts
          </button>
        </div>
      </div>
      <div className="drafts">
        <div id="draftingEvents">
          {handles ? (
            <div id="foundHandles">
              <h2>Entities were translated to these handles:</h2>
              <div className="platforms">
              {Object.keys(handles).map(
                (platform) => (
                  <div className="platform" key={platform}>
                    <h3>{providerNames[platform]}</h3>
                    {Object.keys(handles[platform]).map((handle) => (
                      <div key={platform + "_" + handle}>{handle}: {handles[platform][handle]}</div>
                    ))}
                  </div>
                )
              )}
              </div>
            </div>
          ) : (
            <ul id="draftingEventsList">
              {eventsList.map((event) => (
                <li key={event}>{event}</li>
              ))}
            </ul>
          )}
        </div>
        <div id="drafts">
          {Object.entries(editableDrafts).map(([platform, draft]) => (
            <div key={platform} className="draft">
              <h3>{providerNames[platform]}</h3>
              <form onSubmit={async (e) => {
                e.preventDefault();
                await handlePost(platform, editableDrafts[platform]);
              }}>
                <div className="draftText">
                  <textarea 
                    name="text"
                    value={editableDrafts[platform] || ''}
                    onChange={(e) => setEditableDrafts(prev => ({
                      ...prev,
                      [platform]: e.target.value
                    }))}
                  />
                  <button type="submit">Post to {providerNames[platform]}</button>
                  {platform === "twitter" && twitterPostResult && (
                    <div>
                      <h4>Posted!</h4>
                      <p><a href={`https://x.com/anybody/status/${twitterPostResult.data.id}`} target="_blank">See tweet</a></p>
                    </div>
                  )}
                  {platform === "linkedin" && linkedinPostResult && (
                    <div>
                      <h4>Posted!</h4>
                      <p><a href={`https://www.linkedin.com/feed/update/${linkedinPostResult.id}`} target="_blank">See post</a></p>
                    </div>
                  )}
                  {platform === "bluesky" && blueskyPostResult && (
                    <div>
                      <h4>Posted!</h4>
                      <p><a href={blueskyPostResult.url} target="_blank">See post</a></p>
                    </div>
                  )}
                </div>
              </form>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
